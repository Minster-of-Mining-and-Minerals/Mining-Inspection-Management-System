"use strict";
const express = require("express");
const Joi = require("joi");
const schedules = require("../../controllers/inspection-controllers/scheduleController");
const inspections = require("../../controllers/inspection-controllers/inspectionController");
const { authorize, authorizeAny, authenticateToken } = require("../../middlewares/authMiddleware");
const { getMyStats } = require("../../controllers/team-controllers/myTeamController");
const files = require("../../controllers/inspection-controllers/inspectionFileController");
const multer = require("multer");
const crypto = require("crypto");
const { TMP } = require("../../services/fileStorage");
const { MAX_FILE_MB } = require("../../utils/formDefinition");

// One file per request into the private temp folder; the question's own limit is checked after
const fileUpload = multer({
  storage: multer.diskStorage({ destination: TMP, filename: (_req, _file, cb) => cb(null, crypto.randomUUID()) }),
  limits: { fileSize: MAX_FILE_MB * 1024 * 1024, files: 1, fields: 5 },
}).single("file");
const receiveFile = (req, res, next) =>
  fileUpload(req, res, (err) => {
    if (!err) return next();
    if (err.code === "LIMIT_FILE_SIZE") return res.status(413).json({ success: false, message: `Files can be at most ${MAX_FILE_MB} MB.` });
    return res.status(400).json({ success: false, message: err.message || "Could not read the upload." });
  });

const validate = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body ?? {}, { stripUnknown: true, abortEarly: true });
  if (error) return res.status(400).json({ success: false, message: error.details[0].message });
  req.body = value;
  next();
};

const date = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).messages({ "string.pattern.base": "Use a date like 2026-11-08." });
const scheduleFields = {
  form_id: Joi.string().guid().messages({ "string.guid": "Choose a checklist." }),
  name: Joi.string().trim().min(3).max(200).messages({ "string.min": "Give the schedule a name (at least 3 characters)." }),
  target_type: Joi.string().valid("assigned", "license_type", "licenses"),
  license_type: Joi.when("target_type", { is: "license_type", then: Joi.string().valid("exploration", "mining").required(), otherwise: Joi.any().strip() }).messages({
    "any.required": "Choose the license type.",
  }),
  license_ids: Joi.when("target_type", {
    is: "licenses",
    then: Joi.array().items(Joi.string().guid()).min(1).max(2000).required(),
    otherwise: Joi.any().strip(),
  }).messages({ "array.min": "Choose at least one license.", "any.required": "Choose at least one license." }),
  frequency: Joi.string().valid("once", "daily", "weekly", "monthly", "quarterly", "yearly", "every_n_days"),
  interval_days: Joi.when("frequency", { is: "every_n_days", then: Joi.number().integer().min(2).max(365).required(), otherwise: Joi.any().strip() }).messages({
    "any.required": "Say every how many days.",
  }),
  weekdays: Joi.when("frequency", {
    is: Joi.valid("daily", "weekly"),
    then: Joi.array().items(Joi.number().integer().min(0).max(6)).unique().max(7).allow(null),
    otherwise: Joi.any().strip(),
  }),
  month_day: Joi.when("frequency", { is: Joi.valid("monthly", "quarterly", "yearly"), then: Joi.number().integer().min(1).max(28).allow(null), otherwise: Joi.any().strip() }),
  start_date: date,
  end_date: date.allow(null, ""),
  due_days: Joi.number().integer().min(1).max(366).messages({ "number.min": "Allow at least 1 day." }),
  notes: Joi.string().trim().max(2000).allow("", null),
};
const req = (k, msg) => scheduleFields[k].required().messages({ "any.required": msg });
const createScheduleSchema = Joi.object({
  ...scheduleFields,
  form_id: req("form_id", "Choose a checklist."),
  name: req("name", "Give the schedule a name."),
  target_type: req("target_type", "Choose which licenses."),
  frequency: req("frequency", "Choose how often."),
  start_date: req("start_date", "Choose the start date."),
  due_days: req("due_days", "Say how many days the team has to submit."),
}).custom((v, h) => (v.end_date && v.end_date < v.start_date ? h.message("The end date is before the start date.") : v));
const updateScheduleSchema = Joi.object({ ...scheduleFields, status: Joi.string().valid("active", "paused", "ended") }).min(1);
const previewSchema = Joi.object({ ...scheduleFields, form_id: req("form_id", "Choose a checklist."), frequency: req("frequency", "Choose how often."), start_date: req("start_date", "Choose the start date."), target_type: req("target_type", "Choose which licenses."), due_days: scheduleFields.due_days.default(1) });

