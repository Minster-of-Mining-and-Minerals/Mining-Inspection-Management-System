/**
 * Compares two form definitions.
 *
 * Used to
 *   - show a summary of changes before publishing ("3 added, 2 reworded, 1 removed"), and
 *   - decide whether the CURRENT version may be edited in place once inspections have
 *     been submitted with it: only changes that cannot alter the meaning of existing
 *     answers or scores are "safe".
 *
 * Safe:   wording / translation / hints of questions, sections and choices; reordering;
 *         adding an optional question; adding a section whose questions are all optional.
 * Unsafe: removing or re-typing a question; making a question required; removing a choice
 *         or table column; changing conditions or which licenses a section applies to;
 *         adding a required question; removing a status choice or changing its score /
 *         "action needed" rule (a question's own choices, or the form defaults it uses).
 *         Adding a status choice to a question is safe.
 */

/** A status question's choices: its own, or the form defaults. */
const choicesOf = (def, f) => (f?.status_options?.length ? f.status_options : def?.status_options || []);
const label2 = (o) => `${o.label}|${o.label_am ?? ""}`;

const fieldMap = (def) => {
  const m = new Map();
  for (const s of def?.sections || []) for (const f of s.fields || []) m.set(f.key, { field: f, section: s });
  return m;
};
const sectionMap = (def) => new Map((def?.sections || []).map((s) => [s.key, s]));
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const short = (t) => (String(t || "").length > 70 ? `${String(t).slice(0, 67)}…` : String(t || ""));

const WORDING_KEYS = ["label", "label_am", "help", "help_am"];
const SECTION_WORDING = ["title", "title_am", "description", "description_am", "number"];

/**
 * @returns {{
 *   added: string[], removed: string[], reworded: string[], changed: string[], moved: number,
 *   sectionsAdded: string[], sectionsRemoved: string[], statusOptionsChanged: boolean,
 *   unsafe: string[], hasChanges: boolean, summary: string
 * }}
 */
