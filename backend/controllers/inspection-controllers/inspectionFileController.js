/**
 * Files of an inspection: photos / documents / videos of file questions and of status
 * evidence, and signatures.
 *
 *   POST   /api/inspections/:id/files            multipart: field_key, file   (team members, not submitted)
 *   GET    /api/inspections/:id/files/:fileId    stream it (anyone who may see the inspection)
 *   DELETE /api/inspections/:id/files/:fileId    (team members, not submitted)
 *   GET    /api/inspections/:id/files/links      10-minute signed URLs for all its files
 *   GET    /api/inspection-files/:fileId?exp&sig  the file via such a URL (for <img> / <video>)
 *
 * The question decides what is allowed: kinds (accept), how many (max_files) and the
 * size per file (max_size_mb, at most MAX_FILE_MB). Signatures are PNG/JPEG images up to 2 MB.
 * Large files come in pieces through /uploads (see startUpload), so a dropped connection resumes.
 */
const fs = require("fs");
const fsp = require("fs/promises");
const crypto = require("crypto");
const path = require("path");
const { sequelize, Inspection, InspectionFile, InspectionEvent, FormVersion } = require("../../models");
const storage = require("../../services/fileStorage");
const { MAX_FILE_MB, maxFilesOf } = require("../../utils/formDefinition");
const { loadTask } = require("./inspectionAccess");
const { fieldKeysOf } = require("../../services/sectionOpeningService");

const fail = (res, status, message) => res.status(status).json({ success: false, message });
const MB = 1024 * 1024;

