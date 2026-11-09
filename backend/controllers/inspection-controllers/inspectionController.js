const { Op, QueryTypes, literal } = require("sequelize");
const { validate: isUuid } = require("uuid");
const {
  sequelize,
  Inspection,
  InspectionEvent,
  InspectionSchedule,
  Form,
  FormVersion,
  CompanyLicense,
  Company,
  Team,
  TeamMember,
  User,
  Mineral,
  AdminArea,
} = require("../../models");
const { currentMembership } = require("../../services/teamMembershipService");
const { validateAnswers, scoreOf, visibleStructure } = require("../../utils/formAnswers");
const { likeContains } = require("../../utils/search");

const fail = (res, status, message, extra) => res.status(status).json({ success: false, message, ...extra });
const { can, myTeamId, loadTask } = require("./inspectionAccess");
const { listFiles, sanitizeFileRefs, removeUnusedFiles } = require("./inspectionFileController");
const { placeOf } = require("../../services/placeService");

const LIST_INCLUDE = [
  { model: Company, as: "company", attributes: ["company_id", "name", "name_am"] },
  { model: CompanyLicense, as: "license", attributes: ["license_id", "license_number", "license_type", "site_name"] },
  { model: Team, as: "team", attributes: ["team_id", "name", "code"] },
  { model: Form, as: "form", attributes: ["form_id", "name", "name_am", "code"] },
  { model: InspectionSchedule, as: "schedule", attributes: ["schedule_id", "name", "frequency"] },
  { model: User, as: "submitter", attributes: ["user_id", "full_name"] },
];
const LIST_ATTRS = { exclude: ["answers", "submit_device", "submit_ip"] };

/** The task as lists show it. "overdue" = not submitted and past its due time. */
const summary = (i) => {
  const p = i.get ? i.get({ plain: true }) : i;
  return { ...p, is_overdue: p.status !== "submitted" && new Date(p.due_at) < new Date() };
};

const STATUS_FILTERS = {
  todo: { status: "todo" },
  in_progress: { status: "in_progress" },
  open: { status: { [Op.ne]: "submitted" } },
  submitted: { status: "submitted" },
  late: { status: "submitted", is_late: true },
  overdue: () => ({ status: { [Op.ne]: "submitted" }, due_at: { [Op.lt]: new Date() } }),
  no_team: { team_id: null, status: { [Op.ne]: "submitted" } },
  on_time: { status: "submitted", is_late: false },
  returned: { return_count: { [Op.gt]: 0 } },
};
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const localDay = (col) => `("Inspection"."${col}" AT TIME ZONE 'Africa/Addis_Ababa')::date`;

/* =================== lists =================== */

