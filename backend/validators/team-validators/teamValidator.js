"use strict";
const Joi = require("joi");

const validateBody = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body ?? {}, { abortEarly: true, stripUnknown: true });
  if (error) return res.status(400).json({ success: false, message: error.details[0].message });
  req.body = value;
  next();
};

const date = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).messages({ "string.pattern.base": "Dates must be YYYY-MM-DD." });

const teamFields = {
  name: Joi.string().trim().min(2).max(120).messages({ "string.min": "Team name must be at least 2 characters." }),
  code: Joi.string().trim().max(30).allow(null, ""),
  description: Joi.string().trim().max(2000).allow(null, ""),
};

const createTeamSchema = Joi.object({ ...teamFields, name: teamFields.name.required().messages({ "any.required": "Team name is required." }) });
const updateTeamSchema = Joi.object({ ...teamFields, is_active: Joi.boolean() }).min(1).messages({ "object.min": "Nothing to update." });

// Members are always user accounts
const addMemberSchema = Joi.object({
  user_id: Joi.string().guid().required().messages({ "any.required": "Choose a person.", "string.guid": "Choose a person." }),
  role: Joi.string().valid("leader", "member").default("member"),
  joined_on: date,
});

const updateMemberSchema = Joi.object({ role: Joi.string().valid("leader", "member").required() });
const removeMemberSchema = Joi.object({ left_on: date });

const teamLicensesSchema = Joi.object({
  license_ids: Joi.array().items(Joi.string().guid()).min(1).max(500).required().messages({ "array.min": "Choose at least one license." }),
});

module.exports = {
  validateCreateTeam: validateBody(createTeamSchema),
  validateUpdateTeam: validateBody(updateTeamSchema),
  validateAddMember: validateBody(addMemberSchema),
  validateUpdateMember: validateBody(updateMemberSchema),
  validateRemoveMember: validateBody(removeMemberSchema),
  validateTeamLicenses: validateBody(teamLicensesSchema),
};
