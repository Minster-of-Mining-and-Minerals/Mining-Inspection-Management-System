/**
 * Format of a form version's `definition` (JSON) and its validation.
 *
 * {
 *   status_options: [                      // default ሁኔታ choices (new status questions start with a copy;
 *     { value, label, label_am,            //  a status question without its own list uses these)
 *       score: number | null,               // points for this choice; null = not counted (e.g. not applicable)
 *       note: "required",                   // kept for older versions: the inspector ALWAYS writes a description
 *       action: "none" | "required" }       // "action needed" text (becomes a finding later)
 *   ],
 *   sections: [
 *     { key, number?, title, title_am?, description?, description_am?,
 *       applies_to?: { license_types: ["exploration" | "mining"] },   // only for these licenses
 *       show_if?: { field: "<field key>", in: ["<value>", …] },        // only when an earlier answer is one of these
 *       fields: [
 *         { key, type, label, label_am?, help?, help_am?, required?, show_if?, ...type options }
 *       ] }
 *   ]
 * }
 *
 * Field types and their options
 *   status      status_options?: [...]  this question's own choices (same shape as above)
 *               evidence?: "none" | "optional" | "required"   (files with the answer: accept / max_files / max_size_mb as for photo)
 *               The inspector picks a choice AND writes a description (always required).
 *   text        prefill?: one of PREFILL_SOURCES               (filled from the license, editable)
 *   long_text
 *   number      unit?, min?, max?
 *   date
 *   select      options: [{ value, label, label_am? }]
 *   checkboxes  options: [{ value, label, label_am? }]
 *   table       columns: [{ key, label, label_am?, type: "text" | "number" | "date" | "select", options? }],
 *               rows?: [{ label, label_am? }]  (fixed first column, e.g. contract years),
 *               allow_add_rows?: boolean
 *   photo       accept?: ["image" | "document" | "video"] (default image), max_files?, max_size_mb? (per file, 1–MAX_FILE_MB)
 *   signature   multiple?: boolean, with_name?: boolean
 */
const Joi = require("joi");

const FIELD_TYPES = ["status", "text", "long_text", "number", "date", "select", "checkboxes", "table", "photo", "signature"];
const CHOICE_TYPES = ["status", "select"]; // can be used in show_if
const PREFILL_SOURCES = [
  "company.name",
  "license.license_number",
  "license.license_type",
  "license.minerals",
  "license.region",
  "license.zone_woreda",
  "license.site_name",
  "inspection.date",
  "inspection.team",
  "company.contact_person",
];

/** Kinds of file a question can take, and the largest size an admin may allow per file (matches nginx). */
const FILE_KINDS = ["image", "document", "video"];
const MAX_FILE_MB = 100;

const KEY = Joi.string()
  .pattern(/^[a-z][a-z0-9_]{0,59}$/)
  .required()
  .messages({ "string.pattern.base": "Keys use lower-case letters, numbers and _ (e.g. osh_ppe)." });
const text = (max = 500) => Joi.string().trim().max(max);
const optionList = Joi.array()
  .items(Joi.object({ value: text(80).required(), label: text(300).required(), label_am: text(300).allow("", null) }))
  .min(1);
const showIf = Joi.object({ field: KEY, in: Joi.array().items(text(80)).min(1).required() });

const statusOptionSchema = Joi.object({
  value: text(40).required(),
  label: text(120).required(),
  label_am: text(120).allow("", null),
  score: Joi.number().min(0).max(100).allow(null).required(),
  note: Joi.string().valid("optional", "required").default("required"),
  action: Joi.string().valid("none", "required").default("none"),
});

const statusOptionList = Joi.array().items(statusOptionSchema).min(2).max(10);