/** All tasks (inspections:read_all), or the user's team's tasks (read_own). */
const getInspections = async (req, res) => {
  try {
    const where = {};
    const q = req.query;
    if (!can(req, "read_all")) {
      const team = await myTeamId(req);
      if (!team) return res.status(200).json({ success: true, data: [], meta: { totalItems: 0, totalPages: 0, currentPage: 1, itemsPerPage: 50 } });
      where.team_id = team;
    } else if (q.team_id && isUuid(q.team_id)) where.team_id = q.team_id;
    if (q.schedule_id && isUuid(q.schedule_id)) where.schedule_id = q.schedule_id;
    if (q.license_id && isUuid(q.license_id)) where.license_id = q.license_id;
    if (q.company_id && isUuid(q.company_id)) where.company_id = q.company_id;
    if (q.occurrence_date && /^\d{4}-\d{2}-\d{2}$/.test(q.occurrence_date)) where.occurrence_date = q.occurrence_date;
    const f = STATUS_FILTERS[q.status];
    if (f) Object.assign(where, typeof f === "function" ? f() : f);
    // Dashboard drill-down: form, inspector, license type, region, and a date range
    // on the submission day (date_field=submitted, the default) or the round day (date_field=assigned)
    if (q.form_id && isUuid(q.form_id)) where.form_id = q.form_id;
    if (q.submitted_by && isUuid(q.submitted_by)) where.submitted_by = q.submitted_by;
    const and = [];
    if (["exploration", "mining"].includes(q.license_type)) where["$license.license_type$"] = q.license_type;
    if (q.region_id && isUuid(q.region_id)) {
      and.push(
        literal(`EXISTS (SELECT 1 FROM license_areas la JOIN admin_areas a ON a.area_id = la.area_id
                 LEFT JOIN admin_areas p ON p.area_id = a.parent_id LEFT JOIN admin_areas g ON g.area_id = p.parent_id
                 WHERE la.license_id = "Inspection"."license_id" AND '${q.region_id}' IN (a.area_id, p.area_id, g.area_id))`),
      );
    }
    const dayCol = q.date_field === "assigned" ? null : "submitted_at";
    for (const [param, op] of [
      ["from", ">="],
      ["to", "<="],
    ]) {
      if (!DAY.test(q[param] || "")) continue;
      and.push(literal(dayCol ? `${localDay(dayCol)} ${op} '${q[param]}'` : `"Inspection"."occurrence_date" ${op} '${q[param]}'`));
    }
    if (and.length) where[Op.and] = and;
    if (q.search?.trim()) {
      const term = likeContains(q.search);
      where[Op.or] = [{ "$company.name$": { [Op.iLike]: term } }, { "$license.license_number$": { [Op.iLike]: term } }];
    }
    const limit = Math.min(200, Math.max(1, parseInt(q.limit, 10) || 50));
    const page = Math.max(1, parseInt(q.page, 10) || 1);
    const { rows, count } = await Inspection.findAndCountAll({
      where,
      include: LIST_INCLUDE,
      attributes: LIST_ATTRS,
      order:
        q.sort === "score"
          ? [[literal('"Inspection"."score" IS NULL'), "ASC"], ["score", "ASC"], ["submitted_at", "DESC"]]
          : q.status === "submitted" || q.status === "late" || q.status === "on_time"
            ? [["submitted_at", "DESC"]]
            : [
                ["occurrence_date", "DESC"],
                [{ model: Company, as: "company" }, "name", "ASC"],
              ],
      limit,
      offset: (page - 1) * limit,
      distinct: true,
    });
    return res.status(200).json({ success: true, data: rows.map(summary), meta: { totalItems: count, totalPages: Math.ceil(count / limit), currentPage: page, itemsPerPage: limit } });
  } catch (error) {
    console.error("getInspections", error);
    return fail(res, 500, "Failed to fetch inspections.");
  }
};

/** Region / zone / woreda names of licenses: Map(license_id -> { region, zone, woreda }) */
const areasOf = async (licenseIds) => {
  const out = new Map();
  if (!licenseIds.length) return out;
  const rows = await sequelize.query(
    `SELECT la.license_id, a.level, a.name FROM license_areas la JOIN admin_areas a ON a.area_id = la.area_id WHERE la.license_id IN (:ids) ORDER BY a.name`,
    { replacements: { ids: [...new Set(licenseIds)] }, type: QueryTypes.SELECT },
  );
  for (const r of rows) {
    if (!out.has(r.license_id)) out.set(r.license_id, { region: [], zone: [], woreda: [] });
    out.get(r.license_id)[r.level]?.push(r.name);
  }
  const joined = new Map();
  for (const [id, a] of out) joined.set(id, { region: a.region.join(", ") || null, zone: a.zone.join(", ") || null, woreda: a.woreda.join(", ") || null });
  return joined;
};

