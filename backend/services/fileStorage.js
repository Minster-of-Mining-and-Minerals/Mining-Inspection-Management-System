/**
 * Where inspection files are kept. Disk for now (FILE_STORAGE_DIR, default backend/storage);
 * everything goes through these functions so cloud storage (S3 / MinIO) can replace it later.
 * The folder is not served publicly: files are streamed by the API after an access check.
 */
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

// Not backend/uploads: that folder is served publicly at /uploads
const ROOT = path.resolve(process.env.FILE_STORAGE_DIR || path.join(__dirname, "..", "storage"));
const TMP = path.join(ROOT, "tmp");
fs.mkdirSync(TMP, { recursive: true });

/** Absolute path of a stored file; refuses keys that would leave the upload folder. */
const absolutePath = (key) => {
  const p = path.resolve(ROOT, key);
  if (!p.startsWith(ROOT + path.sep)) throw new Error("Invalid storage key.");
  return p;
};

/** Move an uploaded temp file into storage under `key`. */
const put = async (tempPath, key) => {
  const dest = absolutePath(key);
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  try {
    await fsp.rename(tempPath, dest);
  } catch {
    await fsp.copyFile(tempPath, dest); // different disk
    await fsp.unlink(tempPath).catch(() => {});
  }
  return key;
};

const remove = async (key) => {
  await fsp.unlink(absolutePath(key)).catch((e) => {
    if (e.code !== "ENOENT") throw e;
  });
};

const exists = (key) => fs.existsSync(absolutePath(key));

module.exports = { ROOT, TMP, absolutePath, put, remove, exists };