const fieldSchema = Joi.object({
  key: KEY,
  type: Joi.string().valid(...FIELD_TYPES).required(),
  label: text(1000).allow("", null), // English (optional)
  label_am: text(1000).allow("", null), // Amharic: the question's main text
  help: text(2000).allow("", null),
  help_am: text(2000).allow("", null),
  required: Joi.boolean().default(false),
  show_if: showIf,
  // type options
  status_options: Joi.when("type", { is: "status", then: statusOptionList, otherwise: Joi.forbidden() }),
  evidence: Joi.when("type", { is: "status", then: Joi.string().valid("none", "optional", "required").default("optional"), otherwise: Joi.forbidden() }),
  prefill: Joi.when("type", { is: "text", then: Joi.string().valid(...PREFILL_SOURCES), otherwise: Joi.forbidden() }),
  unit: Joi.when("type", { is: "number", then: text(40).allow("", null), otherwise: Joi.forbidden() }),
  min: Joi.when("type", { is: "number", then: Joi.number(), otherwise: Joi.forbidden() }),
  max: Joi.when("type", { is: "number", then: Joi.number(), otherwise: Joi.forbidden() }),
  options: Joi.when("type", { is: Joi.valid("select", "checkboxes"), then: optionList.required(), otherwise: Joi.forbidden() }),
  columns: Joi.when("type", {
    is: "table",
    then: Joi.array()
      .items(
        Joi.object({
          key: KEY,
          label: text(300).required(),
          label_am: text(300).allow("", null),
          type: Joi.string().valid("text", "number", "date", "select").default("text"),
          options: Joi.when("type", { is: "select", then: optionList.required(), otherwise: Joi.forbidden() }),
        }),
      )
      .min(1)
      .required(),
    otherwise: Joi.forbidden(),
  }),
  rows: Joi.when("type", {
    is: "table",
    then: Joi.array().items(Joi.object({ label: text(200).required(), label_am: text(200).allow("", null) })),
    otherwise: Joi.forbidden(),
  }),
  allow_add_rows: Joi.when("type", { is: "table", then: Joi.boolean().default(true), otherwise: Joi.forbidden() }),
  // Files: a photo / file question, or the evidence of a status question
  accept: Joi.when("type", { is: Joi.valid("photo", "status"), then: Joi.array().items(Joi.string().valid(...FILE_KINDS)).min(1).unique().default(["image"]), otherwise: Joi.forbidden() }),
  max_files: Joi.when("type", { is: Joi.valid("photo", "status"), then: Joi.number().integer().min(1).max(30).default(10), otherwise: Joi.forbidden() }),
  max_size_mb: Joi.when("type", { is: Joi.valid("photo", "status"), then: Joi.number().min(1).max(MAX_FILE_MB).default(20), otherwise: Joi.forbidden() }),
  multiple: Joi.when("type", { is: "signature", then: Joi.boolean().default(false), otherwise: Joi.forbidden() }),
  with_name: Joi.when("type", { is: "signature", then: Joi.boolean().default(true), otherwise: Joi.forbidden() }),
});

const sectionSchema = Joi.object({
  key: KEY,
  number: text(20).allow("", null),
  title: text(500).required(),
  title_am: text(500).allow("", null),
  description: text(4000).allow("", null),
  description_am: text(4000).allow("", null),
  applies_to: Joi.object({ license_types: Joi.array().items(Joi.string().valid("exploration", "mining")).min(1).unique() }),
  show_if: showIf,
  fields: Joi.array().items(fieldSchema).default([]),
});

const definitionSchema = Joi.object({
  status_options: statusOptionList.required(),
  sections: Joi.array().items(sectionSchema).default([]),
});

/**
 * @param {object} definition
 * @param {{ forPublish?: boolean }} options  publishing also requires at least one question
 * @returns {{ value?: object, errors: string[] }}
 */
