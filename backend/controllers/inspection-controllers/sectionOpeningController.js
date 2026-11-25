/**
 * Open sections of SUBMITTED inspections for update (reviewers: inspections:review).
 *
 *   GET  /api/inspections/openings/preview      which submitted inspections a scope covers, their sections,
 *                                               what is already open for each, and openings that can be merged into
 *   POST /api/inspections/openings              open: scope, section_keys, until, reason,
 *                                               only_not_open (skip those already open), merge_into (add to an opening)
 *   GET  /api/inspections/openings              openings with progress (?inspection_id, ?schedule_id, ?occurrence_date,
 *                                               ?state, ?team_id, ?search) and totals for the page
 *   POST /api/inspections/openings/close-all    close every open opening of a round (or of one inspection)
 *   GET  /api/inspections/openings/:openingId   one opening with each inspection: waiting / done
 *   PUT  /api/inspections/openings/:openingId   edit an open opening: sections, deadline, reason
 *   POST /api/inspections/openings/:openingId/close
 *
 * Scopes: inspection (one), licenses (chosen inspections of a round), round, team (in a round), region (in a round).
 * The team updates through PUT /:id/update-answers and finishes with POST /:id/done-updating (inspectionController).
 */
const { Op, QueryTypes, literal } = require("sequelize");
const { validate: isUuid } = require("uuid");
const { sequelize, Inspection, SectionOpening, SectionOpeningItem, InspectionEvent, FormVersion, Company, CompanyLicense, Team, User, InspectionSchedule } = require("../../models");
const { scopeWhere, scopeSql, inScope } = require("../../services/sectorScope");
const svc = require("../../services/sectionOpeningService");
const notify = require("../../services/inspectionNotifications");
const { likeContains } = require("../../utils/search");

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
const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const sectionsWord = (labels) => `${labels.length === 1 ? "Section" : "Sections"} ${labels.join(", ")}`;

/** A deadline from the request: a date in the future, at most a year away. */
const deadlineOf = (b) => {
  const until = new Date(b.until);
  const now = Date.now();
  if (Number.isNaN(until.getTime()) || until.getTime() <= now + 10 * 60 * 1000) throw bad("The deadline must be in the future.");
  if (until.getTime() > now + 366 * 24 * 3600 * 1000) throw bad("The deadline can be at most a year away.");
  return until;
};

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

/** Sections open for update right now, per inspection: Map(inspection_id → Set(section keys)). */
const openSectionsOf = async (ids, transaction) => {
  const out = new Map();
  if (!ids.length) return out;
  const items = await SectionOpeningItem.findAll({
    where: { inspection_id: ids, status: "waiting" },
    include: [{ model: SectionOpening, as: "opening", where: svc.openWhere(), attributes: ["section_keys"] }],
    attributes: ["inspection_id"],
    transaction,
  });
  for (const i of items) out.set(i.inspection_id, new Set([...(out.get(i.inspection_id) || []), ...(i.opening.section_keys || [])]));
  return out;
};

/** Already open for every one of these sections */
const coversAll = (open, keys) => !!open && keys.length > 0 && keys.every((k) => open.has(k));

/** Progress of openings: Map(opening_id → { total, done }) */
const progressOf = async (ids) => {
  if (!ids.length) return new Map();
  const rows = await sequelize.query(
    `SELECT opening_id, COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = 'done')::int AS done
       FROM section_opening_items WHERE opening_id IN (:ids) GROUP BY opening_id`,
    { replacements: { ids }, type: QueryTypes.SELECT },
  );
  return new Map(rows.map((c) => [c.opening_id, c]));
};

const row = (t) => ({
  inspection_id: t.inspection_id,
  company: t.company?.name ?? null,
  license_number: t.license?.license_number ?? null,
  team: t.team ? { team_id: t.team.team_id, name: t.team.name } : null,
  submitted_at: t.submitted_at,
});

/** Openings holding inspections of a round (also those opened from one inspection's page) */
const inRound = (scheduleId, occurrenceDate) => ({
  opening_id: {
    [Op.in]: literal(`(SELECT it.opening_id FROM section_opening_items it JOIN inspections i ON i.inspection_id = it.inspection_id
              WHERE i.schedule_id = ${sequelize.escape(scheduleId)} AND i.occurrence_date = ${sequelize.escape(occurrenceDate)})`),
  },
});

