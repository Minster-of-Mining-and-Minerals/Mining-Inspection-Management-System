const { Op, literal } = require("sequelize");
const { validate: isUuid } = require("uuid");
const { sequelize, Company, CompanyLicense, Mineral, AdminArea, SectorNode } = require("../../models");
const { scopeWhere, scopeSql, inScope, findInScope, sectorForCreate } = require("../../services/sectorScope");
const {
  licenseConditions,
  licenseAreasInclude,
  licenseMineralsInclude,
  licenseTeamsInclude,
  companySearchCondition,
  pageParams,
  pageMeta,
} = require("../../services/companyQueryService");
const { likeContains } = require("../../utils/search");

const fail = (res, status, message) => res.status(status).json({ success: false, message });

const handleError = (res, error, fallback) => {
  if (error.status) return fail(res, error.status, error.message);
  if (error.name === "SequelizeUniqueConstraintError") {
    // Unique per sector: the constraint lists sector_node_id first
    const field = Object.keys(error.fields || {}).find((f) => f !== "sector_node_id");
    const label = { license_number: "license number", name_normalized: "company name", tin: "TIN" }[field] || field;
    return fail(res, 409, `A record with this ${label} already exists.`);
  }
  console.error(fallback, error);
  return fail(res, 500, fallback);
};

/** Check mineral ids and area ids exist (and are active); returns the rows. */
const loadLicenseLinks = async ({ mineral_ids, area_ids }, transaction) => {
  const minerals = mineral_ids?.length
    ? await Mineral.findAll({ where: { mineral_id: mineral_ids, is_active: true }, transaction })
    : [];
  if (mineral_ids && minerals.length !== new Set(mineral_ids).size) {
    throw Object.assign(new Error("One or more minerals are unknown or inactive."), { status: 400 });
  }
  const areas = area_ids?.length ? await AdminArea.findAll({ where: { area_id: area_ids, is_active: true }, transaction }) : [];
  if (area_ids && areas.length !== new Set(area_ids).size) {
    throw Object.assign(new Error("One or more locations are unknown or inactive."), { status: 400 });
  }
  return { minerals, areas };
};

const LICENSE_FIELDS = ["license_number", "license_type", "mineral_text", "issued_on", "expires_on", "date_note", "site_name", "status", "notes"];
const pickLicense = (body) => Object.fromEntries(LICENSE_FIELDS.filter((k) => body[k] !== undefined).map((k) => [k, body[k] === "" ? null : body[k]]));

const COMPANY_FIELDS = ["name", "name_am", "tin", "phone", "email", "address", "contact_person", "contact_phone", "notes"];
const pickCompany = (body) => Object.fromEntries(COMPANY_FIELDS.filter((k) => body[k] !== undefined).map((k) => [k, body[k] === "" ? null : body[k]]));

/** Sector name, shown to central users who see every sector. */
const sectorInclude = { model: SectorNode, as: "sector", attributes: ["sector_node_id", "name", "name_am"] };

const loadCompany = (id, transaction) =>
  Company.findByPk(id, {
    include: [
      sectorInclude,
      {
        model: CompanyLicense,
        as: "licenses",
        include: [licenseMineralsInclude, licenseAreasInclude, licenseTeamsInclude],
      },
    ],
    order: [[{ model: CompanyLicense, as: "licenses" }, "issued_on", "DESC NULLS LAST"]],
    transaction,
  });