/** Answered / total questions of started tasks: Map(inspection_id -> { answered, total }) */
const progressOf = async (tasks) => {
  const started = tasks.filter((t) => t.status === "in_progress" && t.form_version_id);
  const out = new Map();
  if (!started.length) return out;
  const [answers, versions] = await Promise.all([
    Inspection.findAll({ where: { inspection_id: started.map((t) => t.inspection_id) }, attributes: ["inspection_id", "answers"] }),
    FormVersion.findAll({ where: { version_id: [...new Set(started.map((t) => t.form_version_id))] }, attributes: ["version_id", "definition"] }),
  ]);
  const defs = new Map(versions.map((v) => [v.version_id, v.definition]));
  const ans = new Map(answers.map((a) => [a.inspection_id, a.answers || {}]));
  const filled = (v) => v != null && v !== "" && !(Array.isArray(v) && !v.length) && !(typeof v === "object" && !Array.isArray(v) && ("value" in v ? !v.value : "rows" in v ? !v.rows?.length : false));
  for (const t of started) {
    const def = defs.get(t.form_version_id);
    if (!def) continue;
    const a = ans.get(t.inspection_id) || {};
    const fields = visibleStructure(def, t.license?.license_type, a)
      .flatMap((s) => s.fields)
      .filter((f) => f.type !== "photo" && f.type !== "signature");
    out.set(t.inspection_id, { answered: fields.filter((f) => filled(a[f.key])).length, total: fields.length });
  }
  return out;
};

/**
 * The signed-in inspector's team tasks. Each open task is in exactly one group:
 * returned (sent back for correction) › overdue › in_progress › todo. Plus the submitted ones.
 * Every task carries its license's region / zone and, once started, how much is answered.
 */
const getMyTasks = async (req, res) => {
  try {
    const membership = await currentMembership(req.user.user_id);
    const empty = { returned: 0, overdue: 0, in_progress: 0, todo: 0, open: 0, submitted: 0 };
    if (!membership) return res.status(200).json({ success: true, data: { team: null, todo: [], submitted: [], counts: empty } });
    const teamId = membership.team_id;
    const [open, submitted, submittedCount] = await Promise.all([
      Inspection.findAll({ where: { team_id: teamId, status: { [Op.ne]: "submitted" } }, include: LIST_INCLUDE, attributes: LIST_ATTRS, order: [["due_at", "ASC"]], limit: 500 }),
      Inspection.findAll({ where: { team_id: teamId, status: "submitted" }, include: LIST_INCLUDE, attributes: LIST_ATTRS, order: [["submitted_at", "DESC"]], limit: Math.min(500, parseInt(req.query.submitted_limit, 10) || 100) }),
      Inspection.count({ where: { team_id: teamId, status: "submitted" } }),
    ]);
    const all = [...open, ...submitted];
    const [areas, progress] = await Promise.all([areasOf(all.map((t) => t.license_id)), progressOf(open)]);
    const enrich = (t) => {
      const s = summary(t);
      const group = s.status === "submitted" ? "submitted" : s.status === "in_progress" && s.return_count > 0 ? "returned" : s.is_overdue ? "overdue" : s.status;
      return { ...s, group, area: areas.get(s.license_id) ?? null, progress: progress.get(s.inspection_id) ?? null };
    };
    const openRows = open.map(enrich);
    const counts = { ...empty, open: openRows.length, submitted: submittedCount };
    for (const t of openRows) counts[t.group]++;
    return res.status(200).json({
      success: true,
      data: { team: membership.team, role: membership.role, todo: openRows, submitted: submitted.map(enrich), counts },
    });
  } catch (error) {
    console.error("getMyTasks", error);
    return fail(res, 500, "Failed to fetch your tasks.");
  }
};

/** Submitted inspections of one license over time. */
const getLicenseHistory = async (req, res) => {
  try {
    if (!isUuid(req.params.licenseId)) return fail(res, 400, "Invalid license id.");
    const where = { license_id: req.params.licenseId, status: "submitted" };
    if (!can(req, "read_all")) {
      const team = await myTeamId(req);
      if (!team) return fail(res, 403, "You are not in a team.");
      where.team_id = team;
    }
    const rows = await Inspection.findAll({ where, include: LIST_INCLUDE, attributes: LIST_ATTRS, order: [["submitted_at", "DESC"]], limit: 200 });
    return res.status(200).json({ success: true, data: rows.map(summary) });
  } catch (error) {
    console.error("getLicenseHistory", error);
    return fail(res, 500, "Failed to fetch the license history.");
  }
};

