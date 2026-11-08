"use strict";
const Joi = require("joi");

const validateBody = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body, { abortEarly: true, stripUnknown: true });
  if (error) return res.status(400).json({ success: false, message: error.details[0].message });
  req.body = value;
  next();
};

const optionalText = (max) => Joi.string().trim().max(max).allow(null, "").optional();
const ETHIOPIAN_PHONE = /^(\+251|0)(9|7|1)\d{8}$/;

const licenseFields = {
  license_number: Joi.string().trim().min(3).max(100).messages({
    "string.empty": "License number is required.",
    "string.min": "License number looks too short.",
  }),
  license_type: Joi.string().valid("exploration", "mining").messages({
    "any.only": "License type must be exploration or mining.",
  }),
  mineral_ids: Joi.array().items(Joi.string().guid()).unique().max(20).messages({
    "string.guid": "Each mineral must be a valid id.",
  }),
  area_ids: Joi.array().items(Joi.string().guid()).unique().max(50).messages({
    "string.guid": "Each location must be a valid id.",
  }),
  mineral_text: optionalText(255),
  // Kept as plain YYYY-MM-DD text so no timezone can shift the day
  issued_on: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).allow(null, "").optional().messages({ "string.pattern.base": "Issue date must be YYYY-MM-DD." }),
  expires_on: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).allow(null, "").optional().messages({ "string.pattern.base": "Expiry date must be YYYY-MM-DD." }),
  date_note: optionalText(255),
  site_name: optionalText(255),
  status: Joi.string().valid("active", "suspended", "expired", "revoked").messages({
    "any.only": "Status must be active, suspended, expired or revoked.",
  }),
  notes: optionalText(5000),
};

const createLicenseSchema = Joi.object({
  ...licenseFields,
  license_number: licenseFields.license_number.required(),
  license_type: licenseFields.license_type.required(),
  status: licenseFields.status.default("active"),
}).custom((v, h) => (v.issued_on && v.expires_on && new Date(v.expires_on) < new Date(v.issued_on) ? h.message("Expiry date cannot be before the issue date.") : v));

const updateLicenseSchema = Joi.object(licenseFields)
  .min(1)
  .messages({ "object.min": "Nothing to update." })
  .custom((v, h) => (v.issued_on && v.expires_on && new Date(v.expires_on) < new Date(v.issued_on) ? h.message("Expiry date cannot be before the issue date.") : v));

const companyFields = {
  name: Joi.string().trim().min(2).max(255).messages({
    "string.empty": "Company name is required.",
    "string.min": "Company name must be at least 2 characters.",
  }),
  name_am: optionalText(255),
  tin: Joi.string().trim().pattern(/^\d{10}$/).allow(null, "").optional().messages({ "string.pattern.base": "TIN must be 10 digits." }),
  phone: Joi.string().trim().pattern(ETHIOPIAN_PHONE).allow(null, "").optional().messages({
    "string.pattern.base": "Phone must be an Ethiopian number, e.g. 0911234567 or +251911234567.",
  }),
  email: Joi.string().trim().email().allow(null, "").optional().messages({ "string.email": "Please enter a valid email." }),
  address: optionalText(2000),
  contact_person: optionalText(150),
  contact_phone: Joi.string().trim().pattern(ETHIOPIAN_PHONE).allow(null, "").optional().messages({
    "string.pattern.base": "Contact phone must be an Ethiopian number, e.g. 0911234567.",
  }),
  notes: optionalText(5000),
};

const createCompanySchema = Joi.object({
  ...companyFields,
  name: companyFields.name.required(),
  licenses: Joi.array().items(createLicenseSchema).max(50).optional(),
});

const updateCompanySchema = Joi.object({ ...companyFields, is_active: Joi.boolean().optional() })
  .min(1)
  .messages({ "object.min": "Nothing to update." });

const mineralSchema = {
  name: Joi.string().trim().min(2).max(120),
  name_am: optionalText(120),
  category_id: Joi.string().guid().messages({ "string.guid": "Category must be a valid id." }),
  aliases: Joi.array().items(Joi.string().trim().min(1).max(120)).max(30),
};

const createMineralSchema = Joi.object({
  ...mineralSchema,
  name: mineralSchema.name.required(),
  category_id: mineralSchema.category_id.required().messages({ "any.required": "Category is required." }),
});
const updateMineralSchema = Joi.object({ ...mineralSchema, is_active: Joi.boolean() }).min(1);

const categorySchema = {
  name: Joi.string().trim().min(2).max(120).messages({ "string.min": "Name must be at least 2 characters." }),
  name_am: optionalText(120),
  sort_order: Joi.number().integer().min(0).max(100000),
};
const createCategorySchema = Joi.object({ ...categorySchema, name: categorySchema.name.required() });
const updateCategorySchema = Joi.object({ ...categorySchema, is_active: Joi.boolean() })
  .min(1)
  .messages({ "object.min": "Nothing to update." });

module.exports = {
  validateCreateCompany: validateBody(createCompanySchema),
  validateUpdateCompany: validateBody(updateCompanySchema),
  validateCreateLicense: validateBody(createLicenseSchema),
  validateUpdateLicense: validateBody(updateLicenseSchema),
  validateCreateMineral: validateBody(createMineralSchema),
  validateUpdateMineral: validateBody(updateMineralSchema),
  validateCreateMineralCategory: validateBody(createCategorySchema),
  validateUpdateMineralCategory: validateBody(updateCategorySchema),
};
