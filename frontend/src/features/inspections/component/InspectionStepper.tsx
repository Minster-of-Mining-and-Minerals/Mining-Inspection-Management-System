"use client";

/**
 * The inspection form, step by step (field-app style): a top bar with the section and a
 * segmented progress bar, one question card (or one section) at a time, and big
 * Previous / Next buttons. The answers live in the parent (saved as they change).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, ListChecks, Menu, Send, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { QuestionBlock, SectionHeader, FormLanguage, pickText } from "@/features/forms/component/FormRenderer";
import { Answers, unfilledAnswers, validateAnswers, visibleStructure } from "@/features/forms/component/formLogic";
import type { FormDefinition, FormField, LicenseTypeKey } from "@/redux/types/form";

export type StepMode = "question" | "section";
// Renamed so everyone starts on the section view once; their own choice is remembered from then on
const MODE_KEY = "mims.inspection.layout";

const filled = (_f: FormField, v: any) => {
  if (v == null || v === "") return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") {
    if ("value" in v) return !!v.value;
    if ("rows" in v) return (v.rows || []).some((r: any) => Object.values(r.cells || {}).some((x) => x !== "" && x != null));
    if ("file_id" in v) return !!v.file_id;
  }
  return true;
};

interface Props {
  definition: FormDefinition;
  licenseType: LicenseTypeKey | null;
  answers: Answers;
  onChange: (key: string, value: any) => void;
  problems: Record<string, string>;
  language: FormLanguage;
  readOnly: boolean;
  /** Shown above the section title (company name) */
  title: string;
  /** Save state / Save button, in the top bar */
  status?: React.ReactNode;
  /** Under the question: e.g. the GPS chip */
  footnote?: React.ReactNode;
  /** Go to this question (e.g. the first problem after pressing Submit) */
  jumpKey: string | null;
  onJumped: () => void;
  /** Submit — after the check of what isn't filled in (the last step's button, and in the sections menu) */
  onFinish?: () => void;
  finishing?: boolean;
  /** Moved to another question / section (the parent saves then) */
  onStepChange?: () => void;
  /** Remember where the user was (per inspection), to continue there next time */
  resumeKey?: string;
}

