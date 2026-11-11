/**
 * Answers to a form version: which questions apply, what is missing, and the score.
 * Same rules as the frontend (features/forms/component/formLogic.ts), checked again on submit.
 *
 * Answers are keyed by question key:
 *   status      { value, note, action? }   note (description) and action: required only when the question is
 *   table       { rows: [{ label?, cells: { colKey: value } }] }
 *   status      … files?: [file_id]          evidence (photos / documents / videos)
 *   photo       [file_id]
 *   signature   { file_id, name } — or a list of them when several people sign
 *   checkboxes  [values]
 *   others      string / number
 * File ids are checked against the inspection's files by the controller before this runs.
 */
const { statusOptionsFor, questionText } = require("./formDefinition");

const answerValue = (answers, key) => {
  const a = answers?.[key];
  if (a == null) return undefined;
  if (typeof a === "object" && !Array.isArray(a) && "value" in a) return a.value;
  return typeof a === "string" ? a : undefined;
};
const conditionMet = (cond, answers) => !cond || cond.in.includes(answerValue(answers, cond.field) ?? "\u0000");

/** Sections and questions that apply to this license type and these answers. */
const visibleStructure = (def, licenseType, answers) =>
  (def.sections || [])
    .filter((s) => (!s.applies_to || !licenseType || s.applies_to.license_types.includes(licenseType)) && conditionMet(s.show_if, answers))
    .map((s) => ({ section: s, fields: (s.fields || []).filter((f) => conditionMet(f.show_if, answers)) }));

const isEmpty = (v) => v == null || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && v.length === 0);

/** @returns {{ key: string, label: string, problem: string }[]} */
const validateAnswers = (def, licenseType, answers = {}) => {
  const problems = [];
  const add = (f, problem) => problems.push({ key: f.key, label: questionText(f), problem });
  for (const { fields } of visibleStructure(def, licenseType, answers)) {
    for (const f of fields) {
      const a = answers[f.key];
      if (f.type === "photo") {
        const files = Array.isArray(a) ? a : [];
        if (f.required && !files.length) add(f, "Add at least one file.");
        else if (files.length > (f.max_files ?? 10)) add(f, "At most " + (f.max_files ?? 10) + " files.");
        continue;
      }
      if (f.type === "signature") {
        const list = (Array.isArray(a) ? a : a ? [a] : []).filter((x) => x && x.file_id);
        if (f.required && !list.length) add(f, "A signature is required.");
        else if (f.required && f.with_name !== false && list.some((x) => isEmpty(x.name))) add(f, "Write the name of each person who signed.");
        continue;
      }
      if (f.type === "status") {
        const s = a && typeof a === "object" ? a : {};
        if (!s.value) {
          if (f.required) add(f, "Choose a status.");
          continue;
        }
        const o = statusOptionsFor(def, f).find((x) => x.value === s.value);
        if (!o) add(f, "Choose one of the listed statuses.");
        else if (f.required && isEmpty(s.note)) add(f, "Write a description of what you found.");
        else if (f.required && o.action === "required" && isEmpty(s.action)) add(f, "Describe the action needed.");
        else if (f.evidence === "required" && !(Array.isArray(s.files) && s.files.length)) add(f, "Add at least one photo or file as evidence.");
        else if (Array.isArray(s.files) && s.files.length > (f.max_files ?? 10)) add(f, "At most " + (f.max_files ?? 10) + " files.");
        continue;
      }
      if (f.type === "table") {
        const rows = (a && a.rows) || [];
        if (f.required && !rows.some((r) => Object.values(r.cells || {}).some((v) => !isEmpty(v)))) add(f, "Fill in at least one row.");
        continue;
      }
      if (f.required && isEmpty(a)) {
        add(f, "This answer is required.");
        continue;
      }
      if (isEmpty(a)) continue;
      if (f.type === "number") {
        const n = Number(a);
        if (!Number.isFinite(n)) add(f, "Enter a number.");
        else if (f.min != null && n < f.min) add(f, `Must be at least ${f.min}.`);
        else if (f.max != null && n > f.max) add(f, `Must be at most ${f.max}.`);
      }
      if (f.type === "select" && !(f.options || []).some((o) => o.value === a)) add(f, "Choose one of the listed answers.");
      if (f.type === "checkboxes" && (!Array.isArray(a) || a.some((v) => !(f.options || []).some((o) => o.value === v)))) add(f, "Choose from the listed answers.");
    }
  }
  return problems;
};

/** Points of chosen status choices ÷ best possible points of those questions (0…1), or null if nothing scored. */
const scoreOf = (def, licenseType, answers = {}) => {
  let total = 0;
  let possible = 0;
  for (const { fields } of visibleStructure(def, licenseType, answers)) {
    for (const f of fields) {
      if (f.type !== "status") continue;
      const options = statusOptionsFor(def, f);
      const o = options.find((x) => x.value === answers[f.key]?.value);
      const best = Math.max(0, ...options.map((x) => x.score ?? 0));
      if (o && o.score != null && best > 0) {
        total += o.score;
        possible += best;
      }
    }
  }
  return possible ? total / possible : null;
};

module.exports = { visibleStructure, validateAnswers, scoreOf };