/* =================== one task =================== */

/** Values that "prefill" questions start with (company name, license number …). */
const prefillValues = async (inspection) => {
  const license = await CompanyLicense.findByPk(inspection.license_id, {
    include: [
      { model: Company, as: "company" },
      { model: Mineral, as: "minerals", attributes: ["name"], through: { attributes: [] } },
      { model: AdminArea, as: "areas", attributes: ["name", "level"], through: { attributes: [] } },
    ],
  });
  const members = inspection.team_id
    ? await TeamMember.findAll({ where: { team_id: inspection.team_id, left_on: null }, include: [{ model: User, as: "user", attributes: ["full_name"] }], order: [["role", "ASC"]] })
    : [];
  const areas = (level) => (license?.areas || []).filter((a) => a.level === level).map((a) => a.name);
  return {
    "company.name": license?.company?.name ?? "",
    "company.contact_person": license?.company?.contact_person ?? "",
    "license.license_number": license?.license_number ?? "",
    "license.license_type": license?.license_type === "mining" ? "Mining" : license?.license_type === "exploration" ? "Exploration" : "",
    "license.minerals": license?.minerals?.length ? license.minerals.map((m) => m.name).join(", ") : license?.mineral_text ?? "",
    "license.region": areas("region").join(", "),
    "license.zone_woreda": [...areas("zone"), ...areas("woreda")].join(", "),
    "license.site_name": license?.site_name ?? "",
    "inspection.date": new Date().toISOString().slice(0, 10),
    "inspection.team": members.map((m) => m.user?.full_name).filter(Boolean).join(", "),
  };
};

/** The version answered (or, before starting, the form's current version). */
const versionFor = async (task, transaction) =>
  task.form_version_id
    ? FormVersion.findByPk(task.form_version_id, { transaction })
    : FormVersion.findOne({ where: { form_id: task.form_id, status: "published" }, transaction });

const sendError = (res, error, fallback) => {
  if (error.status) return fail(res, error.status, error.message, error.extra);
  console.error(fallback, error);
  return fail(res, 500, fallback);
};

const getInspectionById = async (req, res) => {
  try {
    const { task, rights } = await loadTask(req, req.params.id);
    const full = await Inspection.findByPk(task.inspection_id, {
      include: [
        ...LIST_INCLUDE,
        { model: User, as: "lastSaver", attributes: ["user_id", "full_name"] },
        { model: InspectionEvent, as: "events", include: [{ model: User, as: "user", attributes: ["user_id", "full_name"] }] },
      ],
      order: [[{ model: InspectionEvent, as: "events" }, "created_at", "ASC"]],
    });
    const version = await versionFor(task);
    const data = summary(full);
    if (!can(req, "read_all")) delete data.submit_ip;
    return res.status(200).json({
      success: true,
      data: {
        ...data,
        version: version ? { version_id: version.version_id, version_number: version.version_number, definition: version.definition } : null,
        prefill: task.status === "submitted" ? {} : await prefillValues(task),
        files: await listFiles(task.inspection_id),
        can: rights,
      },
    });
  } catch (error) {
    return sendError(res, error, "Failed to fetch the inspection.");
  }
};

/** Keep only answers to questions of the version. */
const cleanAnswers = (definition, answers) => {
  const keys = new Set((definition.sections || []).flatMap((s) => (s.fields || []).map((f) => f.key)));
  return Object.fromEntries(Object.entries(answers || {}).filter(([k]) => keys.has(k)));
};

/**
 * Save answers (team members). The first save fixes the form version.
 * `base_saved_at` = when the user's copy was loaded/saved; if a teammate saved after that, 409.
 */