const MIME_KINDS = {
  image: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"],
  document: [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/csv",
    "text/plain",
  ],
  video: ["video/mp4", "video/quicktime", "video/webm", "video/3gpp", "video/x-matroska"],
};
// Browsers sometimes send these as application/octet-stream; trust the extension then
const EXT_KINDS = {
  image: [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"],
  document: [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".csv", ".txt"],
  video: [".mp4", ".mov", ".webm", ".3gp", ".mkv"],
};
const KIND_LABEL = { image: "photos", document: "documents", video: "videos" };

const kindOf = (mime, name) => {
  for (const [kind, list] of Object.entries(MIME_KINDS)) if (list.includes(mime)) return kind;
  const ext = path.extname(name || "").toLowerCase();
  for (const [kind, list] of Object.entries(EXT_KINDS)) if (list.includes(ext)) return kind;
  return null;
};

const findField = (definition, key) => {
  for (const s of definition?.sections || []) for (const f of s.fields || []) if (f.key === key) return f;
  return null;
};

const cleanup = (file) => file?.path && fsp.unlink(file.path).catch(() => {});

/** Files of a task for the detail view (no storage paths). */
const listFiles = (inspectionId) =>
  InspectionFile.findAll({
    where: { inspection_id: inspectionId },
    include: [{ association: "uploader", attributes: ["user_id", "full_name"] }],
    order: [["created_at", "ASC"]],
  });

/**
 * Is this upload allowed? The task is open, the user is in its team, the question takes files of this
 * kind, size and number. Throws { status, message }; returns what saving needs.
 */
const checkUpload = async (req, task, rights, { field_key, name, mimetype, size }) => {
  const stop = (status, message) => Object.assign(new Error(message), { status });
  // Submitted: only to questions in sections opened for update
  if (task.status === "submitted" && !rights.update) throw stop(409, "This inspection has been submitted; files can't be added.");
  if (task.status !== "submitted" && !rights.fill) throw stop(403, "Only members of the assigned team can add files.");
  // The version answered: fixed when the first file or answer is saved
  const version = task.form_version_id
    ? await FormVersion.findByPk(task.form_version_id)
    : await FormVersion.findOne({ where: { form_id: task.form_id, status: "published" } });
  if (!version) throw stop(409, "The checklist has no published version.");
  const field = findField(version.definition, String(field_key || ""));
  // A table with a signature column takes signatures too
  const signs = field?.type === "signature" || (field?.type === "table" && (field.columns || []).some((c) => c.type === "signature"));
  if (!field || !(signs || ["photo", "status"].includes(field.type)) || (field.type === "status" && field.evidence === "none")) throw stop(400, "This question doesn't take files.");
  if (task.status === "submitted" && !fieldKeysOf(version.definition, rights.update_sections).has(field.key)) throw stop(409, "This question isn't in a section open for update.");

  const fileName = String(name || "file").slice(0, 255);
  let kind = kindOf(mimetype, fileName);
  if (signs) {
    if (kind !== "image" || size > 2 * MB) throw stop(400, "A signature must be an image under 2 MB.");
    kind = "signature";
  } else {
    const accept = field.accept?.length ? field.accept : ["image"];
    if (!kind || !accept.includes(kind)) throw stop(400, `This question takes ${accept.map((k) => KIND_LABEL[k]).join(", ")} only.`);
    const limitMb = Math.min(field.max_size_mb ?? 20, MAX_FILE_MB);
    if (size > limitMb * MB) throw stop(413, `“${fileName}” is ${(size / MB).toFixed(1)} MB; the limit for this question is ${limitMb} MB.`);
    // Count the files in the saved answer only. Files that reached the server but never made it into
    // the answer (connection lost before saving, a teammate's save, a reload) don't take up room.
    const a = (task.answers || {})[field.key];
    const inAnswer = Array.isArray(a) ? a : Array.isArray(a?.files) ? a.files : [];
    const max = maxFilesOf(field);
    if (inAnswer.length >= max) throw stop(409, `This question takes at most ${max} files. Remove one first.`);
  }
  return { version, field, kind, name: fileName };
};

/** Move a received file into storage and record it (starts the task if it wasn't). */
const storeFile = async (req, task, { version, field, kind, name }, { tempPath, mimetype, size }) => {
  const ext = path.extname(name).toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 10);
  const created = await sequelize.transaction(async (transaction) => {
    if (!task.form_version_id) {
      const now = new Date();
      await task.update({ form_version_id: version.version_id, status: "in_progress", started_at: now, started_by: req.user.user_id }, { transaction });
      await InspectionEvent.create({ inspection_id: task.inspection_id, type: "started", user_id: req.user.user_id }, { transaction });
    }
    const row = InspectionFile.build({
      inspection_id: task.inspection_id,
      field_key: field.key,
      kind,
      original_name: name,
      mime_type: mimetype || "application/octet-stream",
      size_bytes: size,
      uploaded_by: req.user.user_id,
    });
    row.storage_key = `inspections/${task.inspection_id}/${row.file_id}${ext}`;
    await storage.put(tempPath, row.storage_key);
    await row.save({ transaction });
    return row;
  });
  const { storage_key, ...data } = created.get({ plain: true });
  return { ...data, uploader: { user_id: req.user.user_id, full_name: req.user.full_name } };
};

const uploadFile = async (req, res) => {
  const file = req.file;
  try {
    if (!file) return fail(res, 400, "Choose a file to upload.");
    const { task, rights } = await loadTask(req, req.params.id);
    const ok = await checkUpload(req, task, rights, { field_key: req.body.field_key, name: file.originalname, mimetype: file.mimetype, size: file.size });
    const data = await storeFile(req, task, ok, { tempPath: file.path, mimetype: file.mimetype, size: file.size });
    return res.status(201).json({ success: true, data });
  } catch (error) {
    cleanup(file);
    if (error.status) return fail(res, error.status, error.message);
    console.error("uploadFile", error);
    return fail(res, 500, "Failed to upload the file.");
  }
};

/* ---------- large files: sent in pieces, resumable ----------
 *   POST   /api/inspections/:id/uploads                     { field_key, name, type, size } → { upload_id, received, chunk_size }
 *   PUT    /api/inspections/:id/uploads/:uploadId?offset=N  the next piece (raw bytes) → { received }
 *   POST   /api/inspections/:id/uploads/:uploadId/complete  → the saved file
 *   DELETE /api/inspections/:id/uploads/:uploadId           cancel
 * The same user, inspection, question, file name and size give the same upload id, so picking the
 * file again after a dropped connection or a closed page continues where it stopped. Pieces wait in
 * storage/tmp/uploads; unfinished ones are removed after 2 days (cleanOldUploads, hourly).
 */
