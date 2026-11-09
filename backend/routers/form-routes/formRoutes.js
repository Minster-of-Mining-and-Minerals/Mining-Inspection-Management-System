"use strict";
const express = require("express");
const Joi = require("joi");
const c = require("../../controllers/form-controllers/formController");
const { authorize } = require("../../middlewares/authMiddleware");

/**
 * /api/forms
 *   GET    /                               forms with current + draft version summary
 *   GET    /for-license/:licenseId         active forms (current version) that apply to a license
 *   GET    /:id                            form, version list, current and draft definitions
 *   GET    /:id/versions/:versionId        one version with its definition
 *   POST   /                               new form (empty draft v1)
 *   PUT    /:id                            name / code / description / is_active
 *   POST   /:id/draft                      start a draft from the current version
 *   PUT    /:id/draft                      save the draft { definition, change_note }
 *   DELETE /:id/draft                      discard the draft
 *   POST   /:id/publish                    publish the draft { change_note }
 *   PUT    /:id/live                       change the current version directly { definition, note } (admin: forms:edit_live)
 *   POST   /:id/compare                    what changed vs the current version { definition? } (default: the draft)
 *   GET    /:id/versions/:versionId/edits  direct edits made to a version
 *   GET    /:id/assignments                which licenses use the form
 *   POST   /:id/assignments                { target_type, license_type | company_id | license_id }
 *   DELETE /assignments/:assignmentId
 */
const router = express.Router();

const validate = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body ?? {}, { stripUnknown: true, abortEarly: true });
  if (error) return res.status(400).json({ success: false, message: error.details[0].message });
  req.body = value;
  next();
};

const formFields = {
  name: Joi.string().trim().min(3).max(200).messages({ "string.min": "Form name must be at least 3 characters." }),
  name_am: Joi.string().trim().max(300).allow("", null),
  code: Joi.string().trim().max(40).pattern(/^[A-Za-z0-9_-]+$/).allow("", null).messages({ "string.pattern.base": "Code may use letters, numbers, - and _." }),
  description: Joi.string().trim().max(4000).allow("", null),
};
const createFormSchema = Joi.object({ ...formFields, name: formFields.name.required().messages({ "any.required": "Form name is required." }) });
const updateFormSchema = Joi.object({ ...formFields, is_active: Joi.boolean() }).min(1).messages({ "object.min": "Nothing to update." });
// The definition itself is checked in detail by utils/formDefinition.js
const saveDraftSchema = Joi.object({ definition: Joi.object().required().unknown(true), change_note: Joi.string().trim().max(2000).allow("", null) });
const publishSchema = Joi.object({ change_note: Joi.string().trim().max(2000).allow("", null) });
const liveEditSchema = Joi.object({ definition: Joi.object().required().unknown(true), note: Joi.string().trim().max(2000).allow("", null) });
const compareSchema = Joi.object({ definition: Joi.object().unknown(true) });
const assignmentSchema = Joi.object({
  target_type: Joi.string().valid("all", "license_type", "company", "license").required().messages({ "any.only": "Choose who the form is for." }),
  license_type: Joi.when("target_type", {
    is: "license_type",
    then: Joi.string().valid("exploration", "mining").required().messages({ "any.required": "Choose the license type.", "any.only": "License type must be exploration or mining." }),
    otherwise: Joi.forbidden(),
  }),
  company_id: Joi.when("target_type", {
    is: "company",
    then: Joi.string().guid().required().messages({ "any.required": "Choose the company.", "string.guid": "Choose the company." }),
    otherwise: Joi.forbidden(),
  }),
  license_id: Joi.when("target_type", {
    is: "license",
    then: Joi.string().guid().required().messages({ "any.required": "Choose the license.", "string.guid": "Choose the license." }),
    otherwise: Joi.forbidden(),
  }),
});

router.get("/", authorize("forms", "read"), c.getForms);
router.get("/for-license/:licenseId", authorize("forms", "read"), c.getFormsForLicense);
router.delete("/assignments/:assignmentId", authorize("forms", "assign"), c.removeAssignment);
router.get("/:id", authorize("forms", "read"), c.getFormById);
router.get("/:id/versions/:versionId", authorize("forms", "read"), c.getFormVersion);
router.post("/", authorize("forms", "create"), validate(createFormSchema), c.createForm);
router.put("/:id", authorize("forms", "update"), validate(updateFormSchema), c.updateForm);
router.post("/:id/draft", authorize("forms", "update"), c.createDraft);
router.put("/:id/draft", authorize("forms", "update"), validate(saveDraftSchema), c.saveDraft);
router.delete("/:id/draft", authorize("forms", "update"), c.discardDraft);
router.post("/:id/publish", authorize("forms", "publish"), validate(publishSchema), c.publishDraft);
router.put("/:id/live", authorize("forms", "edit_live"), validate(liveEditSchema), c.editLive);
router.post("/:id/compare", authorize("forms", "read"), validate(compareSchema), c.compareWithCurrent);
router.get("/:id/versions/:versionId/edits", authorize("forms", "read"), c.getVersionEdits);
router.get("/:id/assignments", authorize("forms", "read"), c.getAssignments);
router.post("/:id/assignments", authorize("forms", "assign"), validate(assignmentSchema), c.addAssignment);

module.exports = router;