const saveAnswersInternal = async (req, task, transaction) => {
  const version = await versionFor(task, transaction);
  if (!version) throw Object.assign(new Error("The form has no published version."), { status: 409 });
  const base = req.body.base_saved_at ? new Date(req.body.base_saved_at) : null;
  if (task.last_saved_at && task.last_saved_by !== req.user.user_id && (!base || task.last_saved_at > base)) {
    const who = await User.findByPk(task.last_saved_by, { attributes: ["full_name"] });
    throw Object.assign(new Error(`${who?.full_name ?? "A teammate"} saved changes to this inspection. Reload it to see their answers before you continue.`), {
      status: 409,
      extra: { conflict: true },
    });
  }
  const now = new Date();
  const first = !task.form_version_id;
  await task.update(
    {
      form_version_id: version.version_id,
      // only this version's questions, and only files uploaded to this inspection for that question
      answers: await sanitizeFileRefs(task.inspection_id, version.definition, cleanAnswers(version.definition, req.body.answers), transaction),
      status: "in_progress",
      last_saved_at: now,
      last_saved_by: req.user.user_id,
      ...(first ? { started_at: now, started_by: req.user.user_id } : {}),
    },
    { transaction },
  );
  if (first) await InspectionEvent.create({ inspection_id: task.inspection_id, type: "started", user_id: req.user.user_id }, { transaction });
  return version;
};

const saveAnswers = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { task, rights } = await loadTask(req, req.params.id);
    await task.reload({ transaction, lock: transaction.LOCK.UPDATE });
    if (task.status === "submitted") throw Object.assign(new Error("This inspection has been submitted and can't be changed."), { status: 409 });
    if (!rights.fill) throw Object.assign(new Error("Only members of the assigned team can fill this inspection."), { status: 403 });
    await saveAnswersInternal(req, task, transaction);
    await transaction.commit();
    return res.status(200).json({ success: true, data: { last_saved_at: task.last_saved_at, status: task.status } });
  } catch (error) {
    await transaction.rollback();
    return sendError(res, error, "Failed to save the answers.");
  }
};

const LOCATION_KEYS = ["lat", "lng", "accuracy", "altitude", "captured_at", "error"];
const DEVICE_KEYS = ["user_agent", "platform", "language", "screen", "timezone", "device_id"];
const pick = (o, keys) => (o && typeof o === "object" ? Object.fromEntries(keys.filter((k) => o[k] != null).map((k) => [k, typeof o[k] === "string" ? o[k].slice(0, 500) : o[k]])) : null);

/** Check the answers, score them, lock the task. Late if after the due time. */
const submitInspection = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { task, rights } = await loadTask(req, req.params.id);
    await task.reload({ transaction, lock: transaction.LOCK.UPDATE });
    if (task.status === "submitted") throw Object.assign(new Error("This inspection has already been submitted."), { status: 409 });
    if (!rights.fill) throw Object.assign(new Error("Only members of the assigned team can submit this inspection."), { status: 403 });
    // Where it was submitted is required: the phone's GPS point
    const lat = Number(req.body.location?.lat);
    const lng = Number(req.body.location?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
      throw Object.assign(new Error("Your location is needed to submit. Turn on location for this site and try again."), { status: 400, extra: { location_required: true } });
    const version = await saveAnswersInternal(req, task, transaction);
    const license = await CompanyLicense.findByPk(task.license_id, { attributes: ["license_type"], transaction });
    const problems = validateAnswers(version.definition, license?.license_type, task.answers);
    if (problems.length) {
      await transaction.commit(); // keep the saved answers
      return fail(res, 400, `${problems.length} answer(s) need attention before submitting.`, { problems, last_saved_at: task.last_saved_at });
    }
    const now = new Date();
    const late = now > new Date(task.due_at);
    // Where it was submitted, with the place name (woreda, zone, region) from the boundaries
    const location = pick(req.body.location, LOCATION_KEYS);
    if (location?.lat != null && location?.lng != null) location.place = await placeOf(Number(location.lat), Number(location.lng)).catch(() => null);
    await task.update(
      {
        status: "submitted",
        submitted_at: now,
        submitted_by: req.user.user_id,
        is_late: late,
        score: scoreOf(version.definition, license?.license_type, task.answers),
        submit_location: location,
        submit_device: pick(req.body.device, DEVICE_KEYS),
        submit_ip: (req.headers["x-forwarded-for"]?.split(",")[0] || req.socket?.remoteAddress || "").trim().slice(0, 64) || null,
      },
      { transaction },
    );
    await InspectionEvent.create(
      { inspection_id: task.inspection_id, type: "submitted", user_id: req.user.user_id, details: { late, location_shared: !!req.body.location?.lat } },
      { transaction },
    );
    await transaction.commit();
    removeUnusedFiles(task).catch((e) => console.error("removeUnusedFiles", e.message)); // files taken out of answers
    return res.status(200).json({ success: true, message: late ? "Submitted (late)." : "Submitted.", data: { status: "submitted", is_late: late, score: task.score } });
  } catch (error) {
    await transaction.rollback();
    return sendError(res, error, "Failed to submit the inspection.");
  }
};