/** Open openings these inspections could be added to: same round, or already holding one of them. */
const mergeCandidates = async (req, tasks) => {
  if (!tasks.length) return [];
  const ids = tasks.map((t) => t.inspection_id);
  const rounds = [...new Set(tasks.filter((t) => t.schedule_id).map((t) => `${t.schedule_id}|${t.occurrence_date}`))].slice(0, 20);
  const or = [{ opening_id: { [Op.in]: literal(`(SELECT opening_id FROM section_opening_items WHERE inspection_id IN (${ids.slice(0, MAX).map((x) => sequelize.escape(x)).join(",")}))`) } }];
  for (const r of rounds) {
    const [schedule_id, occurrence_date] = r.split("|");
    or.push(inRound(schedule_id, occurrence_date));
  }
  const openings = await SectionOpening.findAll({ where: { ...scopeWhere(req), [Op.and]: [svc.openWhere(), { [Op.or]: or }] }, order: [["created_at", "DESC"]], limit: 20 });
  const by = await progressOf(openings.map((o) => o.opening_id));
  return openings.map((o) => ({
    opening_id: o.opening_id,
    section_keys: o.section_keys,
    section_labels: o.section_labels,
    until: o.until,
    reason: o.reason,
    total: by.get(o.opening_id)?.total ?? 0,
    done: by.get(o.opening_id)?.done ?? 0,
  }));
};

const previewOpening = async (req, res) => {
  try {
    const tasks = (await matchScope(req, req.query)).slice(0, MAX + 1);
    const shown = tasks.slice(0, MAX);
    const { list } = await sectionsOf(shown);
    const open = await openSectionsOf(shown.map((t) => t.inspection_id));
    return res.status(200).json({
      success: true,
      data: {
        count: shown.length,
        too_many: tasks.length > MAX,
        sections: list,
        inspections: shown.slice(0, 500).map((t) => ({ ...row(t), open_now: open.has(t.inspection_id), open_sections: [...(open.get(t.inspection_id) || [])] })),
        // Open openings that the same inspections could be added to (merge)
        openings: await mergeCandidates(req, shown),
      },
    });
  } catch (error) {
    return sendError(res, error, "Failed to find the inspections.");
  }
};

/** Adds inspections to an opening as waiting items, with a history line each. */
const addItems = async (opening, tasks, userId, transaction) => {
  await SectionOpeningItem.bulkCreate(tasks.map((t) => ({ opening_id: opening.opening_id, inspection_id: t.inspection_id })), { transaction });
  await InspectionEvent.bulkCreate(
    tasks.map((t) => ({
      inspection_id: t.inspection_id,
      type: "update_opened",
      user_id: userId,
      details: { opening_id: opening.opening_id, sections: opening.section_labels, until: opening.until, reason: opening.reason },
    })),
    { transaction },
  );
};

