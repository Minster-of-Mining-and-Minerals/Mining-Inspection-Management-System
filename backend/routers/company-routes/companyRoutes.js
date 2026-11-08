"use strict";
const express = require("express");

const {
  getCompanies,
  getCompanyById,
  createCompany,
  updateCompany,
  addLicense,
  updateLicense,
  deleteLicense,
  getLicenses,
  getCompanyStats,
} = require("../../controllers/company-controllers/companyController");
const {
  getMinerals,
  createMineral,
  updateMineral,
  getMineralCategories,
  createMineralCategory,
  updateMineralCategory,
  deleteMineralCategory,
} = require("../../controllers/company-controllers/mineralController");
const { authorize, authorizeAny } = require("../../middlewares/authMiddleware");
const {
  validateCreateCompany,
  validateUpdateCompany,
  validateCreateLicense,
  validateUpdateLicense,
  validateCreateMineral,
  validateUpdateMineral,
  validateCreateMineralCategory,
  validateUpdateMineralCategory,
} = require("../../validators/company-validators/companyValidator");

/**
 * /api/companies
 *   GET    /?search=&area_id=&mineral_id=&license_type=&license_status=&is_active=&page=&limit=
 *   GET    /stats
 *   GET    /:id
 *   POST   /                       company (+ optional first licenses)
 *   PUT    /:id                    details / is_active
 *   POST   /:id/licenses           add a license
 */
const companies = express.Router();
companies.get("/", authorize("companies", "read"), getCompanies);
companies.get("/stats", authorize("companies", "read"), getCompanyStats);
companies.get("/:id", authorize("companies", "read"), getCompanyById);
companies.post("/", authorize("companies", "create"), validateCreateCompany, createCompany);
companies.put("/:id", authorize("companies", "update"), validateUpdateCompany, updateCompany);
companies.post("/:id/licenses", authorize("companies", "update"), validateCreateLicense, addLicense);

/**
 * /api/licenses
 *   GET    /?search=&area_id=&mineral_id=&license_type=&license_status=   flat list
 *   PUT    /:licenseId
 *   DELETE /:licenseId
 */
const licenses = express.Router();
licenses.get("/", authorize("companies", "read"), getLicenses);
licenses.put("/:licenseId", authorize("companies", "update"), validateUpdateLicense, updateLicense);
licenses.delete("/:licenseId", authorize("companies", "delete"), deleteLicense);

/**
 * /api/minerals — the standard list. Anyone who can see companies can read it
 * (it is needed to filter and edit licenses).
 */
const minerals = express.Router();
minerals.get("/", authorizeAny([["minerals", "read"], ["companies", "read"]]), getMinerals);
minerals.post("/", authorize("minerals", "create"), validateCreateMineral, createMineral);
minerals.put("/:id", authorize("minerals", "update"), validateUpdateMineral, updateMineral);

/**
 * /api/mineral-categories — editable grouping of minerals.
 * Managed by whoever manages the minerals list.
 */
const mineralCategories = express.Router();
mineralCategories.get("/", authorizeAny([["minerals", "read"], ["companies", "read"]]), getMineralCategories);
mineralCategories.post("/", authorize("minerals", "create"), validateCreateMineralCategory, createMineralCategory);
mineralCategories.put("/:id", authorize("minerals", "update"), validateUpdateMineralCategory, updateMineralCategory);
mineralCategories.delete("/:id", authorize("minerals", "update"), deleteMineralCategory);

module.exports = { companies, licenses, minerals, mineralCategories };