/* =================== List companies =================== */
const getCompanies = async (req, res) => {
  try {
    const { page, limit, offset } = pageParams(req.query);
    const where = { ...scopeWhere(req) };
    if (req.query.is_active === "true" || req.query.is_active === "false") where.is_active = req.query.is_active === "true";
    const and = [];
    if (req.query.search?.trim()) and.push(companySearchCondition(req.query.search));

    // Companies that have at least one license matching the license filters
    const licConds = licenseConditions(req.query, "fl");
    if (licConds.length) {
      and.push(literal(`EXISTS (SELECT 1 FROM company_licenses fl WHERE fl.company_id = "Company"."company_id" AND ${licConds.join(" AND ")})`));
    }
    if (and.length) where[Op.and] = and;

    const { count, rows } = await Company.findAndCountAll({
      where,
      include: [sectorInclude],
      attributes: {
        include: [[literal(`(SELECT COUNT(*)::int FROM company_licenses c WHERE c.company_id = "Company"."company_id")`), "license_count"]],
      },
      order: [["name", "ASC"]],
      limit,
      offset,
    });

    // Licenses (with minerals and places) for this page of companies
    const ids = rows.map((c) => c.company_id);
    const licenses = ids.length
      ? await CompanyLicense.findAll({
          where: { company_id: ids },
          attributes: ["license_id", "company_id", "license_number", "license_type", "status", "issued_on"],
          include: [licenseMineralsInclude, licenseAreasInclude, licenseTeamsInclude],
        })
      : [];
    const byCompany = new Map(ids.map((id) => [id, []]));
    for (const l of licenses) byCompany.get(l.company_id).push(l);

    const data = rows.map((c) => ({ ...c.toJSON(), licenses: byCompany.get(c.company_id) }));
    return res.status(200).json({ success: true, data, meta: pageMeta(count, page, limit) });
  } catch (error) {
    return handleError(res, error, "Failed to fetch companies.");
  }
};

/* =================== One company with all its licenses =================== */
const getCompanyById = async (req, res) => {
  try {
    if (!isUuid(req.params.id)) return fail(res, 400, "Invalid company id.");
    const company = await loadCompany(req.params.id);
    if (!company || !inScope(req, company.sector_node_id)) return fail(res, 404, "Company not found.");
    return res.status(200).json({ success: true, data: company });
  } catch (error) {
    return handleError(res, error, "Failed to fetch company.");
  }
};

/* =================== Create company (optionally with its first licenses) =================== */
const createCompany = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const sector_node_id = await sectorForCreate(req, req.body.sector_node_id, t);
    const company = await Company.create({ ...pickCompany(req.body), sector_node_id, created_by: req.user.user_id }, { transaction: t });

    for (const lic of req.body.licenses || []) {
      const { minerals, areas } = await loadLicenseLinks(lic, t);
      const license = await CompanyLicense.create(
        { ...pickLicense(lic), company_id: company.company_id, sector_node_id, created_by: req.user.user_id },
        { transaction: t },
      );
      await license.setMinerals(minerals, { transaction: t });
      await license.setAreas(areas, { transaction: t });
    }

    await t.commit();
    return res.status(201).json({ success: true, message: "Company created.", data: await loadCompany(company.company_id) });
  } catch (error) {
    if (!t.finished) await t.rollback();
    return handleError(res, error, "Failed to create company.");
  }
};

/* =================== Edit company details =================== */
const updateCompany = async (req, res) => {
  try {
    if (!isUuid(req.params.id)) return fail(res, 400, "Invalid company id.");
    const company = await findInScope(Company, req.params.id, req);
    if (!company) return fail(res, 404, "Company not found.");
    await company.update({
      ...pickCompany(req.body),
      ...(req.body.is_active !== undefined && { is_active: req.body.is_active }),
    });
    return res.status(200).json({ success: true, message: "Company updated.", data: await loadCompany(company.company_id) });
  } catch (error) {
    return handleError(res, error, "Failed to update company.");
  }
};

/* =================== Licenses =================== */
const addLicense = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    if (!isUuid(req.params.id)) return fail(res, 400, "Invalid company id.");
    const company = await findInScope(Company, req.params.id, req, { transaction: t });
    if (!company) {
      await t.rollback();
      return fail(res, 404, "Company not found.");
    }
    const { minerals, areas } = await loadLicenseLinks(req.body, t);
    const license = await CompanyLicense.create(
      { ...pickLicense(req.body), company_id: company.company_id, sector_node_id: company.sector_node_id, created_by: req.user.user_id },
      { transaction: t },
    );
    await license.setMinerals(minerals, { transaction: t });
    await license.setAreas(areas, { transaction: t });
    await t.commit();
    return res.status(201).json({ success: true, message: "License added.", data: await loadCompany(company.company_id) });
  } catch (error) {
    if (!t.finished) await t.rollback();
    return handleError(res, error, "Failed to add license.");
  }
};

