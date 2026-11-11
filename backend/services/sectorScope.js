"use strict";
/**
 * Sector isolation: which sector's data a request may see and write.
 *
 * Sectors are flat: the root ("Central Admin") and the sectors directly under it.
 *   - A user in a sector sees and writes only that sector's data.
 *   - A user in the root sector is central: they see every sector, or one sector when the
 *     sector switcher sends an `X-Sector-Id` header. When they create something they must
 *     say which sector it belongs to (body `sector_node_id`, or the switcher's sector).
 *
 * authenticateToken puts the result on req.scope:
 *   { isCentral, userSectorId, sectorId }   sectorId = the sector to filter by, null = all sectors
 *
 * Use in controllers:
 *   where: { ...scopeWhere(req), ... }                       Sequelize filters
 *   literal(`... AND ${scopeSql(req, "c")}`)                 raw SQL (alias of the table)
 *   await findInScope(Company, id, req)                      by id; null (→ 404) outside the scope
 *   const sector_node_id = await sectorForCreate(req)        the sector a new record belongs to
 *   assertSameSector(record, other)                          linking records (team ↔ license …)
 */
const { SectorNode, sequelize } = require("../models");
const { ROOT_SECTOR_ID } = require("../utils/sectorConstants");

const httpError = (status, message) => Object.assign(new Error(message), { status });

/** An active sector that can own data: a direct child of the root. */
const isDataSector = async (sectorId, transaction) => {
  if (!sectorId || typeof sectorId !== "string") return false;
  const node = await SectorNode.findOne({
    where: { sector_node_id: sectorId, parent_id: ROOT_SECTOR_ID, is_active: true },
    attributes: ["sector_node_id"],
    transaction,
  });
  return !!node;
};

/**
 * Work out the scope of a request.
 * @param {string|null} userSectorId  the logged-in user's sector
 * @param {string|undefined} requestedSectorId  X-Sector-Id header (central users only)
 */
const resolveScope = async (userSectorId, requestedSectorId) => {
  const isCentral = userSectorId === ROOT_SECTOR_ID;
  if (!isCentral) {
    // A user with no sector sees nothing (should not happen: the column is required)
    return { isCentral: false, userSectorId: userSectorId || null, sectorId: userSectorId || "00000000-0000-0000-0000-000000000000" };
  }
  const requested = typeof requestedSectorId === "string" ? requestedSectorId.trim() : "";
  if (!requested || requested === "all") return { isCentral: true, userSectorId, sectorId: null };
  if (!(await isDataSector(requested))) throw httpError(400, "The selected sector does not exist.");
  return { isCentral: true, userSectorId, sectorId: requested };
};

const scopeOf = (req) => {
  if (!req.scope) throw new Error("Sector scope missing: the route must use authenticateToken.");
  return req.scope;
};

/** Sequelize where-fragment limiting rows to the request's sector ({} = all sectors). */
const scopeWhere = (req, column = "sector_node_id") => {
  const { sectorId } = scopeOf(req);
  return sectorId ? { [column]: sectorId } : {};
};

/** Raw-SQL condition for a table alias, e.g. scopeSql(req, "i") → `i.sector_node_id = '…'` or `TRUE`. */
const scopeSql = (req, alias) => {
  const { sectorId } = scopeOf(req);
  const col = alias ? `${alias}.sector_node_id` : "sector_node_id";
  return sectorId ? `${col} = ${sequelize.escape(sectorId)}` : "TRUE";
};

/** Whether a record's sector is visible to the request. */
const inScope = (req, sectorId) => {
  const scope = scopeOf(req);
  return scope.sectorId ? sectorId === scope.sectorId : true;
};

/** Find a record by primary key inside the request's sector; null when missing or outside it. */
const findInScope = (Model, id, req, options = {}) =>
  Model.findOne({
    ...options,
    where: { ...(options.where || {}), [Model.primaryKeyAttribute]: id, ...scopeWhere(req) },
  });

/**
 * The sector a new record belongs to.
 * Sector users: always their own sector (anything sent is ignored).
 * Central users: `requested` (usually req.body.sector_node_id), else the switcher's sector.
 */
const sectorForCreate = async (req, requested = req.body?.sector_node_id, transaction) => {
  const scope = scopeOf(req);
  if (!scope.isCentral) return scope.userSectorId;
  const id = requested || scope.sectorId;
  if (!id) throw httpError(400, "Choose the sector this belongs to.");
  if (!(await isDataSector(id, transaction))) throw httpError(400, "The selected sector does not exist.");
  return id;
};

/** Throw 400 unless all records (with a sector_node_id) are in the same sector. */
const assertSameSector = (...records) => {
  const ids = new Set(records.filter(Boolean).map((r) => r.sector_node_id));
  if (ids.size > 1) throw httpError(400, "These records belong to different sectors.");
};

module.exports = {
  resolveScope,
  scopeWhere,
  scopeSql,
  inScope,
  findInScope,
  sectorForCreate,
  assertSameSector,
  isDataSector,
  httpError,
};
