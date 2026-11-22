/**
 * Open sections of SUBMITTED inspections for update (reviewers: inspections:review).
 *
 *   GET  /api/inspections/openings/preview   which submitted inspections a scope covers, and their sections
 *   POST /api/inspections/openings           open: scope, section_keys, until, reason
 *   GET  /api/inspections/openings           openings with progress (?inspection_id, ?schedule_id, ?occurrence_date, ?state)
 *   GET  /api/inspections/openings/:openingId   one opening with each inspection: waiting / done
 *   POST /api/inspections/openings/:openingId/close
 *
 * Scopes: inspection (one), licenses (chosen inspections of a round), round, team (in a round), region (in a round).
 * The team updates through PUT /:id/update-answers and finishes with POST /:id/done-updating (inspectionController).
 */
const { Op, QueryTypes, literal } = require("sequelize");
const { validate: isUuid } = require("uuid");
const { sequelize, Inspection, SectionOpening, SectionOpeningItem, InspectionEvent, FormVersion, Company, CompanyLicense, Team, User, InspectionSchedule } = require("../../models");
const { scopeWhere, inScope } = require("../../services/sectorScope");
const svc = require("../../services/sectionOpeningService");
const notify = require("../../services/inspectionNotifications");

const fail = (res, status, message, extra) => res.status(status).json({ success: false, message, ...extra });
const bad = (message, status = 400) => Object.assign(new Error(message), { status });
const sendError = (res, error, fallback) => {
  if (error.status) return fail(res, error.status, error.message);
  console.error(fallback, error);
  return fail(res, 500, fallback);
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX = 2000;
const idList = (v) => (Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : []).map((x) => String(x).trim()).filter(Boolean);

/** The submitted inspections a scope covers, in the user's sector. */
const matchScope = async (req, q) => {
  const where = { ...scopeWhere(req), status: "submitted" };
  const scope = q.scope;
  if (scope === "inspection") {
    if (!isUuid(String(q.inspection_id || ""))) throw bad("Choose the inspection.");
    where.inspection_id = q.inspection_id;
  } else {
    if (!SectionOpening.SCOPES.includes(scope)) throw bad("Choose what to open: one inspection, chosen licenses, a round, a team or a region.");
    if (!isUuid(String(q.schedule_id || "")) || !DAY.test(String(q.occurrence_date || ""))) throw bad("Choose the round.");
    where.schedule_id = q.schedule_id;
    where.occurrence_date = q.occurrence_date;
    if (scope === "licenses") {
      const ids = idList(q.inspection_ids);
      if (!ids.length || !ids.every(isUuid)) throw bad("Choose at least one license.");
      where.inspection_id = ids;
    } else if (scope === "team") {
      if (!isUuid(String(q.team_id || ""))) throw bad("Choose the team.");
      where.team_id = q.team_id;
    } else if (scope === "region") {
      if (!isUuid(String(q.region_id || ""))) throw bad("Choose the region.");
      where[Op.and] = [
        literal(`EXISTS (SELECT 1 FROM license_areas la JOIN admin_areas a ON a.area_id = la.area_id
                 LEFT JOIN admin_areas p ON p.area_id = a.parent_id LEFT JOIN admin_areas g ON g.area_id = p.parent_id
                 WHERE la.license_id = "Inspection"."license_id" AND ${sequelize.escape(q.region_id)} IN (a.area_id, p.area_id, g.area_id))`),
      ];
    }
  }
  return Inspection.findAll({
    where,
    attributes: ["inspection_id", "form_version_id", "team_id", "sector_node_id", "schedule_id", "occurrence_date", "submitted_at"],
    include: [
      { model: Company, as: "company", attributes: ["company_id", "name"] },
      { model: CompanyLicense, as: "license", attributes: ["license_id", "license_number", "license_type"] },
      { model: Team, as: "team", attributes: ["team_id", "name"] },
    ],
    order: [[{ model: Company, as: "company" }, "name", "ASC"]],
    limit: MAX + 1,
  });
};

/** The sections of the versions these inspections answered (by key, in checklist order). */
const sectionsOf = async (tasks) => {
  const ids = [...new Set(tasks.map((t) => t.form_version_id).filter(Boolean))];
  const versions = ids.length ? await FormVersion.findAll({ where: { version_id: ids }, attributes: ["version_id", "version_number", "definition"], order: [["version_number", "DESC"]] }) : [];
  const out = new Map();
  for (const v of versions)
    for (const s of v.definition?.sections || [])
      if (!out.has(s.key)) out.set(s.key, { key: s.key, number: s.number || null, title: s.title || s.key, questions: (s.fields || []).length, required: (s.fields || []).filter((f) => f.required).length });
  return { list: [...out.values()], byVersion: new Map(versions.map((v) => [v.version_id, new Set((v.definition?.sections || []).map((s) => s.key))])) };
};

/** Inspections of these ids already open for update right now. */
const openNow = async (ids) => {
  if (!ids.length) return new Set();
  const items = await SectionOpeningItem.findAll({
    where: { inspection_id: ids, status: "waiting" },
    include: [{ model: SectionOpening, as: "opening", where: svc.openWhere(), attributes: [] }],
    attributes: ["inspection_id"],
  });
  return new Set(items.map((i) => i.inspection_id));
};

const row = (t) => ({
  inspection_id: t.inspection_id,
  company: t.company?.name ?? null,
  license_number: t.license?.license_number ?? null,
  team: t.team ? { team_id: t.team.team_id, name: t.team.name } : null,
  submitted_at: t.submitted_at,
});

const previewOpening = async (req, res) => {
  try {
    const tasks = await matchScope(req, req.query);
    const { list } = await sectionsOf(tasks.slice(0, MAX));
    const open = await openNow(tasks.slice(0, MAX).map((t) => t.inspection_id));
    return res.status(200).json({
      success: true,
      data: {
        count: Math.min(tasks.length, MAX),
        too_many: tasks.length > MAX,
        sections: list,
        inspections: tasks.slice(0, 500).map((t) => ({ ...row(t), open_now: open.has(t.inspection_id) })),
      },
    });
  } catch (error) {
    return sendError(res, error, "Failed to find the inspections.");
  }
};

const createOpening = async (req, res) => {
  try {
    const b = req.body || {};
    const reason = String(b.reason || "").trim();
    if (reason.length < 3) throw bad("Write why the sections are opened (the team sees it).");
    const until = new Date(b.until);
    const now = new Date();
    if (Number.isNaN(until.getTime()) || until <= new Date(now.getTime() + 10 * 60 * 1000)) throw bad("The deadline must be in the future.");
    if (until > new Date(now.getTime() + 366 * 24 * 3600 * 1000)) throw bad("The deadline can be at most a year away.");
    const keys = [...new Set(idList(b.section_keys))];
    if (!keys.length) throw bad("Choose at least one section.");

    const tasks = await matchScope(req, b);
    if (tasks.length > MAX) throw bad(`That is more than ${MAX} inspections. Choose a smaller group.`);
    if (!tasks.length) throw bad("No submitted inspections match. Only submitted inspections can be opened for update.", 404);
    const { list, byVersion } = await sectionsOf(tasks);
    const chosen = list.filter((s) => keys.includes(s.key));
    if (!chosen.length) throw bad("Those sections aren't in these inspections' checklist.");
    // Only inspections whose checklist has at least one of the sections
    const covered = tasks.filter((t) => chosen.some((s) => byVersion.get(t.form_version_id)?.has(s.key)));
    if (!covered.length) throw bad("None of these inspections has those sections.");
    const labels = chosen.map(svc.sectionLabel);

    const opening = await sequelize.transaction(async (transaction) => {
      const o = await SectionOpening.create(
        {
          sector_node_id: covered[0].sector_node_id,
          scope: b.scope,
          scope_details: {
            schedule_id: b.schedule_id || null,
            occurrence_date: b.occurrence_date || null,
            team_id: b.scope === "team" ? b.team_id : null,
            region_id: b.scope === "region" ? b.region_id : null,
            region_name: b.scope === "region" ? String(b.region_name || "").slice(0, 120) || null : null,
            inspection_ids: b.scope === "licenses" ? covered.map((t) => t.inspection_id) : undefined,
          },
          schedule_id: covered[0].schedule_id || null,
          section_keys: chosen.map((s) => s.key),
          section_labels: labels,
          reason: reason.slice(0, 1000),
          until,
          opened_by: req.user.user_id,
        },
        { transaction },
      );
      await SectionOpeningItem.bulkCreate(covered.map((t) => ({ opening_id: o.opening_id, inspection_id: t.inspection_id })), { transaction });
      await InspectionEvent.bulkCreate(
        covered.map((t) => ({ inspection_id: t.inspection_id, type: "update_opened", user_id: req.user.user_id, details: { opening_id: o.opening_id, sections: labels, until, reason: o.reason } })),
        { transaction },
      );
      return o;
    });
    notify.sectionsOpened(opening, covered.map((t) => t.inspection_id), req.user.user_id);
    return res.status(201).json({
      success: true,
      message: `${labels.length === 1 ? "Section" : "Sections"} ${labels.join(", ")} opened for ${covered.length} inspection${covered.length === 1 ? "" : "s"}.`,
      data: { opening_id: opening.opening_id, count: covered.length },
    });
  } catch (error) {
    return sendError(res, error, "Failed to open the sections.");
  }
};

/** Openings with progress (total / done), newest first. */
const listOpenings = async (req, res) => {
  try {
    const q = req.query;
    const where = { ...scopeWhere(req) };
    if (q.schedule_id && isUuid(q.schedule_id)) where.schedule_id = q.schedule_id;
    if (q.occurrence_date && DAY.test(q.occurrence_date)) where.scope_details = { occurrence_date: q.occurrence_date };
    if (q.state === "open") Object.assign(where, svc.openWhere());
    if (q.state === "closed") where[Op.or] = [{ closed_at: { [Op.ne]: null } }, { until: { [Op.lte]: new Date() } }];
    if (q.inspection_id && isUuid(q.inspection_id))
      where.opening_id = { [Op.in]: literal(`(SELECT opening_id FROM section_opening_items WHERE inspection_id = ${sequelize.escape(q.inspection_id)})`) };
    const openings = await SectionOpening.findAll({
      where,
      include: [
        { model: User, as: "opener", attributes: ["user_id", "full_name"] },
        { model: User, as: "closer", attributes: ["user_id", "full_name"] },
        { model: InspectionSchedule, as: "schedule", attributes: ["schedule_id", "name"] },
      ],
      order: [["created_at", "DESC"]],
      limit: 100,
    });
    const ids = openings.map((o) => o.opening_id);
    const counts = ids.length
      ? await sequelize.query(
          `SELECT opening_id, COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = 'done')::int AS done
             FROM section_opening_items WHERE opening_id IN (:ids) GROUP BY opening_id`,
          { replacements: { ids }, type: QueryTypes.SELECT },
        )
      : [];
    const by = new Map(counts.map((c) => [c.opening_id, c]));
    const now = new Date();
    return res.status(200).json({
      success: true,
      data: openings.map((o) => ({
        ...o.get({ plain: true }),
        is_open: !o.closed_at && new Date(o.until) > now,
        total: by.get(o.opening_id)?.total ?? 0,
        done: by.get(o.opening_id)?.done ?? 0,
      })),
    });
  } catch (error) {
    return sendError(res, error, "Failed to fetch the openings.");
  }
};

const loadOpening = async (req) => {
  const id = req.params.openingId;
  if (!isUuid(String(id || ""))) throw bad("Invalid id.");
  const o = await SectionOpening.findByPk(id, {
    include: [
      { model: User, as: "opener", attributes: ["user_id", "full_name"] },
      { model: User, as: "closer", attributes: ["user_id", "full_name"] },
      { model: InspectionSchedule, as: "schedule", attributes: ["schedule_id", "name"] },
    ],
  });
  if (!o || !inScope(req, o.sector_node_id)) throw bad("Not found.", 404);
  return o;
};

const getOpening = async (req, res) => {
  try {
    const o = await loadOpening(req);
    const items = await SectionOpeningItem.findAll({
      where: { opening_id: o.opening_id },
      include: [
        { model: User, as: "doneBy", attributes: ["user_id", "full_name"] },
        {
          model: Inspection,
          as: "inspection",
          attributes: ["inspection_id", "submitted_at"],
          include: [
            { model: Company, as: "company", attributes: ["name"] },
            { model: CompanyLicense, as: "license", attributes: ["license_number"] },
            { model: Team, as: "team", attributes: ["team_id", "name"] },
          ],
        },
      ],
    });
    const list = items
      .map((i) => ({
        ...row(i.inspection),
        status: i.status,
        done_at: i.done_at,
        done_by: i.doneBy ? { user_id: i.doneBy.user_id, full_name: i.doneBy.full_name } : null,
        changed: Object.keys(i.changed_answers || {}).length,
      }))
      .sort((a, b) => (a.status === b.status ? String(a.company).localeCompare(String(b.company)) : a.status === "waiting" ? -1 : 1));
    return res.status(200).json({
      success: true,
      data: { ...o.get({ plain: true }), is_open: !o.closed_at && new Date(o.until) > new Date(), total: list.length, done: list.filter((i) => i.status === "done").length, items: list },
    });
  } catch (error) {
    return sendError(res, error, "Failed to fetch the opening.");
  }
};

const closeOpening = async (req, res) => {
  try {
    const o = await loadOpening(req);
    if (o.closed_at) throw bad("It is already closed.", 409);
    await svc.closeOpenings([o], { closedBy: req.user.user_id, reason: "manual" });
    return res.status(200).json({ success: true, message: "Closed. Changes already saved are kept." });
  } catch (error) {
    return sendError(res, error, "Failed to close.");
  }
};

module.exports = { previewOpening, createOpening, listOpenings, getOpening, closeOpening };