const answersSchema = Joi.object({ answers: Joi.object().unknown(true).required(), base_saved_at: Joi.date().iso().allow(null) });
const submitSchema = Joi.object({
  answers: Joi.object().unknown(true).required(),
  base_saved_at: Joi.date().iso().allow(null),
  location: Joi.object().unknown(true).allow(null),
  device: Joi.object().unknown(true).allow(null),
});
const returnSchema = Joi.object({ reason: Joi.string().trim().min(3).max(2000).required().messages({ "any.required": "Write what needs correcting.", "string.min": "Write what needs correcting." }) });
const assignmentSchema = Joi.object({ team_id: Joi.string().guid().allow(null), due_at: Joi.date().iso() }).min(1);

/**
 * /api/inspection-schedules   (rounds:* permissions)
 *   GET / · GET /:id · POST /preview · POST / · PUT /:id (also pause/end/resume via status) · DELETE /:id
 */
const scheduleRouter = express.Router();
scheduleRouter.get("/", authorize("rounds", "read"), schedules.getSchedules);
scheduleRouter.post("/preview", authorize("rounds", "read"), validate(previewSchema), schedules.previewSchedule);
scheduleRouter.get("/:id", authorize("rounds", "read"), schedules.getScheduleById);
scheduleRouter.post("/", authorize("rounds", "create"), validate(createScheduleSchema), schedules.createSchedule);
scheduleRouter.put("/:id", authorize("rounds", "update"), validate(updateScheduleSchema), schedules.updateSchedule);
scheduleRouter.delete("/:id", authorize("rounds", "delete"), schedules.deleteSchedule);

/**
 * /api/inspections
 *   GET /                       tasks (all, or own team's)        read_all | read_own
 *   GET /my                     my team's to-do and submitted      read_own | conduct
 *   GET /my/stats               my team's and my own progress    (any team member)
 *   GET /license/:licenseId     submitted inspections of a license
 *   GET /:id                    one task with its form, answers and history
 *   PUT /:id/answers            save answers                       conduct (team members)
 *   POST /:id/submit            submit (locks it; late after due)  conduct (team members)
 *   POST /:id/return            unlock for correction              review
 *   PUT /:id/assignment         other team / due time              assign
 */
const inspectionRouter = express.Router();
const readAny = authorizeAny([
  ["inspections", "read_all"],
  ["inspections", "read_own"],
]);
inspectionRouter.get("/", readAny, inspections.getInspections);
inspectionRouter.get("/team-progress", readAny, inspections.getTeamProgress);
// The filtered inspections as a CSV / JSON file (summary, or one row per answer)
inspectionRouter.get("/export", readAny, inspections.exportInspections);
inspectionRouter.get("/my", authorizeAny([["inspections", "read_own"], ["inspections", "conduct"]]), inspections.getMyTasks);
inspectionRouter.get("/my/stats", authenticateToken, getMyStats);
inspectionRouter.get("/license/:licenseId", readAny, inspections.getLicenseHistory);
inspectionRouter.get("/:id", readAny, inspections.getInspectionById);
inspectionRouter.put("/:id/answers", authorize("inspections", "conduct"), validate(answersSchema), inspections.saveAnswers);
// After submitting: only the sections filled in at the office (after_submit, e.g. 4.1)
inspectionRouter.put("/:id/office-answers", authorize("inspections", "conduct"), validate(answersSchema), inspections.saveOfficeAnswers);
// Files of answers (photos / documents / videos / signatures)
inspectionRouter.post("/:id/files", authorize("inspections", "conduct"), receiveFile, files.uploadFile);
inspectionRouter.get("/:id/files/links", readAny, files.getFileLinks);
inspectionRouter.get("/:id/files/:fileId", readAny, files.downloadFile);
inspectionRouter.delete("/:id/files/:fileId", authorize("inspections", "conduct"), files.deleteFile);
inspectionRouter.post("/:id/submit", authorize("inspections", "conduct"), validate(submitSchema), inspections.submitInspection);
inspectionRouter.post("/:id/return", authorize("inspections", "review"), validate(returnSchema), inspections.returnInspection);
inspectionRouter.put("/:id/assignment", authorize("inspections", "assign"), validate(assignmentSchema), inspections.updateAssignment);

// Signed file links (no login header; the signature in the URL is the permission)
const fileLinkRouter = express.Router();
fileLinkRouter.get("/:fileId", files.serveSignedFile);

module.exports = { schedules: scheduleRouter, inspections: inspectionRouter, fileLinks: fileLinkRouter };