export function InspectionStepper({
  definition,
  licenseType,
  answers,
  onChange,
  problems,
  language,
  readOnly,
  title,
  status,
  footnote,
  jumpKey,
  onJumped,
  onFinish,
  finishing,
  onStepChange,
  resumeKey,
}: Props) {
  // Navigation and menus in English; the questions, answers and section titles use `language` (Amharic)
  const am = false;
  const [mode, setMode] = useState<StepMode>("section");
  const [cursor, setCursor] = useState<{ section?: string; field?: string }>({});
  const [menuOpen, setMenuOpen] = useState(false);
  // The check before submitting: what isn't filled in (not mandatory, but the inspector is told)
  const [checking, setChecking] = useState(false);
  const top = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const m = window.localStorage.getItem(MODE_KEY);
      if (m === "question" || m === "section") setMode(m);
      const saved = resumeKey && window.localStorage.getItem("mims.inspection.at." + resumeKey);
      if (saved) setCursor(JSON.parse(saved));
    } catch {
      /* preference only */
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!resumeKey || !cursor.field) return;
    try {
      window.localStorage.setItem("mims.inspection.at." + resumeKey, JSON.stringify(cursor));
    } catch {
      /* preference only */
    }
  }, [cursor, resumeKey]);

  const changeMode = (m: StepMode) => {
    setMode(m);
    try {
      window.localStorage.setItem(MODE_KEY, m);
    } catch {
      /* preference only */
    }
  };

  // What applies now (conditions can show / hide questions as answers change)
  const sections = useMemo(() => visibleStructure(definition, licenseType, answers).filter((s) => s.fields.length), [definition, licenseType, answers]);
  const flat = useMemo(() => sections.flatMap(({ section, fields }) => fields.map((field, i) => ({ section, field, n: i + 1 }))), [sections]);
  const open = useMemo(() => validateAnswers(definition, licenseType, answers), [definition, licenseType, answers]);
  const unfilled = useMemo(() => unfilledAnswers(definition, licenseType, answers), [definition, licenseType, answers]);

  // Where we are, kept by key so it survives questions appearing / disappearing
  let qIndex = flat.findIndex((x) => x.field.key === cursor.field);
  if (qIndex < 0) qIndex = Math.max(0, flat.findIndex((x) => x.section.key === cursor.section));
  let sIndex = sections.findIndex((s) => s.section.key === (mode === "question" ? flat[qIndex]?.section.key : cursor.section));
  if (sIndex < 0) sIndex = Math.max(0, sections.findIndex((s) => s.section.key === flat[qIndex]?.section.key));

  const goQuestion = (i: number) => {
    const x = flat[Math.min(Math.max(i, 0), flat.length - 1)];
    if (x) setCursor({ section: x.section.key, field: x.field.key });
  };
  const goSection = (i: number) => {
    const s = sections[Math.min(Math.max(i, 0), sections.length - 1)];
    if (s) setCursor({ section: s.section.key, field: s.fields[0]?.key });
  };

  // Jump to a question (first problem after Submit)
  useEffect(() => {
    if (!jumpKey) return;
    const x = flat.find((y) => y.field.key === jumpKey);
    if (x) setCursor({ section: x.section.key, field: x.field.key });
    onJumped();
    setTimeout(() => document.getElementById(`answer-${jumpKey}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
  }, [jumpKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // New step: save, and bring its top into view
  const stepKey = mode === "question" ? flat[qIndex]?.field.key : sections[sIndex]?.section.key;
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    onStepChange?.();
    const el = top.current;
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [stepKey, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!flat.length) return <p className="rounded-xl border border-dashed border-slate-300 py-10 text-center text-sm text-slate-500">{am ? "ምንም ጥያቄ የለም።" : "No questions apply."}</p>;

  const current = sections[sIndex];
  const here = flat[qIndex];
  const sectionStats = sections.map(({ fields }) => ({
    answered: fields.filter((f) => filled(f, answers[f.key])).length,
    total: fields.length,
    // Not filled in (or a problem): the "left" count of the sections menu
    missing: fields.filter((f) => open[f.key] || unfilled.some((u) => u.key === f.key)).length,
    flagged: fields.some((f) => problems[f.key]),
  }));
  const answeredAll = sectionStats.reduce((n, s) => n + s.answered, 0);
  const isLast = mode === "question" ? qIndex >= flat.length - 1 : sIndex >= sections.length - 1;
  const isFirst = mode === "question" ? qIndex <= 0 : sIndex <= 0;
  const next = () => (isLast ? setChecking(true) : mode === "question" ? goQuestion(qIndex + 1) : goSection(sIndex + 1));
  const goTo = (key: string) => {
    const x = flat.find((y) => y.field.key === key);
    if (x) setCursor({ section: x.section.key, field: x.field.key });
    setChecking(false);
    setTimeout(() => document.getElementById(`answer-${key}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
  };
  const prev = () => (mode === "question" ? goQuestion(qIndex - 1) : goSection(sIndex - 1));

  // Segments: questions of this section (one-question view) or all sections (section view)
  const segments =
    mode === "question"
      ? current.fields.map((f) => ({ key: f.key, done: filled(f, answers[f.key]), here: f.key === here.field.key, bad: !!problems[f.key] }))
      : sections.map((s, i) => ({ key: s.section.key, done: sectionStats[i].missing === 0, here: i === sIndex, bad: sectionStats[i].flagged }));
  const segLabel =
    mode === "question"
      ? am
        ? `ጥያቄ ${here.n} ከ ${current.fields.length}`
        : `Question ${here.n} of ${current.fields.length}`
      : am
        ? `ክፍል ${sIndex + 1} ከ ${sections.length}`
        : `Section ${sIndex + 1} of ${sections.length}`;

  return (
    <div ref={top} className="scroll-mt-32 space-y-3">
      {/* Top bar: company · section · progress */}
      <div className="sticky top-14 z-20 -mx-3 border-b border-slate-200 bg-white/95 px-3 py-2.5 backdrop-blur sm:top-16 sm:-mx-6 sm:px-6">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-slate-500">{title}</p>
            <p className="truncate font-bold text-slate-900">
              {current.section.number ? `${current.section.number}. ` : ""}
              {pickText(current.section.title, current.section.title_am, language)}
            </p>
          </div>
          {status}
          <Button variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={() => setMenuOpen(true)} aria-haspopup="dialog">
            <Menu className="h-4 w-4" /> <span className="hidden sm:inline">{am ? "ክፍሎች" : "Sections"}</span>
          </Button>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <div className="flex flex-1 gap-[3px]" role="img" aria-label={segLabel}>
            {segments.map((g) => (
              <span key={g.key} className={`h-[5px] flex-1 rounded-full ${g.here ? "bg-golden-bright" : g.bad ? "bg-red-400" : g.done ? "bg-primary" : "bg-slate-200"}`} />
            ))}
          </div>
          <span className="shrink-0 text-[11px] text-slate-500">{segLabel}</span>
        </div>
      </div>

      {/* The step */}
      <fieldset disabled={readOnly} className="m-0 min-w-0 border-0 p-0">
        {mode === "question" ? (
          <QuestionBlock
            definition={definition}
            field={here.field}
            index={here.n}
            value={answers[here.field.key]}
            onChange={(v) => onChange(here.field.key, v)}
            problem={problems[here.field.key]}
            language={language}
            large
          />
        ) : (
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <SectionHeader section={current.section} language={language} />
            <ol className="divide-y">
              {current.fields.map((f, i) => (
                <li key={f.key} className={problems[f.key] ? "bg-red-50/60" : ""}>
                  <QuestionBlock definition={definition} field={f} index={i + 1} value={answers[f.key]} onChange={(v) => onChange(f.key, v)} problem={problems[f.key]} language={language} />
                </li>
              ))}
            </ol>
          </section>
        )}
      </fieldset>
      {footnote}

      {/* Bottom bar: ‹ Previous  ·  Next › (Submit on the last step) */}
      <div className="sticky bottom-0 z-20 -mx-3 -mb-3 grid grid-cols-[1fr_1.4fr] gap-2 border-t border-slate-200 bg-white/95 px-3 py-2.5 backdrop-blur sm:-mx-6 sm:-mb-6 sm:px-6">
        <Button variant="outline" size="lg" className="gap-1 text-primary" onClick={prev} disabled={isFirst}>
          <ChevronLeft className="h-4 w-4" /> {am ? "ቀዳሚ" : "Previous"}
        </Button>
        {isLast ? (
          <Button size="lg" className="gap-1.5" onClick={next} disabled={!onFinish || readOnly || finishing}>
            <ClipboardCheck className="h-4 w-4" /> {am ? "አረጋግጥና ላክ" : "Check and submit"}
          </Button>
        ) : (
          <Button size="lg" className="gap-1" onClick={next}>
            {am ? "ቀጣይ" : "Next"} <ChevronRight className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Sections menu: layout, where things stand, jump anywhere, submit */}
      <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{am ? "ክፍሎች" : "Sections"}</DialogTitle>
            <DialogDescription>
              {answeredAll} / {flat.length} {am ? "ጥያቄዎች ተመልሰዋል" : "questions answered"}
            </DialogDescription>
          </DialogHeader>
          <div className="flex rounded-lg bg-slate-100 p-1 text-sm" role="group" aria-label={am ? "አቀማመጥ" : "Layout"}>
            {(
              [
                ["question", am ? "አንድ ጥያቄ በአንድ ጊዜ" : "One question at a time", Square],
                ["section", am ? "በክፍል" : "By section", ListChecks],
              ] as const
            ).map(([m, label, Icon]) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => {
                  if (m === "section") setCursor({ section: here.section.key, field: here.field.key });
                  changeMode(m);
                }}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 font-medium ${mode === m ? "bg-white text-primary shadow-sm" : "text-slate-600"}`}
              >
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>
          <ul className="space-y-1">
            {sections.map(({ section }, i) => {
              const st = sectionStats[i];
              return (
                <li key={section.key}>
                  <button
                    type="button"
                    onClick={() => {
                      goSection(i);
                      setMenuOpen(false);
                    }}
                    className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm ${i === sIndex ? "border-primary bg-primary/5" : "border-slate-200 hover:border-primary"}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-slate-900">
                        {section.number ? `${section.number}. ` : `${i + 1}. `}
                        {pickText(section.title, section.title_am, language)}
                      </span>
                      <span className="text-xs text-slate-500">
                        {st.answered} / {st.total} {am ? "ተመልሷል" : "answered"}
                      </span>
                    </span>
                    {st.missing ? (
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${st.flagged ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}`}>
                        {st.missing} {am ? "ይቀራል" : "left"}
                      </span>
                    ) : (
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" aria-label={am ? "ተጠናቋል" : "Complete"} />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          {onFinish && !readOnly && (
            <Button
              className="w-full gap-1.5"
              onClick={() => {
                setMenuOpen(false);
                setChecking(true);
              }}
              disabled={finishing}
            >
              <ClipboardCheck className="h-4 w-4" /> {am ? "አረጋግጥና ላክ" : "Check and submit"}
            </Button>
          )}
        </DialogContent>
      </Dialog>

      {/* The check before submitting */}
      <Dialog open={checking} onOpenChange={setChecking}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Check before submitting</DialogTitle>
            <DialogDescription>
              {flat.length - new Set(unfilled.map((u) => u.key)).size} of {flat.length} questions filled in.
            </DialogDescription>
          </DialogHeader>
          {unfilled.length ? (
            <>
              <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900" role="status">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <strong>
                    {unfilled.length} {unfilled.length === 1 ? "question is" : "questions are"} not filled in.
                  </strong>{" "}
                  They are not mandatory: you can submit now, or go back and fill them.
                </span>
              </p>
              <div className="space-y-3">
                {sections
                  .map(({ section, fields }) => ({ section, items: unfilled.filter((u) => u.sectionKey === section.key).map((u) => ({ u, f: fields.find((f) => f.key === u.key)!, n: fields.findIndex((f) => f.key === u.key) + 1 })) }))
                  .filter((g) => g.items.length)
                  .map(({ section, items }) => (
                    <div key={section.key}>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {section.number ? `${section.number}. ` : ""}
                        {pickText(section.title, section.title_am, language)} · {items.length}
                      </p>
                      <ul className="space-y-1">
                        {items.map(({ u, f, n }) => (
                          <li key={u.key}>
                            <button type="button" onClick={() => goTo(u.key)} className="flex w-full items-start gap-2 rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:border-primary">
                              <span className="w-6 shrink-0 text-right text-slate-400">{n}.</span>
                              <span className="min-w-0 flex-1">
                                <span className="line-clamp-2 text-slate-900" lang={language}>
                                  {pickText(f.label, f.label_am, language)}
                                </span>
                                <span className="text-xs text-amber-700">{u.what}</span>
                              </span>
                              <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
              </div>
            </>
          ) : (
            <p className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 text-sm font-medium text-green-800" role="status">
              <CheckCircle2 className="h-4 w-4" /> Every question is filled in.
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {unfilled.length > 0 && (
              <Button variant="outline" onClick={() => goTo(unfilled[0].key)}>
                Fill them in
              </Button>
            )}
            <Button
              className="gap-1.5"
              disabled={!onFinish || readOnly || finishing}
              onClick={() => {
                setChecking(false);
                onFinish?.();
              }}
            >
              <Send className="h-4 w-4" /> {unfilled.length ? "Submit anyway" : "Submit inspection"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