const UPLOADS = path.join(storage.TMP, "uploads");
fs.mkdirSync(UPLOADS, { recursive: true });
const CHUNK_SIZE = 8 * MB;
const uploadPaths = (id) => {
  if (!/^[a-f0-9]{40}$/.test(id)) throw Object.assign(new Error("Unknown upload."), { status: 404 });
  return { part: path.join(UPLOADS, `${id}.part`), meta: path.join(UPLOADS, `${id}.json`) };
};
const partSize = async (p) => (await fsp.stat(p).catch(() => null))?.size ?? 0;
const readMeta = async (req, id) => {
  const { meta } = uploadPaths(id);
  const m = JSON.parse(await fsp.readFile(meta, "utf8").catch(() => "null"));
  if (!m || m.user_id !== req.user.user_id || m.inspection_id !== req.params.id) throw Object.assign(new Error("Unknown upload."), { status: 404 });
  return m;
};

const startUpload = async (req, res) => {
  try {
    const { task, rights } = await loadTask(req, req.params.id);
    const size = Number(req.body?.size);
    if (!Number.isFinite(size) || size <= 0) return fail(res, 400, "The file is empty.");
    const info = { field_key: req.body?.field_key, name: req.body?.name, mimetype: String(req.body?.type || ""), size };
    await checkUpload(req, task, rights, info);
    const id = crypto.createHash("sha1").update([req.user.user_id, task.inspection_id, info.field_key, info.name, size].join("|")).digest("hex");
    const { part, meta } = uploadPaths(id);
    await fsp.writeFile(meta, JSON.stringify({ user_id: req.user.user_id, inspection_id: task.inspection_id, ...info, started_at: new Date().toISOString() }));
    let received = await partSize(part);
    if (received > size) {
      await fsp.unlink(part).catch(() => {});
      received = 0;
    }
    return res.status(200).json({ success: true, data: { upload_id: id, received, chunk_size: CHUNK_SIZE } });
  } catch (error) {
    if (error.status) return fail(res, error.status, error.message);
    console.error("startUpload", error);
    return fail(res, 500, "Failed to start the upload.");
  }
};

const uploadChunk = async (req, res) => {
  try {
    const { task, rights } = await loadTask(req, req.params.id);
    if (task.status === "submitted" ? !rights.update : !rights.fill) return fail(res, 403, "Files can't be added to this inspection.");
    const m = await readMeta(req, req.params.uploadId);
    const { part } = uploadPaths(req.params.uploadId);
    const received = await partSize(part);
    const offset = Number(req.query.offset);
    // A piece that was already received (a retry) or one sent too early: say where to continue
    if (offset !== received) return res.status(409).json({ success: false, message: "Continue from the received size.", received });
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!body.length) return fail(res, 400, "Empty piece.");
    if (received + body.length > m.size) return fail(res, 400, "More data than the file's size.");
    await fsp.appendFile(part, body);
    return res.status(200).json({ success: true, data: { received: received + body.length } });
  } catch (error) {
    if (error.status) return fail(res, error.status, error.message);
    console.error("uploadChunk", error);
    return fail(res, 500, "Failed to receive the piece.");
  }
};

const completeUpload = async (req, res) => {
  const id = req.params.uploadId;
  try {
    const { task, rights } = await loadTask(req, req.params.id);
    const m = await readMeta(req, id);
    const { part, meta } = uploadPaths(id);
    const received = await partSize(part);
    if (received !== m.size) return res.status(409).json({ success: false, message: "The file isn't complete yet.", received });
    const ok = await checkUpload(req, task, rights, m);
    const data = await storeFile(req, task, ok, { tempPath: part, mimetype: m.mimetype, size: m.size });
    await fsp.unlink(meta).catch(() => {});
    return res.status(201).json({ success: true, data });
  } catch (error) {
    if (error.status) return fail(res, error.status, error.message);
    console.error("completeUpload", error);
    return fail(res, 500, "Failed to save the file.");
  }
};