const updateLicense = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    if (!isUuid(req.params.licenseId)) return fail(res, 400, "Invalid license id.");
    const license = await findInScope(CompanyLicense, req.params.licenseId, req, { transaction: t });
    if (!license) {
      await t.rollback();
      return fail(res, 404, "License not found.");
    }
    const { minerals, areas } = await loadLicenseLinks(req.body, t);
    await license.update(pickLicense(req.body), { transaction: t });
    if (req.body.mineral_ids) await license.setMinerals(minerals, { transaction: t });
    if (req.body.area_ids) await license.setAreas(areas, { transaction: t });
    await t.commit();
    return res.status(200).json({ success: true, message: "License updated.", data: await loadCompany(license.company_id) });
  } catch (error) {
    if (!t.finished) await t.rollback();
    return handleError(res, error, "Failed to update license.");
  }
};

const deleteLicense = async (req, res) => {
  try {
    if (!isUuid(req.params.licenseId)) return fail(res, 400, "Invalid license id.");
    const license = await findInScope(CompanyLicense, req.params.licenseId, req);
    if (!license) return fail(res, 404, "License not found.");
    // Once inspections exist they will reference licenses; deleting will then be refused
    await license.destroy();
    return res.status(200).json({ success: true, message: "License deleted.", data: await loadCompany(license.company_id) });
  } catch (error) {
    if (error.name === "SequelizeForeignKeyConstraintError") {
      return fail(res, 409, "This license has inspections. Set its status to revoked or expired instead.");
    }
    return handleError(res, error, "Failed to delete license.");
  }
};

/* =================== Flat license list (for planning inspections) =================== */
const getLicenses = async (req, res) => {
  try {
    const { page, limit, offset } = pageParams(req.query, 50);
    const and = [scopeWhere(req), ...licenseConditions(req.query, `"CompanyLicense"`).map((c) => literal(c))];
    if (req.query.search?.trim()) {
      const term = likeContains(req.query.search);
      and.push({
        [Op.or]: [
          { license_number: { [Op.iLike]: term } },
          { site_name: { [Op.iLike]: term } },
          { "$company.name$": { [Op.iLike]: term } },
        ],
      });
    }
    const { count, rows } = await CompanyLicense.findAndCountAll({
      where: { [Op.and]: and },
      include: [{ model: Company, as: "company", attributes: ["company_id", "name", "name_am", "is_active"] }, sectorInclude, licenseMineralsInclude, licenseAreasInclude, licenseTeamsInclude],
      order: [[{ model: Company, as: "company" }, "name", "ASC"], ["license_number", "ASC"]],
      distinct: true,
      subQuery: false,
      limit,
      offset,
    });
    return res.status(200).json({ success: true, data: rows, meta: pageMeta(count, page, limit) });
  } catch (error) {
    return handleError(res, error, "Failed to fetch licenses.");
  }
};

/* =================== License areas for the map =================== */
/**
 * GET /api/licenses/map — every matching license with its area (GeoJSON in WGS 84), company, team,
 * last inspection score and open / overdue tasks. Same filters as the company list, plus
 * team_id, red_zone=true and overdue=true. Licenses without a surveyed area come back with
 * boundary null (the page says how many are not on the map).
 */