const diffDefinitions = (before, after) => {
  const out = { added: [], removed: [], reworded: [], changed: [], moved: 0, sectionsAdded: [], sectionsRemoved: [], statusOptionsChanged: false, unsafe: [] };
  const bf = fieldMap(before);
  const af = fieldMap(after);
  const bs = sectionMap(before);
  const as = sectionMap(after);

  // ---- sections ----
  for (const [key, s] of as) {
    if (!bs.has(key)) {
      out.sectionsAdded.push(s.title);
      continue;
    }
    const old = bs.get(key);
    if (!same(old.applies_to, s.applies_to)) {
      out.unsafe.push(`Section “${short(s.title)}”: which licenses it applies to was changed.`);
      out.changed.push(`Section: ${short(s.title)}`);
    }
    if (!same(old.show_if, s.show_if)) {
      out.unsafe.push(`Section “${short(s.title)}”: its condition was changed.`);
      out.changed.push(`Section: ${short(s.title)}`);
    }
    if (SECTION_WORDING.some((k) => !same(old[k], s[k]))) out.reworded.push(`Section: ${short(s.title)}`);
  }
  for (const [key, s] of bs) {
    if (!as.has(key)) {
      out.sectionsRemoved.push(s.title);
      if ((s.fields || []).length) out.unsafe.push(`Section “${short(s.title)}” was removed.`);
    }
  }

  // ---- questions ----
  for (const [key, { field: f }] of af) {
    if (!bf.has(key)) {
      out.added.push(short(f.label));
      if (f.required) out.unsafe.push(`New question “${short(f.label)}” is required (answers already submitted don't have it).`);
      continue;
    }
    const { field: o, section: oldSection } = bf.get(key);
    const label = short(f.label);
    if (o.type !== f.type) {
      out.unsafe.push(`“${label}”: the type of answer was changed.`);
      out.changed.push(label);
      continue;
    }
    if (WORDING_KEYS.some((k) => !same(o[k], f[k]))) out.reworded.push(label);

    const problems = [];
    if (!o.required && f.required) problems.push("it was made required");
    if (!same(o.show_if, f.show_if)) problems.push("its condition was changed");
    if (o.evidence !== f.evidence && f.evidence === "required") problems.push("photos were made required");
    if (o.options || f.options) {
      const newValues = new Set((f.options || []).map((x) => x.value));
      const removedChoices = (o.options || []).filter((x) => !newValues.has(x.value));
      if (removedChoices.length) problems.push(`choice(s) removed: ${removedChoices.map((x) => x.label).join(", ")}`);
      const oldLabels = new Map((o.options || []).map((x) => [x.value, `${x.label}|${x.label_am ?? ""}`]));
      if ((f.options || []).some((x) => oldLabels.has(x.value) && oldLabels.get(x.value) !== `${x.label}|${x.label_am ?? ""}`)) out.reworded.push(`${label} (choices)`);
      if ((f.options || []).some((x) => !oldLabels.has(x.value))) out.changed.push(`${label} (choices added)`);
    }
    if (o.columns || f.columns) {
      const newCols = new Map((f.columns || []).map((c) => [c.key, c]));
      const removedCols = (o.columns || []).filter((c) => !newCols.has(c.key));
      if (removedCols.length) problems.push(`table column(s) removed: ${removedCols.map((c) => c.label).join(", ")}`);
      const retyped = (o.columns || []).filter((c) => newCols.has(c.key) && newCols.get(c.key).type !== c.type);
      if (retyped.length) problems.push(`table column type changed: ${retyped.map((c) => c.label).join(", ")}`);
    }
    if (f.type === "status") {
      const oc = choicesOf(before, o);
      const nc = choicesOf(after, f);
      const nBy = new Map(nc.map((x) => [x.value, x]));
      const removedChoices = oc.filter((x) => !nBy.has(x.value));
      if (removedChoices.length) problems.push(`status choice(s) removed: ${removedChoices.map((x) => x.label).join(", ")}`);
      const rescored = oc.filter((x) => nBy.has(x.value) && (nBy.get(x.value).score !== x.score || nBy.get(x.value).action !== x.action));
      if (rescored.length) problems.push(`score or "action needed" changed for: ${rescored.map((x) => x.label).join(", ")}`);
      if (oc.some((x) => nBy.has(x.value) && label2(nBy.get(x.value)) !== label2(x))) out.reworded.push(`${label} (status choices)`);
      if (nc.some((x) => !oc.some((y) => y.value === x.value))) out.changed.push(`${label} (status choices added)`);
    }
    for (const k of ["unit", "min", "max", "prefill", "rows", "allow_add_rows", "max_files", "multiple", "with_name"]) {
      if (!same(o[k], f[k])) out.changed.push(`${label} (${k.replace("_", " ")})`);
    }
    if (problems.length) {
      out.unsafe.push(`“${label}”: ${problems.join("; ")}.`);
      out.changed.push(label);
    }
    const newSection = after.sections.find((s) => s.fields.some((x) => x.key === key));
    if (newSection && oldSection && newSection.key !== oldSection.key) out.moved++;
  }
  for (const [key, { field: o }] of bf) {
    if (!af.has(key)) {
      out.removed.push(short(o.label));
      out.unsafe.push(`Question “${short(o.label)}” was removed.`);
    }
  }

  // Order changes (same questions, different order)
  const orderOf = (def) => (def?.sections || []).flatMap((s) => [s.key, ...s.fields.map((f) => f.key)]).filter((k) => bf.has(k) || bs.has(k)).filter((k) => af.has(k) || as.has(k));
  const ob = orderOf(before);
  const oa = orderOf(after);
  if (!same(ob, oa)) out.moved = Math.max(out.moved, 1);

  // ---- status options ----
  const bo = before?.status_options || [];
  const ao = after?.status_options || [];
  if (!same(bo, ao)) out.statusOptionsChanged = true;
  out.reworded = [...new Set(out.reworded)];
  out.changed = [...new Set(out.changed)];
  const parts = [];
  if (out.added.length) parts.push(`${out.added.length} question${out.added.length === 1 ? "" : "s"} added`);
  if (out.reworded.length) parts.push(`${out.reworded.length} reworded`);
  if (out.changed.length) parts.push(`${out.changed.length} changed`);
  if (out.removed.length) parts.push(`${out.removed.length} removed`);
  if (out.sectionsAdded.length) parts.push(`${out.sectionsAdded.length} section${out.sectionsAdded.length === 1 ? "" : "s"} added`);
  if (out.sectionsRemoved.length) parts.push(`${out.sectionsRemoved.length} section${out.sectionsRemoved.length === 1 ? "" : "s"} removed`);
  if (out.moved) parts.push("order changed");
  if (out.statusOptionsChanged) parts.push("status options changed");
  out.hasChanges = parts.length > 0;
  out.summary = parts.length ? parts.join(", ") : "No changes";
  return out;
};

module.exports = { diffDefinitions };