const createOpening = async (req, res) => {
  try {
    const b = req.body || {};
    const keys = [...new Set(idList(b.section_keys))];
    if (!keys.length) throw bad("Choose at least one section.");

    const tasks = await matchScope(req, b);
    if (tasks.length > MAX) throw bad(`That is more than ${MAX} inspections. Choose a smaller group.`);
    if (!tasks.length) throw bad("No submitted inspections match. Only submitted inspections can be opened for update.", 404);
    const { list, byVersion } = await sectionsOf(tasks);
    const chosen = list.filter((s) => keys.includes(s.key));
    if (!chosen.length) throw bad("Those sections aren't in these inspections' checklist.");
    const chosenKeys = chosen.map((s) => s.key);
    // Only inspections whose checklist has at least one of the sections
    let covered = tasks.filter((t) => chosen.some((s) => byVersion.get(t.form_version_id)?.has(s.key)));
    if (!covered.length) throw bad("None of these inspections has those sections.");

    const result = await sequelize.transaction(async (transaction) => {
      // "Not open yet": skip the inspections already open for these sections (checked now, inside the transaction)
      if (b.only_not_open) {
        const open = await openSectionsOf(covered.map((t) => t.inspection_id), transaction);
        covered = covered.filter((t) => !coversAll(open.get(t.inspection_id), chosenKeys));
        if (!covered.length) throw bad("All of them are already open for these sections.", 409);
      }

      // Merge: add to an open opening with the same sections (its deadline and reason apply)
      if (b.merge_into) {
        if (!isUuid(String(b.merge_into))) throw bad("Invalid opening.");
        const target = await SectionOpening.findOne({ where: { opening_id: b.merge_into, ...svc.openWhere() }, transaction, lock: transaction.LOCK.UPDATE });
        if (!target || !inScope(req, target.sector_node_id)) throw bad("That opening is closed or no longer exists. Open the sections separately.", 409);
        if (!sameSet(target.section_keys || [], chosenKeys)) throw bad("That opening has other sections. Open these separately.", 409);
        // Only inspections still waiting count as "in it". One the team already finished (Done updating) is
        // opened again in the same opening: back to waiting, with a new history line (the earlier Done stays).
        const items = await SectionOpeningItem.findAll({ where: { opening_id: target.opening_id }, attributes: ["item_id", "inspection_id", "status"], transaction });
        const statusOf = new Map(items.map((i) => [i.inspection_id, i]));
        const again = covered.filter((t) => statusOf.get(t.inspection_id)?.status === "done");
        const adding = covered.filter((t) => !statusOf.has(t.inspection_id));
        if (!again.length && !adding.length) throw bad("All of them are already waiting in that opening.", 409);
        if (again.length) {
          await SectionOpeningItem.update(
            { status: "waiting", done_at: null, done_by: null },
            { where: { item_id: again.map((t) => statusOf.get(t.inspection_id).item_id) }, transaction },
          );
          await InspectionEvent.bulkCreate(
            again.map((t) => ({
              inspection_id: t.inspection_id,
              type: "update_opened",
              user_id: req.user.user_id,
              details: { opening_id: target.opening_id, sections: target.section_labels, until: target.until, reason: target.reason, again: true },
            })),
            { transaction },
          );
        }
        if (adding.length) await addItems(target, adding, req.user.user_id, transaction);
        return { opening: target, added: [...again, ...adding], again: again.length, merged: true };
      }

      const reason = String(b.reason || "").trim();
      if (reason.length < 3) throw bad("Write why the sections are opened (the team sees it).");
      const until = deadlineOf(b);
      const labels = chosen.map(svc.sectionLabel);
      const o = await SectionOpening.create(
        {
          sector_node_id: covered[0].sector_node_id,
          scope: b.scope,
          scope_details: {
            schedule_id: b.schedule_id || null,
            occurrence_date: b.occurrence_date || covered[0].occurrence_date || null,
            team_id: b.scope === "team" ? b.team_id : null,
            region_id: b.scope === "region" ? b.region_id : null,
            region_name: b.scope === "region" ? String(b.region_name || "").slice(0, 120) || null : null,
            inspection_ids: b.scope === "licenses" ? covered.map((t) => t.inspection_id) : undefined,
            only_not_open: b.only_not_open ? true : undefined,
          },
          schedule_id: covered[0].schedule_id || null,
          section_keys: chosenKeys,
          section_labels: labels,
          reason: reason.slice(0, 1000),
          until,
          opened_by: req.user.user_id,
        },
        { transaction },
      );
      await addItems(o, covered, req.user.user_id, transaction);
      return { opening: o, added: covered, merged: false };
    });

    const { opening, added, merged, again = 0 } = result;
    notify.sectionsOpened(opening, added.map((t) => t.inspection_id), req.user.user_id);
    const fresh = added.length - again;
    return res.status(201).json({
      success: true,
      message: merged
        ? `${[again ? `${plural(again, "inspection")} opened again` : "", fresh ? `${plural(fresh, "inspection")} added` : ""].filter(Boolean).join(", ")} in “${sectionsWord(opening.section_labels)}”.`
        : `${sectionsWord(opening.section_labels)} opened for ${plural(added.length, "inspection")}.`,
      data: { opening_id: opening.opening_id, count: added.length, merged },
    });
  } catch (error) {
    return sendError(res, error, "Failed to open the sections.");
  }
};

const shape = (o, by) => ({
  ...o.get({ plain: true }),
  is_open: svc.isOpenNow(o),
  total: by.get(o.opening_id)?.total ?? 0,
  done: by.get(o.opening_id)?.done ?? 0,
});