const cancelUpload = async (req, res) => {
  try {
    await readMeta(req, req.params.uploadId);
    const { part, meta } = uploadPaths(req.params.uploadId);
    await fsp.unlink(part).catch(() => {});
    await fsp.unlink(meta).catch(() => {});
    return res.status(200).json({ success: true, message: "Upload cancelled." });
  } catch (error) {
    if (error.status) return fail(res, error.status, error.message);
    return fail(res, 500, "Failed to cancel the upload.");
  }
};

/** Unfinished uploads older than 2 days are removed (runs with the hourly schedule job). */
const cleanOldUploads = async () => {
  const cutoff = Date.now() - 2 * 24 * 3600e3;
  for (const name of await fsp.readdir(UPLOADS).catch(() => [])) {
    const p = path.join(UPLOADS, name);
    const st = await fsp.stat(p).catch(() => null);
    if (st && st.mtimeMs < cutoff) await fsp.unlink(p).catch(() => {});
  }
};

/* ---------- short-lived links, so <img> / <video> can load a file without the login header ---------- */
const LINK_SECONDS = 10 * 60;
const sign = (fileId, exp) => crypto.createHmac("sha256", `${process.env.JWT_SECRET}:inspection-files`).update(`${fileId}.${exp}`).digest("base64url");

/** GET /api/inspections/:id/files/links — a signed URL for every file of the task (after the access check). */
const getFileLinks = async (req, res) => {
  try {
    const { task } = await loadTask(req, req.params.id);
    const rows = await InspectionFile.findAll({ where: { inspection_id: task.inspection_id }, attributes: ["file_id"] });
    const exp = Math.floor(Date.now() / 1000) + LINK_SECONDS;
    return res.status(200).json({
      success: true,
      data: Object.fromEntries(rows.map((f) => [f.file_id, `/inspection-files/${f.file_id}?exp=${exp}&sig=${sign(f.file_id, exp)}`])),
      meta: { expires_at: new Date(exp * 1000).toISOString() },
    });
  } catch (error) {
    if (error.status) return fail(res, error.status, error.message);
    console.error("getFileLinks", error);
    return fail(res, 500, "Failed to prepare the files.");
  }
};

/** GET /api/inspection-files/:fileId?exp=&sig= — no login; the signature is the permission. */
const serveSignedFile = async (req, res) => {
  try {
    const exp = Number(req.query.exp);
    const sig = String(req.query.sig || "");
    const expected = sign(req.params.fileId, exp);
    if (!exp || exp < Date.now() / 1000 || sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)))
      return fail(res, 403, "This link has expired. Reload the page.");
    const f = await InspectionFile.scope("withStorage").findByPk(req.params.fileId);
    return sendStored(req, res, f);
  } catch (error) {
    console.error("serveSignedFile", error);
    return fail(res, 500, "Failed to fetch the file.");
  }
};

const sendStored = (req, res, f) => {
  if (!f || !storage.exists(f.storage_key)) return fail(res, 404, "File not found.");
  const disposition = req.query.download === "1" ? "attachment" : "inline";
  res.setHeader("Content-Type", f.mime_type);
  res.setHeader("Content-Disposition", `${disposition}; filename*=UTF-8''${encodeURIComponent(f.original_name)}`);
  res.setHeader("Cache-Control", "private, max-age=600");
  res.setHeader("X-Content-Type-Options", "nosniff");
  return res.sendFile(storage.absolutePath(f.storage_key)); // supports Range (video seeking)
};

const downloadFile = async (req, res) => {
  try {
    const { task } = await loadTask(req, req.params.id);
    const f = await InspectionFile.scope("withStorage").findOne({ where: { file_id: req.params.fileId, inspection_id: task.inspection_id } });
    return sendStored(req, res, f);
  } catch (error) {
    if (error.status) return fail(res, error.status, error.message);
    console.error("downloadFile", error);
    return fail(res, 500, "Failed to fetch the file.");
  }
};

