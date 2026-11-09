"use client";

import { Camera, PenLine, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { FormDefinition, FormField, FormSection, LicenseTypeKey, StatusOption } from "@/redux/types/form";
import { Answers, StatusAnswer, TableAnswer, maxScoreOf, statusOptionsFor, visibleStructure } from "./formLogic";
import { FileAnswer, SignatureAnswerInput } from "./FormFiles";

export type FormLanguage = "am" | "en";

interface Props {
  definition: FormDefinition;
  licenseType: LicenseTypeKey | null;
  answers: Answers;
  onChange: (key: string, value: any) => void;
  /** Problems to show under questions (key -> message) */
  problems?: Record<string, string>;
  /** One language at a time: Amharic (falls back to English where missing) or English */
  language?: FormLanguage;
  previewMode?: boolean;
  /** Submitted inspections: show the answers without letting them change */
  readOnly?: boolean;
}

/** Text in the chosen language; Amharic falls back to English when a translation is missing. */
export const pickText = (en: string | null | undefined, am: string | null | undefined, language: FormLanguage = "am") =>
  (language === "am" ? am || en : en || am) ?? "";

const L = (en: string, am: string | null | undefined, language: FormLanguage) => <span lang={language === "am" && am ? "am" : "en"}>{pickText(en, am, language)}</span>;

const textareaClass =
  "w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50";

/** Whole form, all sections at once (form previews). The inspection page shows it step by step with the pieces below. */
export function FormRenderer({ definition, licenseType, answers, onChange, problems = {}, language = "am", previewMode, readOnly }: Props) {
  const structure = visibleStructure(definition, licenseType, answers);

  return (
    <fieldset disabled={readOnly} className="m-0 min-w-0 space-y-6 border-0 p-0">
      {structure.map(({ section, fields }) => (
        <section key={section.key} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <SectionHeader section={section} language={language} />
          <ol className="divide-y">
            {fields.map((f, i) => (
              <li key={f.key} className={problems[f.key] ? "bg-red-50/60" : ""}>
                <QuestionBlock definition={definition} field={f} index={i + 1} value={answers[f.key]} onChange={(v) => onChange(f.key, v)} problem={problems[f.key]} language={language} previewMode={previewMode} />
              </li>
            ))}
          </ol>
        </section>
      ))}
      {structure.length === 0 && <p className="py-10 text-center text-sm text-slate-500">No questions apply.</p>}
    </fieldset>
  );
}

export function SectionHeader({ section, language, compact }: { section: FormSection; language: FormLanguage; compact?: boolean }) {
  const description = pickText(section.description, section.description_am, language);
  return (
    <header className={compact ? "" : "border-b bg-slate-50 px-4 py-3"}>
      <h3 className={`font-semibold text-primary ${compact ? "text-sm" : ""}`}>
        {section.number && <span className="mr-2 text-golden-deep">{section.number}.</span>}
        {L(section.title, section.title_am, language)}
      </h3>
      {description && !compact && <p className="mt-1 whitespace-pre-line text-xs text-slate-600">{description}</p>}
    </header>
  );
}

/** One question: its text, the answer input and any problem. `large` = the one-question-at-a-time view. */
export function QuestionBlock({
  definition,
  field: f,
  index,
  value,
  onChange,
  problem,
  language,
  previewMode,
  large,
}: {
  definition: FormDefinition;
  field: FormField;
  index?: number;
  value: any;
  onChange: (v: any) => void;
  problem?: string;
  language: FormLanguage;
  previewMode?: boolean;
  large?: boolean;
}) {
  const options = f.type === "status" ? statusOptionsFor(definition, f) : [];
  const input = (part: InputPart) => <FieldInput field={f} options={options} value={value} onChange={onChange} language={language} previewMode={previewMode} large={large} part={part} />;
  const problemLine = problem && (
    <p role="alert" className="text-sm font-medium text-red-600">
      {problem}
    </p>
  );

  if (large) {
    // Question card with the answer buttons; the evidence (description, photos) underneath it
    return (
      <div id={`answer-${f.key}`} className="scroll-mt-36 space-y-3">
        <div className={`space-y-4 rounded-xl border bg-white p-4 shadow-sm sm:p-5 ${problem ? "border-red-300" : "border-slate-200"}`}>
          <QuestionLabel field={f} index={index} language={language} large />
          {input(f.type === "status" ? "main" : "all")}
        </div>
        {f.type === "status" && input("extra")}
        {problemLine}
      </div>
    );
  }
  return (
    <div id={`answer-${f.key}`} className="scroll-mt-36 space-y-2 px-4 py-3">
      <QuestionLabel field={f} index={index} language={language} />
      {input("all")}
      {problemLine}
    </div>
  );
}

function QuestionLabel({ field, index, language, large }: { field: FormField; index?: number; language: FormLanguage; large?: boolean }) {
  const help = pickText(field.help, field.help_am, language);
  return (
    <div className={`flex gap-2 text-slate-900 ${large ? "text-base font-semibold leading-relaxed sm:text-lg" : "text-sm font-medium"}`}>
      {index != null && <span className={`shrink-0 ${large ? "text-slate-900" : "w-6 text-right text-slate-400"}`}>{index}.</span>}
      <div className="min-w-0">
        {L(field.label, field.label_am, language)}
        {field.required && <span className="ml-1 text-red-500">*</span>}
        {help && <p className={`mt-0.5 font-normal text-slate-500 ${large ? "text-sm" : "text-xs"}`}>{help}</p>}
      </div>
    </div>
  );
}

type InputPart = "all" | "main" | "extra";

/** Colour of a status choice by what it scores: best = green, partly = amber, zero = red, not counted = grey. */
const choiceTone = (o: StatusOption, best: number) =>
  o.score == null
    ? { text: "text-slate-500", soft: "bg-slate-100" }
    : o.score >= best && best > 0
      ? { text: "text-green-700", soft: "bg-green-50" }
      : o.score === 0
        ? { text: "text-red-700", soft: "bg-red-50" }
        : { text: "text-amber-700", soft: "bg-amber-50" };

/** A field label like "ማስረጃ / ምልከታ · ግዴታ". */
const FieldLabel = ({ children, required, am, htmlFor }: { children: React.ReactNode; required?: boolean; am: boolean; htmlFor?: string }) => (
  <label htmlFor={htmlFor} className="block text-xs font-medium text-slate-600">
    {children}
    {required && <span className="ml-1 font-bold text-red-600">· {am ? "ግዴታ" : "required"}</span>}
  </label>
);

function FieldInput({
  field: f,
  options,
  value,
  onChange,
  language,
  previewMode,
  large,
  part = "all",
}: {
  field: FormField;
  options: StatusOption[];
  value: any;
  onChange: (v: any) => void;
  language: FormLanguage;
  previewMode?: boolean;
  large?: boolean;
  part?: InputPart;
}) {
  const optLabel = (o: { label: string; label_am?: string | null }) => pickText(o.label, o.label_am, language);
  const pad = large ? "" : "pl-8";
  const am = language === "am";
  // Big answer buttons (two per row) in the one-question view
  const choiceWrap = large ? "grid grid-cols-2 gap-2" : "flex flex-wrap gap-2";
  const choiceSize = large ? "justify-center rounded-lg px-3 py-3 text-base font-bold" : "rounded-lg px-3 py-1.5 text-sm font-semibold";

  switch (f.type) {
    case "status": {
      const a = (value || {}) as StatusAnswer;
      const chosen = options.find((o) => o.value === a.value);
      const best = maxScoreOf(options);
      const main = (
        <div className={choiceWrap} role="group" aria-label={am ? "መልስ" : "Answer"}>
          {options.map((o) => {
            const tone = choiceTone(o, best);
            const on = a.value === o.value;
            return (
              <button
                key={o.value}
                type="button"
                aria-pressed={on}
                onClick={() => onChange({ ...a, value: on ? undefined : o.value })}
                className={`flex items-center gap-2 border-[1.5px] transition-colors ${choiceSize} ${tone.text} ${on ? `border-current ${tone.soft}` : "border-slate-200 bg-white hover:border-current"}`}
              >
                <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full bg-current" />
                <span lang={am ? "am" : "en"}>{optLabel(o)}</span>
              </button>
            );
          })}
        </div>
      );
      const extra = a.value ? (
        <div className="space-y-3">
          <div className="space-y-1">
            <FieldLabel required am={am} htmlFor={`note-${f.key}`}>
              {am ? "ማስረጃ / ምልከታ" : "Evidence / observation"}
            </FieldLabel>
            <textarea
              id={`note-${f.key}`}
              className={`${textareaClass} rounded-lg bg-white`}
              value={a.note ?? ""}
              onChange={(e) => onChange({ ...a, note: e.target.value })}
              rows={large ? 3 : 2}
              placeholder={am ? "የተገኘውን ሁኔታ ይግለጹ" : "Describe what you found"}
            />
          </div>
          {chosen?.action === "required" && (
            <div className="space-y-1">
              <FieldLabel required am={am} htmlFor={`action-${f.key}`}>
                {am ? "የሚያስፈልግ እርምጃ" : "Action needed"}
              </FieldLabel>
              <textarea
                id={`action-${f.key}`}
                rows={2}
                className={`${textareaClass} rounded-lg bg-white`}
                value={a.action ?? ""}
                onChange={(e) => onChange({ ...a, action: e.target.value })}
                placeholder={am ? "ኩባንያው መውሰድ ያለበት እርምጃ" : "What the company must do"}
              />
            </div>
          )}
          {f.evidence !== "none" && (
            <div className="space-y-1">
              <FieldLabel required={f.evidence === "required"} am={am}>
                <Camera className="mr-1 inline h-3.5 w-3.5" />
                {am ? "ፎቶ / ፋይል" : "Photos / files"}
              </FieldLabel>
              <FileAnswer field={f} value={a.files} onChange={(files) => onChange({ ...a, files })} language={language} />
            </div>
          )}
        </div>
      ) : null;
      if (part === "main") return main;
      if (part === "extra") return extra;
      return (
        <div className={`space-y-3 ${pad}`}>
          {main}
          {extra}
        </div>
      );
    }
    case "text":
      return (
        <div className={pad}>
          <Input value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={f.prefill ? (am ? "ከፈቃዱ የተሞላ፤ ማስተካከል ይቻላል" : "Filled in from the license; can be corrected") : undefined} />
        </div>
      );
    case "long_text":
      return (
        <div className={pad}>
          <textarea rows={4} className={textareaClass} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
        </div>
      );
    case "number":
      return (
        <div className={`flex items-center gap-2 ${pad}`}>
          <Input type="number" className="max-w-48" value={value ?? ""} min={f.min} max={f.max} onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)} />
          {f.unit && <span className="text-sm text-slate-500">{f.unit}</span>}
        </div>
      );
    case "date":
      return (
        <div className={pad}>
          <Input type="date" className="max-w-56" value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
        </div>
      );
    case "select":
      return (
        <div className={`${choiceWrap} ${pad}`}>
          {(f.options || []).map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(value === o.value ? null : o.value)}
              aria-pressed={value === o.value}
              className={`flex items-center gap-2 border-[1.5px] ${choiceSize} ${value === o.value ? "border-primary bg-primary/10 text-primary" : "border-slate-200 bg-white text-slate-700 hover:border-primary"}`}
            >
              <span lang={am ? "am" : "en"}>{optLabel(o)}</span>
            </button>
          ))}
        </div>
      );
    case "checkboxes": {
      const list: string[] = Array.isArray(value) ? value : [];
      return (
        <div className={`${large ? "space-y-2" : "flex flex-wrap gap-x-5 gap-y-2"} ${pad}`}>
          {(f.options || []).map((o) => (
            <label key={o.value} className={`flex items-center gap-2 ${large ? "w-full rounded-lg border border-slate-200 px-4 py-3 text-base" : "text-sm"}`}>
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={list.includes(o.value)}
                onChange={(e) => onChange(e.target.checked ? [...list, o.value] : list.filter((v) => v !== o.value))}
              />
              <span lang={am ? "am" : "en"}>{optLabel(o)}</span>
            </label>
          ))}
        </div>
      );
    }
    case "table":
      return (
        <div className={pad}>
          <TableInput field={f} value={value} onChange={onChange} language={language} />
        </div>
      );
    case "photo":
      return (
        <div className={pad}>
          <FileAnswer field={f} value={Array.isArray(value) ? value : []} onChange={onChange} language={language} />
        </div>
      );
    case "signature":
      return (
        <div className={pad}>
          <SignatureAnswerInput field={f} value={value} onChange={onChange} />
        </div>
      );
    default:
      return null;
  }
}

