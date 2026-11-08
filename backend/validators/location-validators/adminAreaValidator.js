"use strict";
const Joi = require("joi");

const validateBody = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body, { abortEarly: true, stripUnknown: true });
  if (error) return res.status(400).json({ success: false, message: error.details[0].message });
  req.body = value;
  next();
};

const createAreaSchema = Joi.object({
  level: Joi.string().valid("region", "zone", "woreda").required().messages({
    "any.only": "Level must be region, zone or woreda.",
    "any.required": "Level is required.",
  }),
  parent_id: Joi.string().guid().allow(null, "").optional().messages({ "string.guid": "Parent must be a valid id." }),
  name: Joi.string().trim().min(2).max(255).required().messages({
    "string.empty": "Name is required.",
    "string.min": "Name must be at least 2 characters.",
  }),
  name_am: Joi.string().trim().max(255).allow(null, "").optional(),
});

const updateAreaSchema = Joi.object({
  name: Joi.string().trim().min(2).max(255).optional(),
  name_am: Joi.string().trim().max(255).allow(null, "").optional(),
  is_active: Joi.boolean().optional(),
}).min(1).messages({ "object.min": "Nothing to update." });

const aliasSchema = Joi.object({
  alias: Joi.string().trim().min(1).max(255).required().messages({ "string.empty": "The spelling is required." }),
});

module.exports = {
  validateCreateArea: validateBody(createAreaSchema),
  validateUpdateArea: validateBody(updateAreaSchema),
  validateAreaAlias: validateBody(aliasSchema),
};
