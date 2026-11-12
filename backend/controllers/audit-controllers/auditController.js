"use strict";
/**
 * GET /api/audit-logs — the audit log (audit:read), newest first.
 *   Central administrators: every sector, or the sector chosen in the Sector filter (X-Sector-Id).
 *   Sector administrators: rows of their sector (done by someone of the sector, or done to its records).
 * Filters: search (person, email, target, action), category (first part of the action: auth, users …),
 * outcome (success | failure), actor_id, from / to (YYYY-MM-DD, Ethiopia time), page, limit.
 * GET /api/audit-logs/:id — one row with its changes.
 */
const { Op, literal } = require("sequelize");
const { validate: isUuid } = require("uuid");
const db = require("../../models");
const { likeContains } = require("../../utils/search");

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const LIST_ATTRS = { exclude: ["changes", "user_agent"] };

const scopeOf = (req) => {
  const s = req.scope?.sectorId;
  return s ? { [Op.or]: [{ actor_sector_id: s }, { entity_sector_id: s }] } : {};
};

const getAuditLogs = async (req, res) => {
  try {
    const q = req.query;
    const and = [scopeOf(req)];
    if (q.search?.trim()) {
      const term = likeContains(q.search);
      and.push({ [Op.or]: [{ actor_name: { [Op.iLike]: term } }, { actor_email: { [Op.iLike]: term } }, { entity_label: { [Op.iLike]: term } }, { action: { [Op.iLike]: term } }, { message: { [Op.iLike]: term } }] });
    }
    if (q.category && /^[a-z0-9-]+$/.test(q.category)) and.push({ action: { [Op.like]: `${q.category}.%` } });
    if (q.outcome === "success" || q.outcome === "failure") and.push({ outcome: q.outcome });
    if (q.actor_id && isUuid(q.actor_id)) and.push({ actor_id: q.actor_id });
    if (q.entity_id && isUuid(q.entity_id)) and.push({ entity_id: q.entity_id });
    for (const [param, op] of [
      ["from", ">="],
      ["to", "<="],
    ])
      if (DAY.test(q[param] || "")) and.push(literal(`("AuditLog"."occurred_at" AT TIME ZONE 'Africa/Addis_Ababa')::date ${op} '${q[param]}'`));
    const limit = Math.min(200, Math.max(1, parseInt(q.limit, 10) || 50));
    const page = Math.max(1, parseInt(q.page, 10) || 1);
    const { rows, count } = await db.AuditLog.findAndCountAll({
      where: { [Op.and]: and },
      attributes: { ...LIST_ATTRS, include: [[literal(`COALESCE(jsonb_array_length("AuditLog"."changes"), 0)`), "change_count"]] },
      order: [["occurred_at", "DESC"]],
      limit,
      offset: (page - 1) * limit,
    });
    return res.status(200).json({ success: true, data: rows, meta: { totalItems: count, totalPages: Math.ceil(count / limit), currentPage: page, itemsPerPage: limit } });
  } catch (error) {
    console.error("getAuditLogs", error);
    return res.status(500).json({ success: false, message: "Failed to load the audit log." });
  }
};

const getAuditLog = async (req, res) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ success: false, message: "Invalid id." });
    const row = await db.AuditLog.findOne({ where: { [Op.and]: [{ audit_id: req.params.id }, scopeOf(req)] } });
    if (!row) return res.status(404).json({ success: false, message: "Not found." });
    return res.status(200).json({ success: true, data: row });
  } catch (error) {
    console.error("getAuditLog", error);
    return res.status(500).json({ success: false, message: "Failed to load the entry." });
  }
};

module.exports = { getAuditLogs, getAuditLog };