function TableInput({ field: f, value, onChange, language }: { field: FormField; value: any; onChange: (v: any) => void; language: FormLanguage }) {
  const columns = f.columns || [];
  const fixed = f.rows || [];
  const current = ((value || {}) as TableAnswer).rows;
  const rows: TableAnswer["rows"] =
    current && current.length ? current : fixed.map((r) => ({ label: language === "en" ? r.label : r.label_am || r.label, cells: {} as Record<string, string> }));
  const set = (next: TableAnswer["rows"]) => onChange({ rows: next });
  const setCell = (i: number, key: string, v: string) => set(rows.map((r, j) => (j === i ? { ...r, cells: { ...r.cells, [key]: v } } : r)));

  return (
    <div className="space-y-2 overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="bg-slate-50 text-left text-xs text-slate-600">
            {fixed.length > 0 && <th className="w-24 border px-2 py-1.5 font-medium" />}
            {columns.map((c) => (
              <th key={c.key} className="border px-2 py-1.5 font-medium">
                <span lang="am">{language === "en" ? c.label : c.label_am || c.label}</span>
              </th>
            ))}
            {f.allow_add_rows && <th className="w-8 border" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {fixed.length > 0 && (
                <td className="border px-2 py-1 text-xs text-slate-600">
                  <Input className="h-8 border-0 px-1 shadow-none" value={r.label ?? ""} onChange={(e) => set(rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                </td>
              )}
              {columns.map((c) => (
                <td key={c.key} className="border p-1">
                  {c.type === "select" ? (
                    <select className="h-8 w-full rounded border-0 bg-transparent text-sm" value={r.cells[c.key] ?? ""} onChange={(e) => setCell(i, c.key, e.target.value)}>
                      <option value="" />
                      {(c.options || []).map((o) => (
                        <option key={o.value} value={o.value}>
                          {language === "en" ? o.label : o.label_am || o.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      className="h-8 border-0 px-1 shadow-none"
                      type={c.type === "number" ? "number" : c.type === "date" ? "date" : "text"}
                      value={r.cells[c.key] ?? ""}
                      onChange={(e) => setCell(i, c.key, e.target.value)}
                    />
                  )}
                </td>
              ))}
              {f.allow_add_rows && (
                <td className="border text-center">
                  <button type="button" aria-label="Remove row" className="p-1 text-slate-400 hover:text-red-600" onClick={() => set(rows.filter((_, j) => j !== i))}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {f.allow_add_rows && (
        <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => set([...rows, { label: "", cells: {} }])}>
          <Plus className="h-3.5 w-3.5" /> Add row
        </Button>
      )}
    </div>
  );
}
