"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChoiceOption, FIELD_TYPE_LABEL, FieldType, FileKind, FormField, MAX_FILE_MB, PREFILL_LABEL, StatusOption, TableColumn } from "@/redux/types/form";
import { keyFromLabel } from "./formLogic";
import { StatusOptionsEditor } from "./FormEditorParts";

interface Props {
  /** The question to edit, or a new one (type chosen in the dialog) */
  field: FormField | null;
  isNew: boolean;
  /** Keys used elsewhere in the form (for new keys) */
  takenKeys: Set<string>;
  /** Earlier status / choice questions this one can depend on */
  conditionSources: FormField[];
  statusOptions: StatusOption[];
  onSave: (field: FormField) => void;
  onClose: () => void;
}

const NONE = "__none__";
const textareaClass =
  "w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/** Choices editor: English + Amharic label; values are made from the English label and kept once saved. */
function ChoicesEditor({ value, onChange }: { value: ChoiceOption[]; onChange: (v: ChoiceOption[]) => void }) {
  const set = (i: number, patch: Partial<ChoiceOption>) => onChange(value.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  const move = (i: number, d: number) => {
    const next = [...value];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x);
    onChange(next);
  };
  return (
    <div className="space-y-2">
      {value.map((o, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input value={o.label} onChange={(e) => set(i, { label: e.target.value })} placeholder="English" />
          <Input lang="am" value={o.label_am ?? ""} onChange={(e) => set(i, { label_am: e.target.value })} placeholder="አማርኛ" />
          <Button type="button" variant="ghost" size="icon" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" disabled={i === value.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
            <ArrowDown className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="Remove choice">
            <Trash2 className="h-4 w-4 text-red-500" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => onChange([...value, { value: "", label: "", label_am: "" }])}>
        <Plus className="h-3.5 w-3.5" /> Add choice
      </Button>
    </div>
  );
}

/** Give every choice / column a value or key from its label if it has none yet. */
const withValues = <T extends { label: string }>(items: T[], prop: "value" | "key", fallback: string): T[] => {
  const taken = new Set(items.map((i: any) => i[prop]).filter(Boolean));
  return items.map((i: any) => {
    if (i[prop]) return i;
    const v = keyFromLabel(i.label || fallback, taken, fallback);
    taken.add(v);
    return { ...i, [prop]: v };
  });
};

export function FieldEditorDialog({ field, isNew, takenKeys, conditionSources, statusOptions, onSave, onClose }: Props) {
  const [f, setF] = useState<FormField | null>(field);
  useEffect(() => setF(field ? JSON.parse(JSON.stringify(field)) : null), [field]);

  const set = (patch: Partial<FormField>) => setF((cur) => (cur ? { ...cur, ...patch } : cur));
  const source = useMemo(() => conditionSources.find((s) => s.key === f?.show_if?.field), [conditionSources, f?.show_if?.field]);
  const sourceChoices: ChoiceOption[] = source ? (source.type === "status" ? (source.status_options?.length ? source.status_options : statusOptions) : source.options || []) : [];

  if (!f) return null;

  const changeType = (type: FieldType) => {
    // Keep the shared parts; reset type options to sensible defaults
    const base: FormField = { key: f.key, type, label: f.label, label_am: f.label_am, help: f.help, help_am: f.help_am, required: f.required, show_if: f.show_if };
    if (type === "status") Object.assign(base, { evidence: "optional", accept: ["image"], max_files: 10, max_size_mb: 20, status_options: statusOptions.map((o) => ({ ...o })) });
    if (type === "select" || type === "checkboxes") base.options = [{ value: "", label: "", label_am: "" }];
    if (type === "table") Object.assign(base, { columns: [{ key: "", label: "", label_am: "", type: "text" }], rows: [], allow_add_rows: true });
    if (type === "photo") Object.assign(base, { accept: ["image"], max_files: 10, max_size_mb: 20 });
    if (type === "signature") Object.assign(base, { multiple: false, with_name: true });
    setF(base);
  };

  const save = () => {
    if ((f.label_am ?? "").trim().length < 2) return toast.error("ጥያቄውን በአማርኛ ይጻፉ — write the question in Amharic.");
    let out: FormField = { ...f, label: (f.label ?? "").trim(), label_am: f.label_am!.trim(), help: f.help?.trim() || null, help_am: f.help_am?.trim() || null };
    if (isNew || !out.key) out.key = keyFromLabel(out.label || "question", takenKeys);
    if (out.options) {
      out.options = withValues(out.options.filter((o) => o.label.trim()), "value", "choice");
      if (!out.options.length) return toast.error("Add at least one choice.");
    }
    if (out.type === "status") {
      const choices = (out.status_options?.length ? out.status_options : statusOptions).filter((o) => o.label.trim());
      if (choices.length < 2) return toast.error("Give the status question at least two choices.");
      if (choices.every((o) => o.score == null)) return toast.error("At least one status choice needs a score.");
      out.status_options = choices.map((o) => ({ ...o, label: o.label.trim(), label_am: o.label_am?.trim() || null, note: "required" }));
    }
    if (out.columns) {
      out.columns = withValues(out.columns.filter((c) => c.label.trim()), "key", "column").map((c) => ({
        ...c,
        ...(c.type === "select" ? { options: withValues((c.options || []).filter((o) => o.label.trim()), "value", "choice") } : { options: undefined }),
      }));
      if (!out.columns.length) return toast.error("Add at least one column.");
      if (out.columns.some((c) => c.type === "select" && !c.options?.length)) return toast.error("Give each choice column at least one choice.");
      out.rows = (out.rows || []).filter((r) => r.label.trim());
    }
    if (out.show_if && (!out.show_if.field || !out.show_if.in.length)) out = { ...out, show_if: undefined };
    if (out.type === "number") {
      if (out.min == null || Number.isNaN(out.min)) delete out.min;
      if (out.max == null || Number.isNaN(out.max)) delete out.max;
    }
    onSave(out);
  };

  const setColumns = (columns: TableColumn[]) => set({ columns });

  return (
    <Dialog open={!!field} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isNew ? "Add question" : "Edit question"}</DialogTitle>
          <DialogDescription>{FIELD_TYPE_LABEL[f.type]}{!isNew && <span className="ml-2 font-mono text-xs text-slate-400">{f.key}</span>}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isNew && (
            <div className="space-y-2">
              <Label>Type of answer</Label>
              <Select value={f.type} onValueChange={(v) => changeType(v as FieldType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(FIELD_TYPE_LABEL) as FieldType[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {FIELD_TYPE_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="q-label-am">ጥያቄ (አማርኛ) *</Label>
              <textarea id="q-label-am" lang="am" autoFocus rows={3} className={textareaClass} value={f.label_am ?? ""} onChange={(e) => set({ label_am: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="q-label">Question (English, optional)</Label>
              <textarea id="q-label" rows={3} className={textareaClass} value={f.label ?? ""} onChange={(e) => set({ label: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="q-help-am">ማብራሪያ (አማርኛ)</Label>
              <Input id="q-help-am" lang="am" value={f.help_am ?? ""} onChange={(e) => set({ help_am: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="q-help">Hint (English, optional)</Label>
              <Input id="q-help" value={f.help ?? ""} onChange={(e) => set({ help: e.target.value })} />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-primary" checked={!!f.required} onChange={(e) => set({ required: e.target.checked })} />
            Answer required
          </label>

          {/* ---------- type options ---------- */}
          {f.type === "status" && (
            <div className="space-y-2">
              <Label>File upload with the answer</Label>
              <Select value={f.evidence ?? "optional"} onValueChange={(v) => set({ evidence: v as FormField["evidence"] })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="optional">Optional</SelectItem>
                  <SelectItem value="required">Required</SelectItem>
                  <SelectItem value="none">Not asked</SelectItem>
                </SelectContent>
              </Select>
              {f.evidence !== "none" && <FileSettings field={f} set={set} />}
            </div>
          )}
          {f.type === "status" && (
            <div className="space-y-2">
              <Label>Choices</Label>
              <StatusOptionsEditor
                value={f.status_options?.length ? f.status_options : statusOptions}
                onChange={(status_options) => set({ status_options })}
                intro="The choices the inspector picks from for this question. The score gives the compliance %; “not counted” leaves an answer out (e.g. not applicable)."
              />
            </div>
          )}

          {f.type === "text" && (
            <div className="space-y-2">
              <Label>Fill in automatically from</Label>
              <Select value={f.prefill ?? NONE} onValueChange={(v) => set({ prefill: v === NONE ? undefined : v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Nothing (inspector types it)</SelectItem>
                  {Object.entries(PREFILL_LABEL).map(([k, label]) => (
                    <SelectItem key={k} value={k}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {f.type === "number" && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="q-unit">Unit</Label>
                <Input id="q-unit" value={f.unit ?? ""} onChange={(e) => set({ unit: e.target.value })} placeholder="e.g. tonnes" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="q-min">Minimum</Label>
                <Input id="q-min" type="number" value={f.min ?? ""} onChange={(e) => set({ min: e.target.value === "" ? undefined : Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="q-max">Maximum</Label>
                <Input id="q-max" type="number" value={f.max ?? ""} onChange={(e) => set({ max: e.target.value === "" ? undefined : Number(e.target.value) })} />
              </div>
            </div>
          )}

          {(f.type === "select" || f.type === "checkboxes") && (
            <div className="space-y-2">
              <Label>Choices</Label>
              <ChoicesEditor value={f.options || []} onChange={(options) => set({ options })} />
            </div>
          )}

          {f.type === "table" && (
            <div className="space-y-4 rounded-lg border p-3">
              <div className="space-y-2">
                <Label>Columns</Label>
                {(f.columns || []).map((c, i) => (
                  <div key={i} className="space-y-2 rounded-md bg-slate-50 p-2">
                    <div className="flex items-center gap-2">
                      <Input value={c.label} onChange={(e) => setColumns((f.columns || []).map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder="Column (English)" />
                      <Input lang="am" value={c.label_am ?? ""} onChange={(e) => setColumns((f.columns || []).map((x, j) => (j === i ? { ...x, label_am: e.target.value } : x)))} placeholder="አምድ (አማርኛ)" />
                      <select
                        className="h-9 rounded-md border px-2 text-sm"
                        value={c.type}
                        onChange={(e) =>
                          setColumns((f.columns || []).map((x, j) => (j === i ? { ...x, type: e.target.value as TableColumn["type"], options: e.target.value === "select" ? x.options || [{ value: "", label: "" }] : undefined } : x)))
                        }
                      >
                        <option value="text">Text</option>
                        <option value="number">Number</option>
                        <option value="date">Date</option>
                        <option value="select">Choice</option>
                        <option value="signature">Signature</option>
                      </select>
                      <Button type="button" variant="ghost" size="icon" onClick={() => setColumns((f.columns || []).filter((_, j) => j !== i))} aria-label="Remove column">
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                    {c.type === "select" && (
                      <ChoicesEditor value={c.options || []} onChange={(options) => setColumns((f.columns || []).map((x, j) => (j === i ? { ...x, options } : x)))} />
                    )}
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => setColumns([...(f.columns || []), { key: "", label: "", label_am: "", type: "text" }])}>
                  <Plus className="h-3.5 w-3.5" /> Add column
                </Button>
              </div>
              <div className="space-y-2">
                <Label htmlFor="q-rows">Fixed first-column rows (one per line, “English | አማርኛ”)</Label>
                <textarea
                  id="q-rows"
                  rows={4}
                  className={textareaClass}
                  value={(f.rows || []).map((r) => (r.label_am ? `${r.label} | ${r.label_am}` : r.label)).join("\n")}
                  onChange={(e) =>
                    set({
                      rows: e.target.value.split("\n").map((line) => {
                        const [label, label_am] = line.split("|").map((s) => s.trim());
                        return { label: label ?? "", label_am: label_am || null };
                      }),
                    })
                  }
                  placeholder={"Year 1 | 1ኛ ዓመት\nYear 2 | 2ኛ ዓመት"}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-primary" checked={f.allow_add_rows !== false} onChange={(e) => set({ allow_add_rows: e.target.checked })} />
                Inspectors can add rows
              </label>
            </div>
          )}

          {f.type === "photo" && <FileSettings field={f} set={set} />}

          {f.type === "signature" && (
            <div className="flex flex-wrap gap-5 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" className="h-4 w-4 accent-primary" checked={!!f.multiple} onChange={(e) => set({ multiple: e.target.checked })} />
                Several people sign (e.g. every team member)
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" className="h-4 w-4 accent-primary" checked={f.with_name !== false} onChange={(e) => set({ with_name: e.target.checked })} />
                Ask for the signer’s name
              </label>
            </div>
          )}

          {/* ---------- condition ---------- */}
          <div className="space-y-2 rounded-lg border p-3">
            <Label>Show this question only when…</Label>
            <Select
              value={f.show_if?.field ?? NONE}
              onValueChange={(v) => set({ show_if: v === NONE ? undefined : { field: v, in: [] } })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Always show</SelectItem>
                {conditionSources.map((s) => (
                  <SelectItem key={s.key} value={s.key}>
                    {s.label.slice(0, 80)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {source && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <span className="text-slate-500">…the answer is:</span>
                {sourceChoices.map((o) => (
                  <label key={o.value} className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary"
                      checked={!!f.show_if?.in.includes(o.value)}
                      onChange={(e) =>
                        set({
                          show_if: {
                            field: source.key,
                            in: e.target.checked ? [...(f.show_if?.in || []), o.value] : (f.show_if?.in || []).filter((v) => v !== o.value),
                          },
                        })
                      }
                    />
                    {o.label}
                  </label>
                ))}
              </div>
            )}
            {conditionSources.length === 0 && <p className="text-xs text-slate-500">Add a status or choice question earlier in the checklist to use conditions.</p>}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>{isNew ? "Add question" : "Done"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const FILE_KIND_OPTIONS: { kind: FileKind; label: string; hint: string }[] = [
  { kind: "image", label: "Photos", hint: "JPG, PNG, HEIC — from the camera or gallery" },
  { kind: "document", label: "Documents", hint: "PDF, Word, Excel, PowerPoint, CSV" },
  { kind: "video", label: "Videos", hint: "MP4, MOV, WebM — large; set a size limit" },
];

/** Which kinds of file, how many and how big (per file) — for file questions and status evidence. */
function FileSettings({ field: f, set }: { field: FormField; set: (patch: Partial<FormField>) => void }) {
  const accept = f.accept?.length ? f.accept : ["image" as FileKind];
  const toggle = (k: FileKind) => {
    const next = accept.includes(k) ? accept.filter((x) => x !== k) : [...accept, k];
    if (next.length) set({ accept: next });
  };
  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">Accepted files</legend>
        {FILE_KIND_OPTIONS.map((o) => (
          <label key={o.kind} className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary" checked={accept.includes(o.kind)} onChange={() => toggle(o.kind)} />
            <span>
              {o.label}
              <span className="block text-xs text-slate-500">{o.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="flex flex-wrap gap-4">
        <div className="space-y-1">
          <Label htmlFor={`q-max-files-${f.key}`}>Most files</Label>
          <Input
            id={`q-max-files-${f.key}`}
            type="number"
            min={1}
            max={30}
            className="w-28"
            value={f.max_files ?? 10}
            onChange={(e) => set({ max_files: Math.min(30, Math.max(1, Number(e.target.value) || 1)) })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`q-max-size-${f.key}`}>Max size per file (MB)</Label>
          <Input
            id={`q-max-size-${f.key}`}
            type="number"
            min={1}
            max={MAX_FILE_MB}
            className="w-28"
            value={f.max_size_mb ?? 20}
            onChange={(e) => set({ max_size_mb: Math.min(MAX_FILE_MB, Math.max(1, Number(e.target.value) || 1)) })}
          />
        </div>
      </div>
      <p className="text-xs text-slate-500">
        Up to {MAX_FILE_MB} MB per file. Photos are made smaller on the phone before uploading.
        {accept.includes("video") && " A minute of phone video is often 50–150 MB; keep videos short on slow connections."}
      </p>
    </div>
  );
}
