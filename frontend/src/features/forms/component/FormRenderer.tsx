"use client";

import { Camera, PenLine, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { FormDefinition, FormField, LicenseTypeKey, StatusOption } from "@/redux/types/form";
import { Answers, StatusAnswer, TableAnswer, maxScoreOf, statusOptionsFor, visibleStructure } from "./formLogic";

interface Props {
  definition: FormDefinition;
  licenseType: LicenseTypeKey | null;
  answers: Answers;
  onChange: (key: string, value: any) => void;
  /** Problems to show under questions (key -> message) */
  problems?: Record<string, string>;
  /** "both" shows Amharic with English underneath */
  language?: "am" | "en" | "both";
  /** Photos and signatures are captured on the inspector's device (Step 4) */
  previewMode?: boolean;
}

const L = (en: string, am: string | null | undefined, language: Props["language"]) =>
  language === "am" ? am || en : language === "en" ? en : am ? (
    <>
      <span lang="am">{am}</span>
      <span className="block text-[0.8em] font-normal text-slate-500">{en}</span>
    </>
  ) : (
    en
  );

const textareaClass =
  "w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50";

/** Shows a form's sections and questions for answering (preview now; the inspector's form in Step 4). */
export function FormRenderer({ definition, licenseType, answers, onChange, problems = {}, language = "both", previewMode }: Props) {
  const structure = visibleStructure(definition, licenseType, answers);

  return (
    <div className="space-y-6">
      {structure.map(({ section, fields }) => (
        <section key={section.key} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <header className="border-b bg-slate-50 px-4 py-3">
            <h3 className="font-semibold text-primary">
              {section.number && <span className="mr-2 text-golden-deep">{section.number}.</span>}
              {L(section.title, section.title_am, language)}
            </h3>
            {(section.description || section.description_am) && (
              <p className="mt-1 whitespace-pre-line text-xs text-slate-600">
                {language === "en" ? section.description : section.description_am || section.description}
              </p>
            )}
          </header>
          <ol className="divide-y">
            {fields.map((f, i) => (
              <li key={f.key} className="px-4 py-3">
                <QuestionLabel field={f} index={i + 1} language={language} />
                <div className="mt-2">
                  <FieldInput field={f} options={f.type === "status" ? statusOptionsFor(definition, f) : []} value={answers[f.key]} onChange={(v) => onChange(f.key, v)} language={language} previewMode={previewMode} />
                </div>
                {problems[f.key] && <p className="mt-1 text-xs font-medium text-red-600">{problems[f.key]}</p>}
              </li>
            ))}
          </ol>
        </section>
      ))}
      {structure.length === 0 && <p className="py-10 text-center text-sm text-slate-500">No questions apply.</p>}
    </div>
  );
}

function QuestionLabel({ field, index, language }: { field: FormField; index: number; language: Props["language"] }) {
  return (
    <div className="flex gap-2 text-sm font-medium text-slate-900">
      <span className="w-6 shrink-0 text-right text-slate-400">{index}.</span>
      <div className="min-w-0">
        {L(field.label, field.label_am, language)}
        {field.required && <span className="ml-1 text-red-500">*</span>}
        {(field.help || field.help_am) && (
          <p className="mt-0.5 text-xs font-normal text-slate-500">{language === "en" ? field.help : field.help_am || field.help}</p>
        )}
      </div>
    </div>
  );
}

function FieldInput({
  field: f,
  options,
  value,
  onChange,
  language,
  previewMode,
}: {
  field: FormField;
  options: StatusOption[];
  value: any;
  onChange: (v: any) => void;
  language: Props["language"];
  previewMode?: boolean;
}) {
  const optLabel = (o: { label: string; label_am?: string | null }) => (language === "en" ? o.label : o.label_am || o.label);

  switch (f.type) {
    case "status": {
      const a = (value || {}) as StatusAnswer;
      const chosen = options.find((o) => o.value === a.value);
      const best = maxScoreOf(options);
      return (
        <div className="space-y-2 pl-8">
          <div className="flex flex-wrap gap-2">
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => onChange({ ...a, value: a.value === o.value ? undefined : o.value })}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                  a.value === o.value
                    ? o.score == null
                      ? "border-slate-500 bg-slate-500 text-white"
                      : o.score >= best
                        ? "border-green-600 bg-green-600 text-white"
                        : o.score === 0
                        ? "border-red-600 bg-red-600 text-white"
                        : o.score == null
                          ? "border-slate-500 bg-slate-500 text-white"
                          : "border-amber-500 bg-amber-500 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:border-primary"
                }`}
              >
                <span lang="am">{optLabel(o)}</span>
              </button>
            ))}
          </div>
          {a.value && (
            <textarea
              rows={2}
              className={textareaClass}
              value={a.note ?? ""}
              onChange={(e) => onChange({ ...a, note: e.target.value })}
              placeholder="Describe what you found (required) — የተገኘውን ሁኔታ ይግለጹ"
              aria-label="Description (required)"
            />
          )}
          {chosen?.action === "required" && (
            <textarea
              rows={2}
              className={textareaClass}
              value={a.action ?? ""}
              onChange={(e) => onChange({ ...a, action: e.target.value })}
              placeholder="Action needed (required) — የሚያስፈልግ እርምጃ"
            />
          )}
          {a.value && f.evidence !== "none" && (
            <p className="flex items-center gap-1 text-xs text-slate-500">
              <Camera className="h-3.5 w-3.5" /> Photos / files {f.evidence === "required" ? "(required)" : "(optional)"}
              {previewMode && " — added on the inspector's device"}
            </p>
          )}
        </div>
      );
    }
    case "text":
      return (
        <div className="pl-8">
          <Input value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={f.prefill ? "Filled in from the license; can be corrected" : undefined} />
        </div>
      );
    case "long_text":
      return (
        <div className="pl-8">
          <textarea rows={4} className={textareaClass} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
        </div>
      );
    case "number":
      return (
        <div className="flex items-center gap-2 pl-8">
          <Input type="number" className="max-w-48" value={value ?? ""} min={f.min} max={f.max} onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)} />
          {f.unit && <span className="text-sm text-slate-500">{f.unit}</span>}
        </div>
      );
    case "date":
      return (
        <div className="pl-8">
          <Input type="date" className="max-w-56" value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
        </div>
      );
    case "select":
      return (
        <div className="flex flex-wrap gap-2 pl-8">
          {(f.options || []).map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(value === o.value ? null : o.value)}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium ${value === o.value ? "border-primary bg-primary text-white" : "border-slate-300 bg-white text-slate-700 hover:border-primary"}`}
            >
              <span lang="am">{optLabel(o)}</span>
            </button>
          ))}
        </div>
      );
    case "checkboxes": {
      const list: string[] = Array.isArray(value) ? value : [];
      return (
        <div className="flex flex-wrap gap-x-5 gap-y-2 pl-8">
          {(f.options || []).map((o) => (
            <label key={o.value} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={list.includes(o.value)}
                onChange={(e) => onChange(e.target.checked ? [...list, o.value] : list.filter((v) => v !== o.value))}
              />
              <span lang="am">{optLabel(o)}</span>
            </label>
          ))}
        </div>
      );
    }
    case "table":
      return <TableInput field={f} value={value} onChange={onChange} language={language} />;
    case "photo":
      return (
        <div className="pl-8">
          <div className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-500">
            <Camera className="h-4 w-4" /> Up to {f.max_files ?? 10} photos or files{previewMode && " — taken on the inspector's device"}
          </div>
        </div>
      );
    case "signature":
      return (
        <div className="pl-8">
          <div className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-500">
            <PenLine className="h-4 w-4" /> {f.multiple ? "Signatures (one per person)" : "Signature"}
            {f.with_name && ", with name"}
            {previewMode && " — signed on the inspector's device"}
          </div>
        </div>
      );
    default:
      return null;
  }
}

function TableInput({ field: f, value, onChange, language }: { field: FormField; value: any; onChange: (v: any) => void; language: Props["language"] }) {
  const columns = f.columns || [];
  const fixed = f.rows || [];
  const current = ((value || {}) as TableAnswer).rows;
  const rows: TableAnswer["rows"] =
    current && current.length ? current : fixed.map((r) => ({ label: language === "en" ? r.label : r.label_am || r.label, cells: {} as Record<string, string> }));
  const set = (next: TableAnswer["rows"]) => onChange({ rows: next });
  const setCell = (i: number, key: string, v: string) => set(rows.map((r, j) => (j === i ? { ...r, cells: { ...r.cells, [key]: v } } : r)));

  return (
    <div className="space-y-2 overflow-x-auto pl-8">
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