const deleteFile = async (req, res) => {
  try {
    const { task, rights } = await loadTask(req, req.params.id);
    if (task.status === "submitted" && !rights.update) return fail(res, 409, "This inspection has been submitted; its files can't be removed.");
    if (task.status !== "submitted" && !rights.fill) return fail(res, 403, "Only members of the assigned team can remove files.");
    const f = await InspectionFile.scope("withStorage").findOne({ where: { file_id: req.params.fileId, inspection_id: task.inspection_id } });
    if (!f) return fail(res, 404, "File not found.");
    // Open for update: files added during the update can be removed; what was submitted is kept
    if (task.status === "submitted" && (!task.submitted_at || new Date(f.created_at) <= new Date(task.submitted_at)))
      return fail(res, 409, "Files sent with the submission are kept. Add a new file instead.");
    await f.destroy();
    await storage.remove(f.storage_key);
    return res.status(200).json({ success: true, message: "File removed." });
  } catch (error) {
    if (error.status) return fail(res, error.status, error.message);
    console.error("deleteFile", error);
    return fail(res, 500, "Failed to remove the file.");
  }
};

/**
 * Keep only file ids that belong to this inspection and to the question they're under.
 * Used whenever answers are saved, so answers can never point at other people's files.
 */
const sanitizeFileRefs = async (inspectionId, definition, answers, transaction) => {
  const files = await InspectionFile.findAll({ where: { inspection_id: inspectionId }, attributes: ["file_id", "field_key"], transaction });
  const owner = new Map(files.map((f) => [f.file_id, f.field_key]));
  const mine = (key) => (id) => typeof id === "string" && owner.get(id) === key;
  const out = { ...answers };
  for (const s of definition.sections || [])
    for (const f of s.fields || []) {
      const a = out[f.key];
      if (a == null) continue;
      if (f.type === "photo") out[f.key] = (Array.isArray(a) ? a : []).filter(mine(f.key));
      else if (f.type === "status" && typeof a === "object") out[f.key] = { ...a, files: (Array.isArray(a.files) ? a.files : []).filter(mine(f.key)) };
      else if (f.type === "signature") {
        const list = (Array.isArray(a) ? a : [a]).filter((x) => x && mine(f.key)(x.file_id)).map((x) => ({ file_id: x.file_id, name: String(x.name ?? "").slice(0, 200) }));
        out[f.key] = f.multiple ? list : list[0] ?? null;
      } else if (f.type === "table" && Array.isArray(a?.rows)) {
        // Signature cells: only this question's own files
        const signCols = (f.columns || []).filter((c) => c.type === "signature").map((c) => c.key);
        if (signCols.length)
          out[f.key] = {
            ...a,
            rows: a.rows.map((r) => {
              const cells = { ...(r?.cells || {}) };
              for (const k of signCols) if (cells[k] && !mine(f.key)(cells[k])) delete cells[k];
              return { ...r, cells };
            }),
          };
      }
    }
  return out;
};

/** After submitting: delete files that no answer uses (removed from a question but not deleted). */
const removeUnusedFiles = async (inspection) => {
  const used = new Set();
  for (const a of Object.values(inspection.answers || {})) {
    if (Array.isArray(a)) a.forEach((x) => used.add(typeof x === "string" ? x : x?.file_id));
    else if (a && typeof a === "object") {
      if (Array.isArray(a.files)) a.files.forEach((x) => used.add(x));
      if (a.file_id) used.add(a.file_id);
      // Table cells (signature columns hold file ids)
      if (Array.isArray(a.rows)) a.rows.forEach((r) => Object.values(r?.cells || {}).forEach((v) => typeof v === "string" && used.add(v)));
    }
  }
  const files = await InspectionFile.scope("withStorage").findAll({ where: { inspection_id: inspection.inspection_id } });
  for (const f of files)
    if (!used.has(f.file_id)) {
      await f.destroy();
      await storage.remove(f.storage_key).catch(() => {});
    }
};

module.exports = {
  startUpload,
  uploadChunk,
  completeUpload,
  cancelUpload,
  cleanOldUploads, uploadFile, downloadFile, getFileLinks, serveSignedFile, deleteFile, listFiles, sanitizeFileRefs, removeUnusedFiles, MIME_KINDS };