/** Unlock a submitted inspection so the team can correct it (inspections:review). */
const returnInspection = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { task } = await loadTask(req, req.params.id);
    await task.reload({ transaction, lock: transaction.LOCK.UPDATE });
    if (task.status !== "submitted") throw Object.assign(new Error("Only submitted inspections can be returned."), { status: 409 });
    const reason = String(req.body.reason || "").trim();
    if (reason.length < 3) throw Object.assign(new Error("Write what the team needs to correct."), { status: 400 });
    await task.update(
      { status: "in_progress", return_count: task.return_count + 1, last_saved_at: new Date(), last_saved_by: req.user.user_id },
      { transaction },
    );
    await InspectionEvent.create(
      { inspection_id: task.inspection_id, type: "returned", user_id: req.user.user_id, details: { reason: reason.slice(0, 2000), was_late: task.is_late, score: task.score } },
      { transaction },
    );
    await transaction.commit();
    return res.status(200).json({ success: true, message: "Returned to the team for correction." });
  } catch (error) {
    await transaction.rollback();
    return sendError(res, error, "Failed to return the inspection.");
  }
};

/** Give an open task to another team, and/or change its due time (inspections:assign). */
const updateAssignment = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { task } = await loadTask(req, req.params.id);
    await task.reload({ transaction, lock: transaction.LOCK.UPDATE });
    if (task.status === "submitted") throw Object.assign(new Error("A submitted inspection can't be reassigned."), { status: 409 });
    const changes = {};
    if (req.body.team_id !== undefined && req.body.team_id !== task.team_id) {
      if (req.body.team_id) {
        const team = await Team.findByPk(req.body.team_id, { transaction });
        if (!team || !team.is_active) throw Object.assign(new Error("Choose an active team."), { status: 400 });
      }
      await InspectionEvent.create(
        { inspection_id: task.inspection_id, type: "reassigned", user_id: req.user.user_id, details: { from: task.team_id, to: req.body.team_id || null } },
        { transaction },
      );
      changes.team_id = req.body.team_id || null;
    }
    if (req.body.due_at) {
      const due = new Date(req.body.due_at);
      if (Number.isNaN(due.getTime())) throw Object.assign(new Error("Invalid due date."), { status: 400 });
      if (due.getTime() !== new Date(task.due_at).getTime()) {
        await InspectionEvent.create(
          { inspection_id: task.inspection_id, type: "due_changed", user_id: req.user.user_id, details: { from: task.due_at, to: due } },
          { transaction },
        );
        changes.due_at = due;
      }
    }
    if (Object.keys(changes).length) await task.update(changes, { transaction });
    await transaction.commit();
    return res.status(200).json({ success: true, message: Object.keys(changes).length ? "Saved." : "Nothing changed." });
  } catch (error) {
    await transaction.rollback();
    return sendError(res, error, "Failed to update the inspection.");
  }
};

module.exports = {
  getInspections,
  getMyTasks,
  getLicenseHistory,
  getInspectionById,
  saveAnswers,
  submitInspection,
  returnInspection,
  updateAssignment,
};
