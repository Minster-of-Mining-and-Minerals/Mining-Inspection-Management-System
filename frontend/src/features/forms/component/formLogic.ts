import type { FormDefinition, FormField, FormSection, LicenseTypeKey, ShowIf, StatusOption } from "@/redux/types/form";

/** Answer to a status (ሁኔታ) question. */
export interface StatusAnswer {
  value?: string;
  note?: string;
  action?: string;
  /** Evidence: ids of uploaded files */
  files?: string[];
}

/** Answer to a signature question (a list when several people sign). */
export interface SignatureAnswer {
  file_id: string;
  name?: string;
}

export interface TableAnswer {
  rows: { label?: string; cells: Record<string, string> }[];
}

export type Answers = Record<string, any>;

const pickLabel = (en: string, am: string | null | undefined, language: "am" | "en") => (language === "en" ? en : am || en);

/**
 * A table's rows before anything is entered: one per team member when the table has team_rows
 * ("Team member 1", their name in the full_name column; at least min, at most max rows), then its
 * fixed rows. Without the team's names (form preview, no team) the minimum number of team rows.
 */
export const defaultTableRows = (f: FormField, language: "am" | "en", teamNames: string[] = []): TableAnswer["rows"] => {
  const team: TableAnswer["rows"] = [];
  if (f.team_rows) {
    const { label, label_am, min = 0, max } = f.team_rows;
    const names = max ? teamNames.slice(0, max) : teamNames;
    const count = Math.max(min, names.length);
    const nameCol = (f.columns || []).find((c) => c.key === "full_name") ? "full_name" : null;
    for (let i = 0; i < count; i++) team.push({ label: `${pickLabel(label, label_am, language)} ${i + 1}`, cells: nameCol && names[i] ? { [nameCol]: names[i] } : {} });
  }
  return [...team, ...(f.rows || []).map((r) => ({ label: pickLabel(r.label, r.label_am, language), cells: {} as Record<string, string> }))];
};

/** First column of a row added with "Add row": "Interviewed person 3" (numbered after the ones there), or empty. */
export const newRowLabel = (f: FormField, rows: TableAnswer["rows"], language: "am" | "en") => {
  if (!f.new_row_label) return "";
  const base = pickLabel(f.new_row_label, f.new_row_label_am, language);
  const n = rows.filter((r) => (r.label ?? "").startsWith(base)).length + 1;
  return `${base} ${n}`;
};

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

export interface Unfilled {
  key: string;
  sectionKey: string;
  /** What is missing: "Not answered", "No description" … */
  what: string;
}

/**
 * The check before submitting: every question that applies and isn't filled in (or is only
 * partly: a status without its description / action, a signature without the name). None of
 * these stop submitting unless the question is required; the inspector is only told.
 */
export const unfilledAnswers = (def: FormDefinition, licenseType: LicenseTypeKey | null, answers: Answers): Unfilled[] => {
  const out: Unfilled[] = [];
  for (const { section, fields } of visibleStructure(def, licenseType, answers)) {
    for (const f of fields) {
      const a = answers[f.key];
      const add = (what: string) => out.push({ key: f.key, sectionKey: section.key, what });
      if (f.type === "status") {
        const s = (a || {}) as StatusAnswer;
        if (!s.value) add("Not answered");
        else if (!s.note?.trim()) add("No description of what was found");
        else if (statusOptionsFor(def, f).find((o) => o.value === s.value)?.action === "required" && !s.action?.trim()) add("No action needed written");
      } else if (f.type === "signature") {
        const list = ((Array.isArray(a) ? a : a ? [a] : []) as SignatureAnswer[]).filter((x) => x?.file_id);
        if (!list.length) add("Not signed");
        else if (f.with_name !== false && list.some((x) => !x.name?.trim())) add("Name of a signer missing");
      } else if (f.type === "table") {
        const rows = ((a || {}) as TableAnswer).rows || [];
        const signCols = (f.columns || []).filter((c) => c.type === "signature").map((c) => c.key);
        if (signCols.length) {
          // A signature table: every row should be signed
          const unsigned = (rows.length ? rows : defaultTableRows(f, "en")).filter((r) => signCols.some((k) => isEmpty(r.cells?.[k]))).length;
          if (unsigned) add(`${unsigned} row${unsigned === 1 ? "" : "s"} not signed`);
        } else if (!rows.some((r) => Object.values(r.cells || {}).some((v) => !isEmpty(v)))) add("No row filled in");
      } else if (f.type === "photo") {
        if (!(Array.isArray(a) && a.length)) add("No file added");
      } else if (isEmpty(typeof a === "string" ? a.trim() : a)) add("Not answered");
    }
  }
  return out;
};

/** Problems that stop submitting, keyed by question key. */
export const validateAnswers = (def: FormDefinition, licenseType: LicenseTypeKey | null, answers: Answers) => {
  const problems: Record<string, string> = {};
  for (const { fields } of visibleStructure(def, licenseType, answers)) {
    for (const f of fields) {
      const a = answers[f.key];
      if (f.type === "photo") {
        const files = Array.isArray(a) ? a : [];
        if (f.required && !files.length) problems[f.key] = "Add at least one file.";
        else if (files.length > (f.max_files ?? 10)) problems[f.key] = `At most ${f.max_files ?? 10} files.`;
        continue;
      }
      if (f.type === "signature") {
        const list = ((Array.isArray(a) ? a : a ? [a] : []) as SignatureAnswer[]).filter((x) => x?.file_id);
        if (f.required && !list.length) problems[f.key] = "A signature is required.";
        else if (f.required && f.with_name !== false && list.some((x) => !x.name?.trim())) problems[f.key] = "Write the name of each person who signed.";
        continue;
      }
      if (f.type === "status") {
        const s = (a || {}) as StatusAnswer;
        if (!s.value) {
          if (f.required) problems[f.key] = "Choose a status.";
          continue;
        }
        const o = statusOptionsFor(def, f).find((x) => x.value === s.value);
        // Description and action stop submitting only on a required question (otherwise: the check before submitting)
        if (f.required && !s.note?.trim()) problems[f.key] = "Write a description of what you found.";
        else if (f.required && o?.action === "required" && !s.action?.trim()) problems[f.key] = "Describe the action needed.";
        else if (f.evidence === "required" && !s.files?.length) problems[f.key] = "Add at least one photo or file as evidence.";
        else if ((s.files?.length ?? 0) > (f.max_files ?? 10)) problems[f.key] = `At most ${f.max_files ?? 10} files.`;
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