const validateDefinition = (definition, { forPublish = false } = {}) => {
  const { error, value } = definitionSchema.validate(definition, { abortEarly: false, stripUnknown: true });
  if (error) {
    return { errors: [...new Set(error.details.map((d) => `${d.path.join(" › ")}: ${d.message.replace(/^"[^"]*" /, "")}`))].slice(0, 20) };
  }
  const errors = [];

  // Status option values must be unique (form defaults and each question's own list)
  const statusValues = value.status_options.map((o) => o.value);
  if (new Set(statusValues).size !== statusValues.length) errors.push("Status options: each option needs a different value.");
  const statusChoicesOf = (f) => (f.status_options?.length ? f.status_options : value.status_options);

  // Keys unique across the whole form; show_if must point to an earlier choice question
  const seen = new Map(); // key -> field
  const sectionKeys = new Set();
  const checkShowIf = (where, cond) => {
    if (!cond) return;
    const target = seen.get(cond.field);
    if (!target) return errors.push(`${where}: "show if" refers to "${cond.field}", which is not an earlier question.`);
    if (!CHOICE_TYPES.includes(target.type)) return errors.push(`${where}: "show if" must refer to a status or choice question.`);
    const allowed = (target.type === "status" ? statusChoicesOf(target) : target.options).map((o) => o.value);
    const bad = cond.in.filter((v) => !allowed.includes(v));
    if (bad.length) errors.push(`${where}: "show if" uses unknown answer(s) ${bad.join(", ")}.`);
  };

  for (const s of value.sections) {
    if (sectionKeys.has(s.key)) errors.push(`Section "${s.title}": key "${s.key}" is used twice.`);
    sectionKeys.add(s.key);
    checkShowIf(`Section "${s.title}"`, s.show_if);
    for (const f of s.fields) {
      const where = `Section "${s.title}" › "${questionText(f).slice(0, 60)}"`;
      if (!f.label_am?.trim() && !f.label?.trim()) errors.push(`Section "${s.title}": a question has no text. Write it in Amharic.`);
      if (seen.has(f.key)) errors.push(`${where}: key "${f.key}" is already used by another question.`);
      checkShowIf(where, f.show_if);
      if (f.type === "number" && f.min != null && f.max != null && f.min > f.max) errors.push(`${where}: minimum is above maximum.`);
      if (f.options) {
        const vals = f.options.map((o) => o.value);
        if (new Set(vals).size !== vals.length) errors.push(`${where}: each choice needs a different value.`);
      }
      if (f.status_options) {
        const vals = f.status_options.map((o) => o.value);
        if (new Set(vals).size !== vals.length) errors.push(`${where}: each status choice needs a different value.`);
        if (f.status_options.every((o) => o.score == null)) errors.push(`${where}: at least one status choice needs a score.`);
      }
      if (f.columns) {
        const keys = f.columns.map((c) => c.key);
        if (new Set(keys).size !== keys.length) errors.push(`${where}: each table column needs a different key.`);
      }
      seen.set(f.key, f);
    }
  }

  if (forPublish) {
    if (!value.sections.length) errors.push("Add at least one section before publishing.");
    if (!value.sections.some((s) => s.fields.length)) errors.push("Add at least one question before publishing.");
    for (const s of value.sections) if (!s.fields.length) errors.push(`Section "${s.title}" has no questions.`);
  }

  return errors.length ? { errors } : { value, errors: [] };
};

/** Quick counts for lists: sections, questions, scored status questions. */
const summarizeDefinition = (definition) => {
  const sections = definition?.sections || [];
  const fields = sections.flatMap((s) => s.fields || []);
  return {
    sections: sections.length,
    questions: fields.length,
    status_questions: fields.filter((f) => f.type === "status").length,
  };
};

/** A question's text for messages: Amharic, or English when there is no Amharic. */
const questionText = (f) => (f?.label_am?.trim() || f?.label?.trim() || f?.key || "");

/** The choices a status question offers: its own list, or the form's defaults. */
const statusOptionsFor = (definition, field) => (field?.status_options?.length ? field.status_options : definition?.status_options || []);

/** A new, empty definition with the default status options. */
const emptyDefinition = () => ({ status_options: DEFAULT_STATUS_OPTIONS.map((o) => ({ ...o })), sections: [] });

const DEFAULT_STATUS_OPTIONS = [
  { value: "met", label: "Met", label_am: "ተሟልቷል", score: 1, note: "required", action: "none" },
  { value: "partial", label: "Partly met", label_am: "በከፊል", score: 0.5, note: "required", action: "none" },
  { value: "not_met", label: "Not met", label_am: "አልተሟላም", score: 0, note: "required", action: "none" },
  { value: "na", label: "Not applicable", label_am: "አይመለከተውም", score: null, note: "required", action: "none" },
];

module.exports = {
  FIELD_TYPES,
  FILE_KINDS,
  MAX_FILE_MB,
  PREFILL_SOURCES,
  DEFAULT_STATUS_OPTIONS,
  validateDefinition,
  summarizeDefinition,
  statusOptionsFor,
  questionText,
  emptyDefinition,
};
