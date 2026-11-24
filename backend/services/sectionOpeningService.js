/**
 * "Open sections for update": a reviewer opens chosen sections of SUBMITTED inspections so the team can
 * fill in or correct them until a deadline. The inspection stays submitted (submitted_at, on time / late,
 * location and counts don't change). No location is taken and any device may be used.
 *
 * An opening is open while closed_at is empty and `until` is in the future, or empty (no deadline: open until
 * someone closes it or every team is done); for one inspection it stays
 * open until the team taps "Done updating" (its item becomes done). Closing: by a reviewer, by the
 * deadline (closeExpired, hourly) or when every inspection is done.
 */
const { Op } = require("sequelize");
const { SectionOpening, SectionOpeningItem, InspectionEvent, User, sequelize } = require("../models");
const notify = require("./inspectionNotifications");

const openWhere = (now = new Date()) => ({ closed_at: null, [Op.or]: [{ until: null }, { until: { [Op.gt]: now } }] });
/** Open right now (an opening record) */
const isOpenNow = (o, now = new Date()) => !o.closed_at && (!o.until || new Date(o.until) > now);

/** Sections of a definition, as the dialog and history show them. */
const sectionLabel = (s) => (s.number ? String(s.number) : s.title || s.key);

/**
 * What is open for one inspection right now (all its waiting items of open openings), or null.
 * { items, section_keys, until (the latest), openings: [{ opening_id, section_keys, section_labels, until, reason, opened_by }] }
 */
const openFor = async (inspectionId, { transaction } = {}) => {
  const items = await SectionOpeningItem.findAll({
    where: { inspection_id: inspectionId, status: "waiting" },
    include: [{ model: SectionOpening, as: "opening", where: openWhere(), include: [{ model: User, as: "opener", attributes: ["user_id", "full_name"] }] }],
    transaction,
  });
  if (!items.length) return null;
  const openings = items.map((i) => i.opening);
  return {
    items,
    section_keys: [...new Set(openings.flatMap((o) => o.section_keys || []))],
    // The latest deadline; none when any of them has no deadline
    until: openings.some((o) => !o.until) ? null : new Date(Math.max(...openings.map((o) => new Date(o.until).getTime()))),
    openings: openings.map((o) => ({
      opening_id: o.opening_id,
      section_keys: o.section_keys,
      section_labels: o.section_labels,
      until: o.until,
      reason: o.reason,
      opened_by: o.opener ? { user_id: o.opener.user_id, full_name: o.opener.full_name } : null,
      opened_at: o.created_at,
    })),
  };
};

/** Question keys inside the given sections of a definition. */
const fieldKeysOf = (definition, sectionKeys) => {
  const wanted = new Set(sectionKeys);
  return new Set((definition?.sections || []).filter((s) => wanted.has(s.key)).flatMap((s) => (s.fields || []).map((f) => f.key)));
};

/** Questions changed after submitting, over all openings: { question_key: { at, by } } (the latest change). */
const changedAnswers = async (inspectionId) => {
  const items = await SectionOpeningItem.findAll({ where: { inspection_id: inspectionId }, attributes: ["changed_answers"] });
  const out = {};
  for (const { changed_answers: changed } of items)
    for (const [k, v] of Object.entries(changed || {})) if (!out[k] || new Date(v.at) > new Date(out[k].at)) out[k] = v;
  return out;
};

/**
 * Close openings (by a person: closedBy, or at the deadline: null). The inspections still waiting get a
 * history line and their teams a notice. Returns how many were closed.
 */
const closeOpenings = async (openings, { closedBy = null, reason = "manual", now = new Date() } = {}) => {
  let n = 0;
  for (const opening of openings) {
    const waiting = await sequelize.transaction(async (transaction) => {
      const [count] = await SectionOpening.update(
        { closed_at: reason === "deadline" && opening.until ? opening.until : now, closed_by: closedBy, close_reason: reason },
        { where: { opening_id: opening.opening_id, closed_at: null }, transaction },
      );
      if (!count) return null; // closed meanwhile
      const items = await SectionOpeningItem.findAll({ where: { opening_id: opening.opening_id, status: "waiting" }, attributes: ["inspection_id"], transaction });
      const ids = items.map((i) => i.inspection_id);
      if (ids.length)
        await InspectionEvent.bulkCreate(
          ids.map((id) => ({ inspection_id: id, type: "update_closed", user_id: closedBy, details: { opening_id: opening.opening_id, sections: opening.section_labels, why: reason } })),
          { transaction },
        );
      return ids;
    });
    if (waiting === null) continue;
    n += 1;
    if (waiting.length && reason !== "all_done") notify.sectionsClosed(opening, waiting, closedBy);
  }
  return n;
};

/** Hourly: openings whose deadline passed. (Saving already stops at the deadline; this records it.) */
const closeExpired = async (now = new Date()) => {
  const due = await SectionOpening.findAll({ where: { closed_at: null, until: { [Op.ne]: null, [Op.lte]: now } } });
  return closeOpenings(due, { reason: "deadline", now });
};

module.exports = { openWhere, isOpenNow, sectionLabel, openFor, fieldKeysOf, changedAnswers, closeOpenings, closeExpired };
