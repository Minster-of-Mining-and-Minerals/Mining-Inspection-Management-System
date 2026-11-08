import type { FormDefinition, FormField, FormSection, LicenseTypeKey, ShowIf, StatusOption } from "@/redux/types/form";

/** Answer to a status (ሁኔታ) question. */
export interface StatusAnswer {
  value?: string;
  note?: string;
  action?: string;
}

export interface TableAnswer {
  rows: { label?: string; cells: Record<string, string> }[];
}

export type Answers = Record<string, any>;

/** The choices a status question offers: its own list, or the form's default choices. */
export const statusOptionsFor = (def: FormDefinition, f: FormField): StatusOption[] => (f.status_options?.length ? f.status_options : def.status_options);

/** Highest score a status question can give (its best choice). */
export const maxScoreOf = (options: StatusOption[]) => Math.max(0, ...options.map((o) => o.score ?? 0));

/** The choices a condition can test: status → its choices, select → its options. */
export const choicesFor = (def: FormDefinition, f: FormField | undefined) => (!f ? [] : f.type === "status" ? statusOptionsFor(def, f) : f.options || []);

/** The answer a show_if points at, as a single value (status → its value). */
const answerValue = (answers: Answers, key: string): string | undefined => {
  const a = answers[key];
  if (a == null) return undefined;
  if (typeof a === "object" && "value" in a) return (a as StatusAnswer).value;
  return typeof a === "string" ? a : undefined;
};

export const conditionMet = (cond: ShowIf | undefined, answers: Answers) => !cond || cond.in.includes(answerValue(answers, cond.field) ?? "\u0000");

export const sectionApplies = (s: FormSection, licenseType: LicenseTypeKey | null, answers: Answers) =>
  (!s.applies_to || !licenseType || s.applies_to.license_types.includes(licenseType)) && conditionMet(s.show_if, answers);

export const fieldVisible = (f: FormField, answers: Answers) => conditionMet(f.show_if, answers);

/** Sections and questions the inspector sees for this license and these answers. */
export const visibleStructure = (def: FormDefinition, licenseType: LicenseTypeKey | null, answers: Answers) =>
  def.sections
    .filter((s) => sectionApplies(s, licenseType, answers))
    .map((s) => ({ section: s, fields: s.fields.filter((f) => fieldVisible(f, answers)) }));

const isEmpty = (v: any) => v == null || v === "" || (Array.isArray(v) && v.length === 0);

/** Problems that stop submitting, keyed by question key. */
export const validateAnswers = (def: FormDefinition, licenseType: LicenseTypeKey | null, answers: Answers) => {
  const problems: Record<string, string> = {};
  for (const { fields } of visibleStructure(def, licenseType, answers)) {
    for (const f of fields) {
      const a = answers[f.key];
      if (f.type === "status") {
        const s = (a || {}) as StatusAnswer;
        if (!s.value) {
          if (f.required) problems[f.key] = "Choose a status.";
          continue;
        }
        const o = statusOptionsFor(def, f).find((x) => x.value === s.value);
        if (!s.note?.trim()) problems[f.key] = "Write a description of what you found.";
        else if (o?.action === "required" && !s.action?.trim()) problems[f.key] = "Describe the action needed.";
        continue;
      }
      if (f.type === "table") {
        const rows = ((a || {}) as TableAnswer).rows || [];
        if (f.required && !rows.some((r) => Object.values(r.cells || {}).some((v) => !isEmpty(v)))) problems[f.key] = "Fill in at least one row.";
        continue;
      }
      if (f.required && isEmpty(a)) {
        problems[f.key] = "This answer is required.";
        continue;
      }
      if (f.type === "number" && !isEmpty(a)) {
        const n = Number(a);
        if (!Number.isFinite(n)) problems[f.key] = "Enter a number.";
        else if (f.min != null && n < f.min) problems[f.key] = `Must be at least ${f.min}.`;
        else if (f.max != null && n > f.max) problems[f.key] = `Must be at most ${f.max}.`;
      }
    }
  }
  return problems;
};

/**
 * Compliance score from status answers: points of the chosen choices ÷ the best points those
 * questions could give (each question has its own choices), ignoring choices that don't count
 * (e.g. not applicable). 0…1, or null = nothing scored yet.
 */
export const scoreOf = (def: FormDefinition, licenseType: LicenseTypeKey | null, answers: Answers) => {
  const bySection: { key: string; title: string; score: number | null; counted: number }[] = [];
  let total = 0;
  let counted = 0;
  for (const { section, fields } of visibleStructure(def, licenseType, answers)) {
    let sTotal = 0;
    let sCount = 0;
    for (const f of fields) {
      if (f.type !== "status") continue;
      const options = statusOptionsFor(def, f);
      const o = options.find((x) => x.value === (answers[f.key] as StatusAnswer | undefined)?.value);
      const best = maxScoreOf(options);
      if (o && o.score != null && best > 0) {
        sTotal += o.score;
        sCount += best;
      }
    }
    if (fields.some((f) => f.type === "status")) bySection.push({ key: section.key, title: section.title, score: sCount ? sTotal / sCount : null, counted: sCount });
    total += sTotal;
    counted += sCount;
  }
  return { overall: counted ? total / counted : null, counted, bySection };
};

/** A unique key from a label: "Workers wear PPE" -> "workers_wear_ppe" (Latin letters only). */
export const keyFromLabel = (label: string, taken: Set<string>, fallback = "question") => {
  let base = label
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  if (!/^[a-z]/.test(base)) base = `${fallback}_${base}`.replace(/_+$/, "");
  let key = base || fallback;
  for (let i = 2; taken.has(key); i++) key = `${base}_${i}`;
  return key;
};

/** All question keys in a definition. */
export const allFieldKeys = (def: FormDefinition) => new Set(def.sections.flatMap((s) => s.fields.map((f) => f.key)));