const getLicenseMap = async (req, res) => {
  try {
    const q = req.query;
    const where = [scopeSql(req, "l"), ...licenseConditions(q, "l")];
    const r = {};
    if (q.search?.trim()) {
      where.push(`(c.name ILIKE :term OR c.name_am ILIKE :term OR c.tin ILIKE :term OR l.license_number ILIKE :term)`);
      r.term = likeContains(q.search);
    }
    if (q.team_id) {
      if (!isUuid(q.team_id)) return fail(res, 400, "Invalid team_id.");
      where.push(`EXISTS (SELECT 1 FROM team_licenses tl WHERE tl.license_id = l.license_id AND tl.team_id = :team)`);
      r.team = q.team_id;
    }
    if (q.red_zone === "true") where.push(`l.notes ILIKE '%red zone%'`);
    if (q.overdue === "true") where.push(`EXISTS (SELECT 1 FROM inspections i WHERE i.license_id = l.license_id AND i.status <> 'submitted' AND i.due_at < NOW())`);
    if (q.is_active === "true" || q.is_active === "false") where.push(`c.is_active = ${q.is_active === "true"}`);

    const [rows] = await sequelize.query(
      `SELECT l.license_id, l.license_number, l.license_type, l.status, l.boundary, l.center_lat, l.center_lng, l.notes,
              l.travel_mode, l.airport, l.mineral_text,
              c.company_id, c.name AS company_name,
              t.team_id, t.name AS team_name,
              (SELECT string_agg(m.name, ', ' ORDER BY m.name) FROM license_minerals lm JOIN minerals m ON m.mineral_id = lm.mineral_id WHERE lm.license_id = l.license_id) AS minerals,
              (SELECT string_agg(DISTINCT COALESCE(g.name, p.name, a.name), ', ')
                 FROM license_areas la JOIN admin_areas a ON a.area_id = la.area_id
                 LEFT JOIN admin_areas p ON p.area_id = a.parent_id LEFT JOIN admin_areas g ON g.area_id = p.parent_id
                WHERE la.license_id = l.license_id) AS region,
              (SELECT string_agg(a.name, ', ' ORDER BY a.name) FROM license_areas la JOIN admin_areas a ON a.area_id = la.area_id AND a.level = 'woreda' WHERE la.license_id = l.license_id) AS woreda,
              (SELECT i.score::float FROM inspections i WHERE i.license_id = l.license_id AND i.status = 'submitted' ORDER BY i.submitted_at DESC LIMIT 1) AS last_score,
              (SELECT MAX(i.submitted_at) FROM inspections i WHERE i.license_id = l.license_id AND i.status = 'submitted') AS last_inspected_at,
              (SELECT COUNT(*)::int FROM inspections i WHERE i.license_id = l.license_id AND i.status <> 'submitted') AS open_tasks,
              (SELECT COUNT(*)::int FROM inspections i WHERE i.license_id = l.license_id AND i.status <> 'submitted' AND i.due_at < NOW()) AS overdue_tasks
         FROM company_licenses l
         JOIN companies c ON c.company_id = l.company_id
         LEFT JOIN LATERAL (SELECT tm.team_id, tm.name FROM team_licenses tl JOIN teams tm ON tm.team_id = tl.team_id
                             WHERE tl.license_id = l.license_id ORDER BY tl.created_at LIMIT 1) t ON TRUE
        WHERE ${where.join(" AND ")}
        ORDER BY c.name, l.license_number`,
      { replacements: r },
    );
    return res.status(200).json({
      success: true,
      data: rows,
      meta: { licenses: rows.length, companies: new Set(rows.map((x) => x.company_id)).size, without_area: rows.filter((x) => !x.boundary).length },
    });
  } catch (error) {
    return handleError(res, error, "Failed to load the map.");
  }
};

/* =================== Counts for the page header =================== */
const getCompanyStats = async (req, res) => {
  try {
    const s = scopeSql(req);
    const [[row]] = await sequelize.query(`
      SELECT
        (SELECT COUNT(*)::int FROM companies WHERE is_active AND ${s}) AS companies,
        (SELECT COUNT(*)::int FROM company_licenses WHERE ${s}) AS licenses,
        (SELECT COUNT(*)::int FROM company_licenses WHERE license_type = 'exploration' AND ${s}) AS exploration,
        (SELECT COUNT(*)::int FROM company_licenses WHERE license_type = 'mining' AND ${s}) AS mining,
        (SELECT COUNT(*)::int FROM company_licenses WHERE status = 'active' AND ${s}) AS active_licenses`);
    return res.status(200).json({ success: true, data: row });
  } catch (error) {
    return handleError(res, error, "Failed to fetch counts.");
  }
};

module.exports = {
  getCompanies,
  getCompanyById,
  createCompany,
  updateCompany,
  addLicense,
  updateLicense,
  deleteLicense,
  getLicenses,
  getLicenseMap,
  getCompanyStats,
};
