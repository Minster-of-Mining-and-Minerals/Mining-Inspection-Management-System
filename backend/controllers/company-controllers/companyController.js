const { Op, literal } = require("sequelize");
const { validate: isUuid } = require("uuid");
const { sequelize, Company, CompanyLicense, Mineral, AdminArea } = require("../../models");
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
    const field = Object.keys(error.fields || {})[0];
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

const loadCompany = (id, transaction) =>
  Company.findByPk(id, {
    include: [
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
    const where = {};
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
    if (!company) return fail(res, 404, "Company not found.");
    return res.status(200).json({ success: true, data: company });
  } catch (error) {
    return handleError(res, error, "Failed to fetch company.");
  }
};

/* =================== Create company (optionally with its first licenses) =================== */
const createCompany = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const company = await Company.create({ ...pickCompany(req.body), created_by: req.user.user_id }, { transaction: t });

    for (const lic of req.body.licenses || []) {
      const { minerals, areas } = await loadLicenseLinks(lic, t);
      const license = await CompanyLicense.create(
        { ...pickLicense(lic), company_id: company.company_id, created_by: req.user.user_id },
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
    const company = await Company.findByPk(req.params.id);
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
    const company = await Company.findByPk(req.params.id, { transaction: t });
    if (!company) {
      await t.rollback();
      return fail(res, 404, "Company not found.");
    }
    const { minerals, areas } = await loadLicenseLinks(req.body, t);
    const license = await CompanyLicense.create(
      { ...pickLicense(req.body), company_id: company.company_id, created_by: req.user.user_id },
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
    const license = await CompanyLicense.findByPk(req.params.licenseId, { transaction: t });
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
    const license = await CompanyLicense.findByPk(req.params.licenseId);
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
    const and = licenseConditions(req.query, `"CompanyLicense"`).map((c) => literal(c));
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
      where: and.length ? { [Op.and]: and } : {},
      include: [{ model: Company, as: "company", attributes: ["company_id", "name", "name_am", "is_active"] }, licenseMineralsInclude, licenseAreasInclude, licenseTeamsInclude],
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

/* =================== Counts for the page header =================== */
const getCompanyStats = async (req, res) => {
  try {
    const [[row]] = await sequelize.query(`
      SELECT
        (SELECT COUNT(*)::int FROM companies WHERE is_active) AS companies,
        (SELECT COUNT(*)::int FROM company_licenses) AS licenses,
        (SELECT COUNT(*)::int FROM company_licenses WHERE license_type = 'exploration') AS exploration,
        (SELECT COUNT(*)::int FROM company_licenses WHERE license_type = 'mining') AS mining,
        (SELECT COUNT(*)::int FROM company_licenses WHERE status = 'active') AS active_licenses`);
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
  getCompanyStats,
};
