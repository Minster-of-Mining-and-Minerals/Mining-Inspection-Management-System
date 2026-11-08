/**
 * Shared filters and includes for company and license lists.
 */
const { Op, literal } = require("sequelize");
const { validate: isUuid } = require("uuid");
const { sequelize, AdminArea, Mineral, MineralCategory, Team } = require("../models");
const { likeContains } = require("../utils/search");

/** SQL: ids of the given area and every area below it (region -> zones -> woredas). */
const areaSubtreeSql = (areaId) => `
  WITH RECURSIVE sub AS (
    SELECT area_id FROM admin_areas WHERE area_id = ${sequelize.escape(areaId)}
    UNION ALL
    SELECT a.area_id FROM admin_areas a JOIN sub ON a.parent_id = sub.area_id
  ) SELECT area_id FROM sub`;

/**
 * License-level conditions from query params, as a SQL condition on a license
 * alias. Used both to filter licenses and to filter companies that have such a license.
 * Throws { status: 400 } on a bad id.
 */
const licenseConditions = (query, alias) => {
  const parts = [];
  const { area_id, mineral_id, license_type, license_status } = query;
  if (area_id) {
    if (!isUuid(area_id)) throw Object.assign(new Error("Invalid area_id."), { status: 400 });
    parts.push(`EXISTS (SELECT 1 FROM license_areas la WHERE la.license_id = ${alias}.license_id AND la.area_id IN (${areaSubtreeSql(area_id)}))`);
  }
  if (mineral_id) {
    if (!isUuid(mineral_id)) throw Object.assign(new Error("Invalid mineral_id."), { status: 400 });
    parts.push(`EXISTS (SELECT 1 FROM license_minerals lm WHERE lm.license_id = ${alias}.license_id AND lm.mineral_id = ${sequelize.escape(mineral_id)})`);
  }
  if (license_type) parts.push(`${alias}.license_type = ${sequelize.escape(String(license_type))}`);
  if (license_status) parts.push(`${alias}.status = ${sequelize.escape(String(license_status))}`);
  return parts;
};

/** Include for a license's areas with their parent and grandparent (for "Woreda, Zone, Region"). */
const licenseAreasInclude = {
  model: AdminArea,
  as: "areas",
  attributes: ["area_id", "level", "name", "name_am", "pcode", "parent_id", "center_lat", "center_lng"],
  through: { attributes: [] },
  include: [
    {
      model: AdminArea,
      as: "parent",
      attributes: ["area_id", "level", "name", "name_am", "parent_id"],
      include: [{ model: AdminArea, as: "parent", attributes: ["area_id", "level", "name", "name_am", "parent_id"] }],
    },
  ],
};

const licenseMineralsInclude = {
  model: Mineral,
  as: "minerals",
  attributes: ["mineral_id", "name", "name_am", "category_id"],
  through: { attributes: [] },
  include: [{ model: MineralCategory, as: "category", attributes: ["category_id", "name", "name_am"] }],
};

/** The team(s) responsible for a license. */
const licenseTeamsInclude = {
  model: Team,
  as: "teams",
  attributes: ["team_id", "name", "code", "is_active"],
  through: { attributes: [] },
};

/** Search on company name / Amharic name / TIN, or any of its license numbers. */
const companySearchCondition = (search) => {
  const term = likeContains(search);
  return {
    [Op.or]: [
      { name: { [Op.iLike]: term } },
      { name_am: { [Op.iLike]: term } },
      { tin: { [Op.iLike]: term } },
      literal(`EXISTS (SELECT 1 FROM company_licenses s WHERE s.company_id = "Company"."company_id" AND s.license_number ILIKE ${sequelize.escape(term)})`),
    ],
  };
};

const pageParams = (query, defaultLimit = 20) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || defaultLimit, 1), 200);
  return { page, limit, offset: (page - 1) * limit };
};

const pageMeta = (count, page, limit) => ({
  totalItems: count,
  totalPages: Math.ceil(count / limit),
  currentPage: page,
  itemsPerPage: limit,
});

module.exports = {
  areaSubtreeSql,
  licenseConditions,
  licenseAreasInclude,
  licenseMineralsInclude,
  licenseTeamsInclude,
  companySearchCondition,
  pageParams,
  pageMeta,
};
