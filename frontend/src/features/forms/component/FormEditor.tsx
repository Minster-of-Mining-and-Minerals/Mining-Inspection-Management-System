"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  ClipboardPaste,
  Copy,
  Edit,
  GitBranch,
  Plus,
  Search,
  Settings2,
  Smartphone,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useCompareWithCurrentMutation,
  useCreateDraftMutation,
  useEditLiveMutation,
  usePublishDraftMutation,
  useSaveDraftMutation,
} from "@/redux/api/formApi";
import {
  FIELD_TYPE_LABEL,
  FieldType,
  FormCompareResult,
  FormDefinition,
  FormDetail,
  FormField,
  FormSection,
  LicenseTypeKey,
  PREFILL_LABEL,
  StatusOption,
} from "@/redux/types/form";
import { FieldEditorDialog } from "./FieldEditorDialog";
import { FormRenderer } from "./FormRenderer";
import { SectionDialog, StatusOptionsEditor, textareaClass } from "./FormEditorParts";
import { Answers, allFieldKeys, keyFromLabel } from "./formLogic";

export type EditMode = "draft" | "live";

interface Props {
  form: FormDetail;
  mode: EditMode;
  canPublish: boolean;
  /** Leave the editor (after publishing / saving, or on Back) */
  onExit: () => void;
  /** Live edits refused: continue the same changes in a new draft */
  onSwitchToDraft: () => void;
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const ETHIOPIC = /[ሀ-᎟ⶀ-⷟]/;
const PREVIEW_KEY = "mims.formEditor.showPreview";
const AUTOSAVE_MS = 2500;
const HISTORY_LIMIT = 50;

/** Missing translations and other things to fix, per question. */
const fieldIssues = (f: FormField): string[] => {
  const issues: string[] = [];
  // Amharic is the question's main text; English is optional for now
  if (!f.label_am?.trim()) issues.push(f.label?.trim() ? "Amharic missing" : "Question text missing");
  if ((f.type === "select" || f.type === "checkboxes") && !f.options?.length) issues.push("No choices");
  if (f.type === "table" && !f.columns?.length) issues.push("No columns");
  if (f.status_options && (f.status_options.length < 2 || f.status_options.some((o) => !o.label?.trim()))) issues.push("Choice text missing");
  if (f.status_options?.length && f.status_options.every((o) => o.score == null)) issues.push("No choice has a score");
  return issues;
};

const readPreviewPref = () => {
  try {
    return window.localStorage.getItem(PREVIEW_KEY) !== "0";
  } catch {
    return true;
  }
};

/** Layout A: section outline · questions edited in place · live phone preview (can be hidden). */
export function FormEditor({ form, mode, canPublish, onExit, onSwitchToDraft }: Props) {
  const source = mode === "draft" ? form.draft : form.published;
  const [def, setDef] = useState<FormDefinition>(() => clone(source!.definition));
  const [changeNote, setChangeNote] = useState(mode === "draft" ? form.draft?.change_note ?? "" : "");
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "unsaved" | "error">("saved");
  const [serverErrors, setServerErrors] = useState<string[]>([]);
  const history = useRef<FormDefinition[]>([]);
  const [historySize, setHistorySize] = useState(0);

  const [selected, setSelected] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [showPreview, setShowPreview] = useState(true);
  const [showStatusOptions, setShowStatusOptions] = useState(false);
  const [search, setSearch] = useState("");
  const [advanced, setAdvanced] = useState<{ sectionIndex: number; fieldIndex: number | null; field: FormField } | null>(null);
  const [sectionEdit, setSectionEdit] = useState<{ index: number | null; section: FormSection } | null>(null);
  const [pasteInto, setPasteInto] = useState<number | null>(null);
  const [reviewing, setReviewing] = useState(false);

  const [saveDraft] = useSaveDraftMutation();

  useEffect(() => setShowPreview(readPreviewPref()), []);
  const togglePreview = () =>
    setShowPreview((v) => {
      try {
        window.localStorage.setItem(PREVIEW_KEY, v ? "0" : "1");
      } catch {
        /* preference only */
      }
      return !v;
    });

  /** Every change goes through here: remembered for Undo, marks the form unsaved. */
  const update = useCallback((fn: (d: FormDefinition) => void) => {
    setDef((cur) => {
      history.current = [...history.current.slice(-(HISTORY_LIMIT - 1)), clone(cur)];
      setHistorySize(history.current.length);
      const next = clone(cur);
      fn(next);
      return next;
    });
    setDirty(true);
    setSaveState("unsaved");
  }, []);

  const undo = () => {
    const prev = history.current.pop();
    setHistorySize(history.current.length);
    if (!prev) return;
    setDef(prev);
    setDirty(true);
    setSaveState("unsaved");
  };

  // ---------- autosave (drafts only; live edits are saved on purpose, after review) ----------
  const saveNow = useCallback(async () => {
    if (mode !== "draft") return true;
    setSaveState("saving");
    try {
      await saveDraft({ id: form.form_id, definition: def, change_note: changeNote.trim() || null }).unwrap();
      setDirty(false);
      setSaveState("saved");
      setServerErrors([]);
      return true;
    } catch (e: any) {
      setSaveState("error");
      setServerErrors(e?.data?.errors || [e?.data?.message || "Could not save."]);
      return false;
    }
  }, [mode, saveDraft, form.form_id, def, changeNote]);

  useEffect(() => {
    if (mode !== "draft" || !dirty) return;
    const t = setTimeout(saveNow, AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [mode, dirty, def, changeNote, saveNow]);

  // Warn before closing the tab with unsaved changes
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const exit = async () => {
    if (mode === "draft" && dirty && !(await saveNow())) return;
    if (mode === "live" && dirty && !window.confirm("Leave without saving your changes to the current version?")) return;
    onExit();
  };

  // ---------- derived ----------
  const counts = useMemo(() => {
    const fields = def.sections.flatMap((s) => s.fields);
    return {
      sections: def.sections.length,
      questions: fields.length,
      missingAmharic: fields.filter((f) => !f.label_am?.trim()).length + def.sections.filter((s) => !s.title_am?.trim()).length,
      withIssues: fields.filter((f) => fieldIssues(f).length).length,
    };
  }, [def]);

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    const out: { section: FormSection; field: FormField; si: number }[] = [];
    def.sections.forEach((s, si) =>
      s.fields.forEach((f) => {
        if ((f.label ?? "").toLowerCase().includes(q) || (f.label_am ?? "").includes(search.trim())) out.push({ section: s, field: f, si });
      }),
    );
    return out.slice(0, 8);
  }, [search, def]);

  const jumpTo = (elementId: string, sectionKey?: string) => {
    if (sectionKey) setCollapsed((c) => {
      const n = new Set(c);
      n.delete(sectionKey);
      return n;
    });
    setTimeout(() => document.getElementById(elementId)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  };

  /** Status / choice questions before (si, fi) — what a condition may use. */
  const sourcesBefore = (si: number, fi: number) => {
    const out: FormField[] = [];
    def.sections.forEach((s, i) => {
      if (i > si) return;
      s.fields.forEach((f, j) => {
        if (i === si && j >= fi) return;
        if (f.type === "status" || f.type === "select") out.push(f);
      });
    });
    return out;
  };

  // ---------- question actions ----------
  const addQuestion = (si: number, type: FieldType) => {
    // Choice and table questions need their options: open the full editor
    if (type === "select" || type === "checkboxes" || type === "table") {
      const field: FormField = { key: "", type, label: "", label_am: "", required: false, ...(type === "table" ? { columns: [{ key: "", label: "", label_am: "", type: "text" }], rows: [], allow_add_rows: true } : { options: [{ value: "", label: "", label_am: "" }] }) };
      setAdvanced({ sectionIndex: si, fieldIndex: null, field });
      return;
    }
    const key = keyFromLabel(`new ${type}`, allFieldKeys(def));
    const field: FormField = {
      key,
      type,
      label: "",
      label_am: "",
      required: type === "status",
      ...(type === "status" ? { evidence: "optional" as const, status_options: clone(def.status_options) } : {}),
      ...(type === "photo" ? { max_files: 10 } : {}),
      ...(type === "signature" ? { multiple: false, with_name: true } : {}),
    };
    update((d) => d.sections[si].fields.push(field));
    setSelected(key);
    jumpTo(`q-${key}`, def.sections[si].key);
  };

  const duplicateQuestion = (si: number, fi: number) => {
    const original = def.sections[si].fields[fi];
    const copy = clone(original);
    copy.key = keyFromLabel(original.label || original.key, allFieldKeys(def));
    update((d) => d.sections[si].fields.splice(fi + 1, 0, copy));
    setSelected(copy.key);
  };

  const duplicateSection = (si: number) => {
    const taken = allFieldKeys(def);
    const s = clone(def.sections[si]);
    s.key = keyFromLabel(`${s.title} copy`, new Set(def.sections.map((x) => x.key)), "section");
    s.title = `${s.title} (copy)`;
    s.fields = s.fields.map((f) => {
      const k = keyFromLabel(f.label || "question", taken);
      taken.add(k);
      return { ...f, key: k, show_if: undefined };
    });
    update((d) => d.sections.splice(si + 1, 0, s));
    toast.success("Section duplicated. Conditions inside it were removed; set them again if needed.");
  };

  const moveField = (si: number, fi: number, dir: -1 | 1) =>
    update((d) => {
      const fields = d.sections[si].fields;
      const [f] = fields.splice(fi, 1);
      fields.splice(fi + dir, 0, f);
    });
  const moveSection = (si: number, dir: -1 | 1) =>
    update((d) => {
      const [s] = d.sections.splice(si, 1);
      d.sections.splice(si + dir, 0, s);
    });
  const setField = (si: number, fi: number, patch: Partial<FormField>) =>
    update((d) => {
      d.sections[si].fields[fi] = { ...d.sections[si].fields[fi], ...patch };
    });

  const statusLabel = { saved: "Saved", saving: "Saving…", unsaved: mode === "draft" ? "Unsaved changes" : "Not saved yet", error: "Not saved — see the problem below" }[saveState];

  return (
    <div className="flex flex-col gap-4">
      {/* ---------- top bar ---------- */}
      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <Button variant="outline" size="icon" onClick={exit} aria-label="Back to the form">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1 basis-64">
          <p className="truncate font-bold text-slate-900">{form.name}</p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            {mode === "draft" ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">Draft version {form.draft?.version_number}</span>
            ) : (
              <span className="rounded-full bg-violet-100 px-2 py-0.5 font-semibold text-violet-800">Editing current version {form.published?.version_number} directly</span>
            )}
            <span className={saveState === "error" ? "font-medium text-red-600" : ""}>{statusLabel}</span>
            <span>·</span>
            <span>
              {counts.sections} sections · {counts.questions} questions
            </span>
            {counts.missingAmharic > 0 && <span className="font-medium text-amber-700">· {counts.missingAmharic} without Amharic</span>}
          </div>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <label htmlFor="form-search" className="sr-only">
            Search the form
          </label>
          <Input id="form-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search questions…" className="pl-9" />
          {searchResults.length > 0 && (
            <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-80 overflow-y-auto rounded-lg border bg-white py-1 shadow-lg">
              {searchResults.map(({ section, field }) => (
                <li key={field.key}>
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                    onClick={() => {
                      setSelected(field.key);
                      setSearch("");
                      jumpTo(`q-${field.key}`, section.key);
                    }}
                  >
                    <span lang="am" className="block truncate text-slate-900">{field.label_am || field.label}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {section.number ? `${section.number}. ` : ""}
                      {section.title}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Button variant={showPreview ? "secondary" : "outline"} className="gap-1" onClick={togglePreview} aria-pressed={showPreview}>
          <Smartphone className="h-4 w-4" /> {showPreview ? "Hide preview" : "Live preview"}
        </Button>
        <Button variant="outline" className="gap-1" onClick={undo} disabled={!historySize}>
          <Undo2 className="h-4 w-4" /> Undo
        </Button>
        {(mode === "live" || canPublish) && (
          <Button onClick={() => setReviewing(true)}>{mode === "draft" ? "Review & publish" : "Review & save"}</Button>
        )}
      </header>

      {mode === "live" && (
        <p className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-2 text-sm text-violet-900">
          Changes are saved into version {form.published?.version_number} itself when you press <strong>Review &amp; save</strong>. No new version is made.
          {(form.published?.inspection_count ?? 0) > 0 &&
            ` It has ${form.published?.inspection_count} submitted inspection(s), so only safe changes are allowed: wording, translations, hints, order and new optional questions.`}
        </p>
      )}

      {serverErrors.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4" /> Fix these first:
          </p>
          <ul className="mt-1 list-disc pl-6">
            {serverErrors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-start gap-4">
        {/* ---------- outline ---------- */}
        <nav aria-label="Sections" className="flex w-full flex-col gap-1 rounded-xl border border-slate-200 bg-white p-3 lg:sticky lg:top-24 lg:w-60">
          <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Sections</p>
          {def.sections.map((s) => {
            const issues = s.fields.filter((f) => fieldIssues(f).length).length;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => jumpTo(`s-${s.key}`, s.key)}
                className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                <span className="truncate">
                  {s.number ? `${s.number}. ` : ""}
                  {s.title}
                </span>
                <span className={`shrink-0 text-xs ${issues ? "font-semibold text-amber-700" : "text-slate-400"}`}>{issues ? `${issues}!` : s.fields.length}</span>
              </button>
            );
          })}
          <Button
            variant="outline"
            size="sm"
            className="mt-2 border-dashed"
            onClick={() => setSectionEdit({ index: null, section: { key: "", title: "", title_am: "", number: String(def.sections.length + 1), fields: [] } })}
          >
            <Plus className="h-4 w-4" /> Add section
          </Button>
          <button type="button" onClick={() => setShowStatusOptions((v) => !v)} className="mt-1 rounded-lg px-2 py-1.5 text-left text-sm text-primary hover:bg-slate-50">
            Default status choices (ሁኔታ)…
          </button>
          {counts.withIssues > 0 && (
            <p className="mt-2 rounded-lg bg-amber-50 px-2 py-2 text-xs text-amber-800">
              {counts.withIssues} question{counts.withIssues === 1 ? " needs" : "s need"} attention (marked in yellow)
            </p>
          )}
        </nav>

        {/* ---------- questions ---------- */}
        <main className="min-w-0 flex-[999_1_520px] space-y-4">
          {showStatusOptions && (
            <section className="rounded-xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between px-4 py-3">
                <h2 className="font-semibold text-slate-900">Default status choices (ሁኔታ)</h2>
                <Button variant="ghost" size="icon" aria-label="Close status options" onClick={() => setShowStatusOptions(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="border-t px-4 py-3">
                <StatusOptionsEditor value={def.status_options} onChange={(status_options) => update((d) => (d.status_options = status_options))} />
              </div>
            </section>
          )}

          {def.sections.map((s, si) => {
            const isCollapsed = collapsed.has(s.key);
            return (
              <section key={s.key} id={`s-${s.key}`} className="scroll-mt-28 rounded-xl border border-slate-200 bg-white">
                <div className="flex items-start gap-2 px-4 py-3">
                  <button
                    type="button"
                    aria-label={isCollapsed ? "Expand section" : "Collapse section"}
                    onClick={() =>
                      setCollapsed((c) => {
                        const n = new Set(c);
                        if (n.has(s.key)) n.delete(s.key);
                        else n.add(s.key);
                        return n;
                      })
                    }
                    className="mt-1 text-slate-500"
                  >
                    {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-golden-deep">{s.number ? `Section ${s.number}` : "Section"}</p>
                    <p className="font-bold text-slate-900">{s.title}</p>
                    {s.title_am ? (
                      <p lang="am" className="text-sm text-slate-600">
                        {s.title_am}
                      </p>
                    ) : (
                      <p className="text-xs font-medium text-amber-700">Amharic title missing</p>
                    )}
                    <div className="mt-1 flex flex-wrap gap-1">
                      {s.applies_to && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-800">{s.applies_to.license_types.join(" / ")} licenses only</span>}
                      {s.show_if && (
                        <span className="flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-800">
                          <GitBranch className="h-3 w-3" /> only if {s.show_if.field} = {s.show_if.in.join(" / ")}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" aria-label="Edit section" onClick={() => setSectionEdit({ index: si, section: clone(s) })}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label="Duplicate section" onClick={() => duplicateSection(si)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label="Move section up" disabled={si === 0} onClick={() => moveSection(si, -1)}>
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label="Move section down" disabled={si === def.sections.length - 1} onClick={() => moveSection(si, 1)}>
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete section"
                    onClick={() => {
                      if (window.confirm(`Delete “${s.title}” and its ${s.fields.length} questions?`)) update((d) => d.sections.splice(si, 1));
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>

                {!isCollapsed && (
                  <div className="space-y-2 border-t px-4 py-3">
                    {s.fields.map((f, fi) => (
                      <QuestionItem
                        key={f.key}
                        field={f}
                        index={fi + 1}
                        open={selected === f.key}
                        isFirst={fi === 0}
                        isLast={fi === s.fields.length - 1}
                        onOpen={() => setSelected(selected === f.key ? null : f.key)}
                        onChange={(patch) => setField(si, fi, patch)}
                        defaultChoices={def.status_options}
                        onAdvanced={() => setAdvanced({ sectionIndex: si, fieldIndex: fi, field: clone(f) })}
                        onDuplicate={() => duplicateQuestion(si, fi)}
                        onMove={(dir) => moveField(si, fi, dir)}
                        onDelete={() => {
                          if (window.confirm("Delete this question?")) update((d) => d.sections[si].fields.splice(fi, 1));
                        }}
                      />
                    ))}
                    {s.fields.length === 0 && <p className="py-2 text-sm text-slate-500">No questions yet. Add one below, or paste several from Word.</p>}
                    <QuickAddBar onAdd={(t) => addQuestion(si, t)} onPaste={() => setPasteInto(si)} />
                  </div>
                )}
              </section>
            );
          })}

          {mode === "draft" && (
            <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
              <Label htmlFor="change-note">What changed in this version (shown in the version history)</Label>
              <textarea
                id="change-note"
                rows={2}
                className={textareaClass}
                value={changeNote}
                onChange={(e) => {
                  setChangeNote(e.target.value);
                  setDirty(true);
                  setSaveState("unsaved");
                }}
              />
            </div>
          )}
        </main>

        {/* ---------- live phone preview ---------- */}
        {showPreview && <PhonePreview definition={def} onHide={togglePreview} />}
      </div>

      {/* ---------- dialogs ---------- */}
      {advanced && (
        <FieldEditorDialog
          field={advanced.field}
          isNew={advanced.fieldIndex === null}
          takenKeys={allFieldKeys(def)}
          conditionSources={sourcesBefore(advanced.sectionIndex, advanced.fieldIndex ?? def.sections[advanced.sectionIndex].fields.length)}
          statusOptions={def.status_options}
          onClose={() => setAdvanced(null)}
          onSave={(f) => {
            update((d) => {
              const fields = d.sections[advanced.sectionIndex].fields;
              if (advanced.fieldIndex === null) fields.push(f);
              else fields[advanced.fieldIndex] = f;
            });
            setSelected(f.key);
            setAdvanced(null);
          }}
        />
      )}

      {sectionEdit && (
        <SectionDialog
          section={sectionEdit.section}
          isNew={sectionEdit.index === null}
          conditionSources={sourcesBefore(sectionEdit.index ?? def.sections.length, 0)}
          statusOptions={def.status_options}
          onClose={() => setSectionEdit(null)}
          onSave={(s) => {
            update((d) => {
              if (sectionEdit.index === null) {
                s.key = keyFromLabel(s.title, new Set(d.sections.map((x) => x.key)), "section");
                d.sections.push(s);
              } else d.sections[sectionEdit.index] = s;
            });
            if (sectionEdit.index === null) setTimeout(() => jumpTo(`s-${s.key}`), 50);
            setSectionEdit(null);
          }}
        />
      )}

      {pasteInto !== null && (
        <PasteDialog
          sectionTitle={def.sections[pasteInto]?.title ?? ""}
          takenKeys={allFieldKeys(def)}
          defaultChoices={def.status_options}
          onClose={() => setPasteInto(null)}
          onAdd={(fields) => {
            update((d) => d.sections[pasteInto].fields.push(...fields));
            toast.success(`${fields.length} question${fields.length === 1 ? "" : "s"} added.`);
            setPasteInto(null);
          }}
        />
      )}

      {reviewing && (
        <ReviewDialog
          form={form}
          mode={mode}
          definition={def}
          changeNote={changeNote}
          setChangeNote={setChangeNote}
          saveFirst={saveNow}
          onClose={() => setReviewing(false)}
          onDone={() => {
            setDirty(false);
            setReviewing(false);
            onExit();
          }}
          onSwitchToDraft={() => {
            setReviewing(false);
            setDirty(false);
            onSwitchToDraft();
          }}
        />
      )}
    </div>
  );
}

/* =================== one question: compact row, or edited in place =================== */
function QuestionItem({
  field: f,
  index,
  open,
  isFirst,
  isLast,
  onOpen,
  onChange,
  defaultChoices,
  onAdvanced,
  onDuplicate,
  onMove,
  onDelete,
}: {
  defaultChoices: StatusOption[];
  field: FormField;
  index: number;
  open: boolean;
  isFirst: boolean;
  isLast: boolean;
  onOpen: () => void;
  onChange: (patch: Partial<FormField>) => void;
  onAdvanced: () => void;
  onDuplicate: () => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
}) {
  const issues = fieldIssues(f);
  const choices = f.type === "status" ? (f.status_options?.length ? f.status_options : defaultChoices) : [];
  const badges = (
    <div className="mt-1 flex flex-wrap gap-1">
      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{FIELD_TYPE_LABEL[f.type]}</span>
      {f.type === "status" && (
        <span className="rounded bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-500">
          {choices.map((o) => o.label || "…").join(" / ")}
          {!f.status_options?.length && " (default)"}
        </span>
      )}
      {f.prefill && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-700">from {PREFILL_LABEL[f.prefill] ?? f.prefill}</span>}
      {f.show_if && (
        <span className="flex items-center gap-1 rounded bg-violet-50 px-1.5 py-0.5 text-[11px] text-violet-700">
          <GitBranch className="h-3 w-3" /> only if {f.show_if.field} = {f.show_if.in.join(" / ")}
        </span>
      )}
      {issues.map((i) => (
        <span key={i} className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
          {i}
        </span>
      ))}
    </div>
  );

  if (!open) {
    return (
      <button
        type="button"
        id={`q-${f.key}`}
        onClick={onOpen}
        className={`flex w-full scroll-mt-28 items-start gap-3 rounded-lg border px-3 py-2.5 text-left hover:border-primary/40 ${issues.length ? "border-amber-300 bg-amber-50/40" : "border-slate-200"}`}
      >
        <span className="w-6 shrink-0 pt-0.5 text-right text-xs text-slate-400">{index}.</span>
        <span className="min-w-0 flex-1 text-sm">
          <span lang="am" className="text-slate-900">
            {f.label_am || f.label || <em className="text-slate-400">አዲስ ጥያቄ</em>}
            {f.required && <span className="ml-1 text-red-500">*</span>}
          </span>
          {f.label_am && f.label && <span className="block text-xs text-slate-500">{f.label}</span>}
          {badges}
        </span>
      </button>
    );
  }

  return (
    <div id={`q-${f.key}`} className="scroll-mt-28 space-y-3 rounded-lg border-2 border-primary bg-white p-3">
      <div className="flex flex-wrap items-center gap-1">
        <span className="w-6 text-right text-xs text-slate-400">{index}.</span>
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{FIELD_TYPE_LABEL[f.type]}</span>
        <span className="flex-1" />
        <Button variant="ghost" size="sm" className="gap-1" onClick={onAdvanced}>
          <Settings2 className="h-4 w-4" /> More options
        </Button>
        <Button variant="ghost" size="icon" aria-label="Duplicate question" onClick={onDuplicate}>
          <Copy className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Move up" disabled={isFirst} onClick={() => onMove(-1)}>
          <ArrowUp className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Move down" disabled={isLast} onClick={() => onMove(1)}>
          <ArrowDown className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Delete question" onClick={onDelete}>
          <Trash2 className="h-4 w-4 text-red-500" />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Close" onClick={onOpen}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label lang="am" className="space-y-1 text-xs font-medium text-slate-600">
          ጥያቄ (አማርኛ) *
          <textarea autoFocus rows={2} className={textareaClass} value={f.label_am ?? ""} onChange={(e) => onChange({ label_am: e.target.value })} />
        </label>
        <label className="space-y-1 text-xs font-medium text-slate-600">
          Question (English, optional)
          <textarea rows={2} className={textareaClass} value={f.label ?? ""} onChange={(e) => onChange({ label: e.target.value })} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" className="h-4 w-4 accent-primary" checked={!!f.required} onChange={(e) => onChange({ required: e.target.checked })} />
          Answer required
        </label>
        {f.type === "status" && (
          <label className="flex items-center gap-2">
            Photos
            <select className="h-8 rounded-md border px-2 text-sm" value={f.evidence ?? "optional"} onChange={(e) => onChange({ evidence: e.target.value as FormField["evidence"] })}>
              <option value="optional">Optional</option>
              <option value="required">Required</option>
              <option value="none">Not asked</option>
            </select>
          </label>
        )}
        {f.type === "number" && (
          <label className="flex items-center gap-2">
            Unit
            <Input className="h-8 w-32" value={f.unit ?? ""} onChange={(e) => onChange({ unit: e.target.value })} />
          </label>
        )}
        <button type="button" className="text-primary hover:underline" onClick={onAdvanced}>
          {f.show_if ? "Edit condition…" : "+ Show only when…"}
        </button>
      </div>
      {f.type === "status" && (
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="mb-1 text-xs font-semibold text-slate-600">Choices</p>
          <StatusOptionsEditor
            value={choices}
            onChange={(status_options) => onChange({ status_options })}
            intro="What the inspector picks from for this question. The score gives the compliance %; “not counted” leaves an answer out (e.g. not applicable)."
          />
        </div>
      )}
      {badges}
    </div>
  );
}

/* =================== quick add =================== */
const QUICK_TYPES: { type: FieldType; label: string }[] = [
  { type: "status", label: "Status" },
  { type: "text", label: "Text" },
  { type: "long_text", label: "Long text" },
  { type: "number", label: "Number" },
  { type: "date", label: "Date" },
  { type: "select", label: "Choice" },
  { type: "checkboxes", label: "Several choices" },
  { type: "table", label: "Table" },
  { type: "photo", label: "File upload" },
  { type: "signature", label: "Signature" },
];

function QuickAddBar({ onAdd, onPaste }: { onAdd: (t: FieldType) => void; onPaste: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2">
      <span className="text-xs text-slate-500">Add:</span>
      {QUICK_TYPES.map((q) => (
        <button
          key={q.type}
          type="button"
          onClick={() => onAdd(q.type)}
          className={`h-8 rounded-full border px-3 text-xs ${q.type === "status" ? "border-primary font-semibold text-primary" : "border-slate-300 text-slate-700"} hover:bg-slate-50`}
        >
          + {q.label}
        </button>
      ))}
      <span className="flex-1" />
      <Button variant="secondary" size="sm" className="gap-1" onClick={onPaste}>
        <ClipboardPaste className="h-4 w-4" /> Paste many from Word
      </Button>
    </div>
  );
}

/* =================== paste many questions =================== */
/** One line = one question. Amharic lines fill the Amharic text; "English | አማርኛ" fills both. */
const parsePasted = (text: string) =>
  text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(\d+[.)-]|[-•*–])\s*/, "").trim())
    .filter(Boolean)
    .map((line) => {
      const [a, b] = line.split(/\s+\|\s+/);
      if (b) return ETHIOPIC.test(a) && !ETHIOPIC.test(b) ? { label: b.trim(), label_am: a.trim() } : { label: a.trim(), label_am: b.trim() };
      return ETHIOPIC.test(line) ? { label: "", label_am: line } : { label: line, label_am: "" };
    });

function PasteDialog({
  sectionTitle,
  takenKeys,
  defaultChoices,
  onAdd,
  onClose,
}: {
  sectionTitle: string;
  takenKeys: Set<string>;
  defaultChoices: StatusOption[];
  onAdd: (f: FormField[]) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [type, setType] = useState<"status" | "text" | "long_text">("status");
  const [required, setRequired] = useState(true);
  const rows = useMemo(() => parsePasted(text), [text]);

  const add = () => {
    if (!rows.length) return toast.error("Paste at least one line.");
    const taken = new Set(takenKeys);
    const fields = rows.map((r) => {
      const key = keyFromLabel(ETHIOPIC.test(r.label) ? "question" : r.label, taken);
      taken.add(key);
      return { key, type, label: r.label, label_am: r.label_am, required, ...(type === "status" ? { evidence: "optional" as const, status_options: clone(defaultChoices) } : {}) } as FormField;
    });
    onAdd(fields);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Paste questions into “{sectionTitle}”</DialogTitle>
          <DialogDescription>
            Copy the rows of a checklist from Word or Excel and paste them here. Each line becomes one question. Numbers at the start are removed. Write
            “English | አማርኛ” on a line to fill both languages.
          </DialogDescription>
        </DialogHeader>
        <textarea
          rows={10}
          className={textareaClass}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"1. የOSH ኃላፊ ወይም ተጠያቂ አገናኝ ሰው ስለመመደቡ\n2. PPE is provided to workers | ተገቢ የግል መከላከያ መሣሪያዎች ስለመቅረባቸው"}
        />
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2">
            Type
            <select className="h-9 rounded-md border px-2" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
              <option value="status">Status (ሁኔታ)</option>
              <option value="text">Short text</option>
              <option value="long_text">Long text</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4 accent-primary" checked={required} onChange={(e) => setRequired(e.target.checked)} />
            Answer required
          </label>
          <span className="ml-auto text-slate-500">{rows.length} question{rows.length === 1 ? "" : "s"}</span>
        </div>
        {rows.length > 0 && (
          <ol className="max-h-48 list-decimal space-y-1 overflow-y-auto rounded-lg bg-slate-50 py-2 pl-8 pr-3 text-sm">
            {rows.map((r, i) => (
              <li key={i}>
                <span lang="am">{r.label_am || r.label}</span>
                {r.label_am && r.label && <span className="block text-xs text-slate-500">{r.label}</span>}
                {!r.label_am && <span className="ml-2 text-xs text-amber-700">Amharic missing</span>}
              </li>
            ))}
          </ol>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={add} disabled={!rows.length}>
            Add {rows.length || ""} question{rows.length === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* =================== live phone preview =================== */
function PhonePreview({ definition, onHide }: { definition: FormDefinition; onHide: () => void }) {
  const [licenseType, setLicenseType] = useState<LicenseTypeKey>("exploration");
  const language = "am" as const; // inspectors see Amharic for now
  const [answers, setAnswers] = useState<Answers>({});
  return (
    <aside aria-label="Live preview" className="w-full space-y-2 xl:sticky xl:top-24 xl:w-[360px]">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
        <span className="font-semibold">Live preview</span>
        <select aria-label="License type" className="h-7 rounded border px-1" value={licenseType} onChange={(e) => setLicenseType(e.target.value as LicenseTypeKey)}>
          <option value="exploration">Exploration</option>
          <option value="mining">Mining</option>
        </select>
        <span className="flex-1" />
        <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={onHide}>
          <X className="h-3.5 w-3.5" /> Hide
        </Button>
      </div>
      <div className="h-[680px] overflow-y-auto rounded-[2rem] border-[10px] border-slate-900 bg-slate-50 p-2">
        <FormRenderer
          definition={definition}
          licenseType={licenseType}
          answers={answers}
          onChange={(k, v) => setAnswers((a) => ({ ...a, [k]: v }))}
          language={language}
          previewMode
        />
      </div>
    </aside>
  );
}

/* =================== review before publishing / saving =================== */
function ReviewDialog({
  form,
  mode,
  definition,
  changeNote,
  setChangeNote,
  saveFirst,
  onClose,
  onDone,
  onSwitchToDraft,
}: {
  form: FormDetail;
  mode: EditMode;
  definition: FormDefinition;
  changeNote: string;
  setChangeNote: (v: string) => void;
  saveFirst: () => Promise<boolean>;
  onClose: () => void;
  onDone: () => void;
  onSwitchToDraft: () => void;
}) {
  const [compare, { isLoading: comparing }] = useCompareWithCurrentMutation();
  const [publishDraft, { isLoading: publishing }] = usePublishDraftMutation();
  const [editLive, { isLoading: savingLive }] = useEditLiveMutation();
  const [createDraft] = useCreateDraftMutation();
  const [saveDraft] = useSaveDraftMutation();
  const [result, setResult] = useState<FormCompareResult | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    compare({ id: form.form_id, definition })
      .unwrap()
      .then(setResult)
      .catch((e) => setErrors([e?.data?.message || "Could not compare the changes."]));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const diff = result?.diff;
  const blocked = mode === "live" && (result?.inspections ?? 0) > 0 && (diff?.unsafe.length ?? 0) > 0;

  const confirm = async () => {
    setErrors([]);
    try {
      if (mode === "draft") {
        if (!(await saveFirst())) return;
        await publishDraft({ id: form.form_id, change_note: changeNote.trim() || null }).unwrap();
        toast.success(`Version ${form.draft?.version_number} published. New inspections use it from now on.`);
      } else {
        await editLive({ id: form.form_id, definition, note: changeNote.trim() || null }).unwrap();
        toast.success(`Version ${form.published?.version_number} updated.`);
      }
      onDone();
    } catch (e: any) {
      setErrors(e?.data?.unsafe || e?.data?.errors || [e?.data?.message || "Something went wrong."]);
    }
  };

  /** Live edits not allowed: carry them into a new draft instead */
  const moveToDraft = async () => {
    setMoving(true);
    try {
      if (!form.draft) await createDraft(form.form_id).unwrap();
      await saveDraft({ id: form.form_id, definition, change_note: changeNote.trim() || null }).unwrap();
      toast.success("Your changes are now in a new draft. Publish it when ready.");
      onSwitchToDraft();
    } catch (e: any) {
      setErrors(e?.data?.errors || [e?.data?.message || "Could not create the draft."]);
    } finally {
      setMoving(false);
    }
  };

  const List = ({ title, items, tone }: { title: string; items: string[]; tone: string }) =>
    items.length ? (
      <div>
        <p className={`text-sm font-semibold ${tone}`}>
          {title} ({items.length})
        </p>
        <ul className="ml-5 list-disc text-sm text-slate-700">
          {items.slice(0, 8).map((x, i) => (
            <li key={i}>{x}</li>
          ))}
          {items.length > 8 && <li className="text-slate-500">…and {items.length - 8} more</li>}
        </ul>
      </div>
    ) : null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{mode === "draft" ? `Publish version ${form.draft?.version_number}?` : `Save changes to version ${form.published?.version_number}?`}</DialogTitle>
          <DialogDescription>
            {mode === "draft"
              ? "New inspections will use this version. Inspections already done keep the version they were filled with."
              : "The changes go straight into the current version. No new version is made."}
          </DialogDescription>
        </DialogHeader>

        {comparing || (!result && !errors.length) ? (
          <p className="py-6 text-center text-sm text-slate-500">Comparing with the current version…</p>
        ) : diff ? (
          <div className="space-y-3">
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
              <strong>{result?.first_version ? "First version" : "Changes"}:</strong> {diff.summary}
            </p>
            {!result?.first_version && (
              <>
                <List title="Added" items={diff.added} tone="text-green-700" />
                <List title="Reworded" items={diff.reworded} tone="text-sky-700" />
                <List title="Changed" items={diff.changed} tone="text-amber-700" />
                <List title="Removed" items={diff.removed} tone="text-red-700" />
              </>
            )}
            {mode === "live" && (result?.inspections ?? 0) > 0 && (
              <p className="text-sm text-slate-600">
                Version {result?.current_version} has {result?.inspections} submitted inspection{result?.inspections === 1 ? "" : "s"}.
              </p>
            )}
            {blocked && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                <p className="font-semibold">These changes would alter answers already submitted, so they can’t be saved into this version:</p>
                <ul className="ml-5 list-disc">
                  {diff.unsafe.map((u, i) => (
                    <li key={i}>{u}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : null}

        {errors.length > 0 && (
          <ul className="ml-5 list-disc rounded-lg bg-red-50 py-2 pr-3 text-sm text-red-800">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        )}

        {!blocked && (
          <div className="space-y-1">
            <Label htmlFor="review-note">{mode === "draft" ? "What changed in this version" : "Note about this edit (optional)"}</Label>
            <textarea id="review-note" rows={2} className={textareaClass} value={changeNote} onChange={(e) => setChangeNote(e.target.value)} />
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Keep editing
          </Button>
          {blocked ? (
            <Button onClick={moveToDraft} disabled={moving}>
              {moving ? "Moving…" : "Save as a new version instead"}
            </Button>
          ) : (
            <Button onClick={confirm} disabled={!diff || !diff.hasChanges || publishing || savingLive}>
              {publishing || savingLive ? "Saving…" : mode === "draft" ? "Publish" : "Save to current version"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