/** Openings with progress (total / done), newest first; with totals for the "Opened for update" page. */
const listOpenings = async (req, res) => {
  try {
    const q = req.query;
    const base = { ...scopeWhere(req) };
    const where = { ...base };
    const and = [];
    if (q.schedule_id && isUuid(q.schedule_id) && q.occurrence_date && DAY.test(q.occurrence_date)) and.push(inRound(q.schedule_id, q.occurrence_date));
    else if (q.schedule_id && isUuid(q.schedule_id)) where.schedule_id = q.schedule_id;
    if (q.state === "open") Object.assign(where, svc.openWhere());
    if (q.state === "closed") and.push({ [Op.or]: [{ closed_at: { [Op.ne]: null } }, { until: { [Op.lte]: new Date() } }] });
    if (q.inspection_id && isUuid(q.inspection_id))
      and.push({ opening_id: { [Op.in]: literal(`(SELECT opening_id FROM section_opening_items WHERE inspection_id = ${sequelize.escape(q.inspection_id)})`) } });
    if (q.team_id && isUuid(q.team_id))
      and.push({
        opening_id: {
          [Op.in]: literal(`(SELECT it.opening_id FROM section_opening_items it JOIN inspections i ON i.inspection_id = it.inspection_id WHERE i.team_id = ${sequelize.escape(q.team_id)})`),
        },
      });
    if (q.search?.trim()) {
      const term = sequelize.escape(likeContains(q.search));
      and.push({
        opening_id: {
          [Op.in]: literal(`(SELECT it.opening_id FROM section_opening_items it JOIN inspections i ON i.inspection_id = it.inspection_id
                    JOIN companies c ON c.company_id = i.company_id JOIN company_licenses l ON l.license_id = i.license_id
                   WHERE c.name ILIKE ${term} OR l.license_number ILIKE ${term})`),
        },
      });
    }
    if (and.length) where[Op.and] = and;
    const openings = await SectionOpening.findAll({
      where,
      include: [
        { model: User, as: "opener", attributes: ["user_id", "full_name"] },
        { model: User, as: "closer", attributes: ["user_id", "full_name"] },
        { model: InspectionSchedule, as: "schedule", attributes: ["schedule_id", "name"] },
      ],
      order: [["created_at", "DESC"]],
      limit: 200,
    });
    const by = await progressOf(openings.map((o) => o.opening_id));

    // Totals over all openings the user can see (the page's numbers)
    let totals;
    if (q.totals) {
      const [t] = await sequelize.query(
        `SELECT
           COUNT(DISTINCT o.opening_id) FILTER (WHERE o.closed_at IS NULL AND (o.until IS NULL OR o.until > NOW()))::int AS open_openings,
           COUNT(*) FILTER (WHERE it.status = 'waiting' AND o.closed_at IS NULL AND (o.until IS NULL OR o.until > NOW()))::int AS waiting,
           COUNT(*) FILTER (WHERE it.status = 'done')::int AS done,
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE it.status = 'waiting' AND (o.closed_at IS NOT NULL OR o.until <= NOW()))::int AS closed_not_done
         FROM section_openings o JOIN section_opening_items it ON it.opening_id = o.opening_id
        WHERE ${scopeSql(req, "o")}`,
        { type: QueryTypes.SELECT },
      );
      const [c] = await sequelize.query(
        `SELECT COUNT(*) FILTER (WHERE o.closed_at IS NULL AND (o.until IS NULL OR o.until > NOW()))::int AS open,
                COUNT(*) FILTER (WHERE o.closed_at IS NOT NULL OR o.until <= NOW())::int AS closed, COUNT(*)::int AS "all"
           FROM section_openings o WHERE ${scopeSql(req, "o")}`,
        { type: QueryTypes.SELECT },
      );
      totals = { ...t, tabs: c };
    }
    return res.status(200).json({ success: true, data: openings.map((o) => shape(o, by)), ...(totals ? { totals } : {}) });
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
          attributes: ["inspection_id", "submitted_at", "form_version_id"],
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
    // The sections that can be chosen when editing (from the checklist versions of its inspections)
    const { list: sections } = await sectionsOf(items.map((i) => i.inspection).filter(Boolean));
    return res.status(200).json({
      success: true,
      data: { ...o.get({ plain: true }), is_open: svc.isOpenNow(o), total: list.length, done: list.filter((i) => i.status === "done").length, items: list, sections },
    });
  } catch (error) {
    return sendError(res, error, "Failed to fetch the opening.");
  }
};

/**
 * PUT /openings/:openingId — change an open opening: section_keys, until, reason.
 * Applies to the inspections still waiting; those already done stay locked.
 */
