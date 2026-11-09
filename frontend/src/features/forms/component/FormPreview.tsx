"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FormDefinition, LicenseTypeKey } from "@/redux/types/form";
import { FormRenderer } from "./FormRenderer";
import { Answers, scoreOf, validateAnswers, visibleStructure } from "./formLogic";

/** Try a form as an inspector would: pick a license type, answer, see conditions and the score. */
export function FormPreview({ definition }: { definition: FormDefinition }) {
  const [licenseType, setLicenseType] = useState<LicenseTypeKey>("exploration");
  const language = "am" as const; // inspectors see Amharic for now
  const [answers, setAnswers] = useState<Answers>({});
  const [checked, setChecked] = useState(false);

  const visible = useMemo(() => visibleStructure(definition, licenseType, answers), [definition, licenseType, answers]);
  const score = useMemo(() => scoreOf(definition, licenseType, answers), [definition, licenseType, answers]);
  const problems = useMemo(() => (checked ? validateAnswers(definition, licenseType, answers) : {}), [checked, definition, licenseType, answers]);
  const questionCount = visible.reduce((n, s) => n + s.fields.length, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
        <span className="font-medium text-slate-700">Preview for a</span>
        <div className="inline-flex rounded-lg bg-slate-100 p-1">
          {(["exploration", "mining"] as LicenseTypeKey[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setLicenseType(t)}
              className={`rounded-md px-3 py-1 font-medium capitalize ${licenseType === t ? "bg-white text-primary shadow-sm" : "text-slate-500"}`}
            >
              {t}
            </button>
          ))}
        </div>
        <span className="text-slate-500">license</span>
        <span className="ml-auto text-slate-500">
          {visible.length} sections · {questionCount} questions shown
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1"
          onClick={() => {
            setAnswers({});
            setChecked(false);
          }}
        >
          <RotateCcw className="h-4 w-4" /> Clear answers
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_16rem]">
        <FormRenderer
          definition={definition}
          licenseType={licenseType}
          answers={answers}
          onChange={(key, value) => setAnswers((a) => ({ ...a, [key]: value }))}
          problems={problems}
          language={language}
          previewMode
        />

        {/* Score so far */}
        <aside className="h-fit space-y-3 rounded-xl border border-slate-200 bg-white p-4 text-sm lg:sticky lg:top-4">
          <div>
            <p className="text-xs font-medium text-slate-500">Compliance so far</p>
            <p className="text-3xl font-bold tabular-nums text-primary">{score.overall == null ? "—" : `${Math.round(score.overall * 100)}%`}</p>
            <p className="text-xs text-slate-500">from {score.counted} scored answer{score.counted === 1 ? "" : "s"}</p>
          </div>
          <ul className="space-y-1">
            {score.bySection.map((s) => (
              <li key={s.key} className="flex justify-between gap-2">
                <span className="truncate text-slate-600">{s.title}</span>
                <span className="shrink-0 tabular-nums font-medium">{s.score == null ? "—" : `${Math.round(s.score * 100)}%`}</span>
              </li>
            ))}
          </ul>
          <Button variant="outline" size="sm" className="w-full gap-1" onClick={() => setChecked(true)}>
            <CheckCircle2 className="h-4 w-4" /> Check as if submitting
          </Button>
          {checked && (
            <p className={`text-xs font-medium ${Object.keys(problems).length ? "text-red-600" : "text-green-700"}`}>
              {Object.keys(problems).length ? `${Object.keys(problems).length} question(s) still need an answer.` : "Everything required is answered."}
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