const updateOpening = async (req, res) => {
  try {
    const o = await loadOpening(req);
    if (!svc.isOpenNow(o)) throw bad("It is closed. Open the sections again instead.", 409);
    const b = req.body || {};
    const changes = {};
    const said = [];

    if (b.section_keys !== undefined) {
      const keys = [...new Set(idList(b.section_keys))];
      if (!keys.length) throw bad("Choose at least one section.");
      const items = await SectionOpeningItem.findAll({ where: { opening_id: o.opening_id }, include: [{ model: Inspection, as: "inspection", attributes: ["form_version_id"] }] });
      const { list } = await sectionsOf(items.map((i) => i.inspection).filter(Boolean));
      const chosen = list.filter((s) => keys.includes(s.key));
      if (!chosen.length) throw bad("Those sections aren't in these inspections' checklist.");
      if (!sameSet(chosen.map((s) => s.key), o.section_keys || [])) {
        changes.section_keys = chosen.map((s) => s.key);
        changes.section_labels = chosen.map(svc.sectionLabel);
        said.push(`now ${sectionsWord(changes.section_labels).toLowerCase()}`);
      }
    }
    if (b.until !== undefined) {
      const until = deadlineOf(b);
      const before = o.until ? new Date(o.until).getTime() : null;
      if ((until ? until.getTime() : null) !== before) {
        changes.until = until;
        said.push(until ? `open until ${until.toISOString()}` : "no deadline");
      }
    }
    if (b.reason !== undefined) {
      const reason = String(b.reason || "").trim();
      if (reason.length < 3) throw bad("Write why the sections are opened (the team sees it).");
      if (reason !== o.reason) changes.reason = reason.slice(0, 1000);
    }
    if (!Object.keys(changes).length) return res.status(200).json({ success: true, message: "Nothing changed." });

    const waiting = await sequelize.transaction(async (transaction) => {
      await SectionOpening.update(changes, { where: { opening_id: o.opening_id }, transaction });
      const items = await SectionOpeningItem.findAll({ where: { opening_id: o.opening_id, status: "waiting" }, attributes: ["inspection_id"], transaction });
      const ids = items.map((i) => i.inspection_id);
      if (ids.length)
        await InspectionEvent.bulkCreate(
          ids.map((id) => ({
            inspection_id: id,
            type: "update_changed",
            user_id: req.user.user_id,
            details: {
              opening_id: o.opening_id,
              sections: changes.section_labels ?? o.section_labels,
              ...(changes.until !== undefined ? { until: changes.until, until_before: o.until } : {}),
              ...(changes.reason ? { reason: changes.reason } : {}),
              ...(changes.section_labels ? { sections_before: o.section_labels } : {}),
            },
          })),
          { transaction },
        );
      return ids;
    });
    await o.reload();
    if (waiting.length) notify.sectionsChanged(o, waiting, req.user.user_id, changes);
    return res.status(200).json({ success: true, message: waiting.length ? "Saved. The teams still updating are told." : "Saved." });
  } catch (error) {
    return sendError(res, error, "Failed to save the changes.");
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

/** POST /openings/close-all — every open opening of a round ({ schedule_id, occurrence_date }) or of one inspection ({ inspection_id }). */
const closeAllOpenings = async (req, res) => {
  try {
    const b = req.body || {};
    const and = [svc.openWhere()];
    if (b.inspection_id && isUuid(String(b.inspection_id)))
      and.push({ opening_id: { [Op.in]: literal(`(SELECT opening_id FROM section_opening_items WHERE inspection_id = ${sequelize.escape(b.inspection_id)})`) } });
    else if (isUuid(String(b.schedule_id || "")) && DAY.test(String(b.occurrence_date || ""))) and.push(inRound(b.schedule_id, b.occurrence_date));
    else if (!b.all) throw bad("Choose the round or the inspection.");
    const openings = await SectionOpening.findAll({ where: { ...scopeWhere(req), [Op.and]: and } });
    if (!openings.length) throw bad("Nothing is open.", 409);
    const n = await svc.closeOpenings(openings, { closedBy: req.user.user_id, reason: "manual" });
    return res.status(200).json({ success: true, message: `${plural(n, "opening")} closed. Changes already saved are kept.`, data: { closed: n } });
  } catch (error) {
    return sendError(res, error, "Failed to close.");
  }
};

module.exports = { previewOpening, createOpening, listOpenings, getOpening, updateOpening, closeOpening, closeAllOpenings };
