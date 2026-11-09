"use client";

/** Pieces shared by the form editor: status options and the section dialog. */
import { useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
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
import type { FormField, FormSection, LicenseTypeKey, StatusOption } from "@/redux/types/form";
import { keyFromLabel } from "./formLogic";

export const textareaClass =
  "w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/* =================== Status choices (like a Google Forms multiple-choice question) =================== */
type Preset = { name: string; options: StatusOption[] };
const opt = (value: string, label: string, label_am: string, score: number | null, action: StatusOption["action"] = "none"): StatusOption => ({
  value,
  label,
  label_am,
  score,
  note: "required",
  action,
});
export const STATUS_PRESETS: Preset[] = [
  {
    name: "Met / Partly met / Not met / N/A",
    options: [opt("met", "Met", "ተሟልቷል", 1), opt("partial", "Partly met", "በከፊል", 0.5), opt("not_met", "Not met", "አልተሟላም", 0), opt("na", "Not applicable", "አይመለከተውም", null)],
  },
  { name: "Yes / No", options: [opt("yes", "Yes", "አዎ", 1), opt("no", "No", "የለም", 0)] },
  { name: "Yes / No / N/A", options: [opt("yes", "Yes", "አዎ", 1), opt("no", "No", "የለም", 0), opt("na", "Not applicable", "አይመለከተውም", null)] },
  { name: "Good / Fair / Poor", options: [opt("good", "Good", "ጥሩ", 1), opt("fair", "Fair", "መካከለኛ", 0.5), opt("poor", "Poor", "ደካማ", 0)] },
];

export function StatusOptionsEditor({
  value,
  onChange,
  intro,
}: {
  value: StatusOption[];
  onChange: (v: StatusOption[]) => void;
  /** Text above the list (defaults to the explanation for the form's default choices) */
  intro?: React.ReactNode;
}) {
  const set = (i: number, patch: Partial<StatusOption>) => onChange(value.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  const move = (i: number, dir: -1 | 1) => {
    const next = [...value];
    const [o] = next.splice(i, 1);
    next.splice(i + dir, 0, o);
    onChange(next);
  };
  const taken = new Set(value.map((o) => o.value));
  const add = (label = "", label_am = "", score: number | null = 0) =>
    onChange([...value, { value: keyFromLabel(label || "choice", taken, "choice"), label, label_am, score, note: "required", action: "none" }]);
  const hasNA = value.some((o) => o.score == null);

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">
        {intro ??
          "New status questions start with these choices; each question can change its own. The score gives the compliance %; “not counted” leaves an answer out (e.g. not applicable)."}{" "}
        After choosing, the inspector always writes a description.
      </p>
      <ul className="space-y-2">
        {value.map((o, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2">
            <span aria-hidden className="h-4 w-4 shrink-0 rounded-full border-2 border-slate-300" />
            <Input aria-label={`Choice ${i + 1} (English)`} placeholder={`Choice ${i + 1}`} className="h-9 min-w-36 flex-1" value={o.label} onChange={(e) => set(i, { label: e.target.value })} />
            <Input aria-label={`Choice ${i + 1} (Amharic)`} placeholder="አማርኛ" lang="am" className="h-9 min-w-36 flex-1" value={o.label_am ?? ""} onChange={(e) => set(i, { label_am: e.target.value })} />
            <label className="flex items-center gap-1 text-xs text-slate-600">
              Score
              <Input
                type="number"
                step={0.25}
                min={0}
                max={100}
                aria-label={`Score for choice ${i + 1}`}
                className="h-9 w-20"
                disabled={o.score == null}
                value={o.score == null ? "" : o.score}
                onChange={(e) => set(i, { score: e.target.value === "" ? 0 : Math.max(0, Number(e.target.value)) })}
              />
            </label>
            <label className="flex items-center gap-1 text-xs text-slate-600">
              <input type="checkbox" className="h-4 w-4 accent-primary" checked={o.score == null} onChange={(e) => set(i, { score: e.target.checked ? null : 0 })} />
              Not counted
            </label>
            <label className="flex items-center gap-1 text-xs text-slate-600" title="The inspector must also write the action the company must take">
              <input type="checkbox" className="h-4 w-4 accent-primary" checked={o.action === "required"} onChange={(e) => set(i, { action: e.target.checked ? "required" : "none" })} />
              Ask for action needed
            </label>
            <span className="ml-auto flex">
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Move choice up" disabled={i === 0} onClick={() => move(i, -1)}>
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Move choice down" disabled={i === value.length - 1} onClick={() => move(i, 1)}>
                <ArrowDown className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Remove choice" disabled={value.length <= 2} onClick={() => onChange(value.filter((_, j) => j !== i))}>
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            </span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" className="gap-1" disabled={value.length >= 10} onClick={() => add()}>
          <Plus className="h-3.5 w-3.5" /> Add choice
        </Button>
        {!hasNA && (
          <Button variant="outline" size="sm" className="gap-1" disabled={value.length >= 10} onClick={() => add("Not applicable", "አይመለከተውም", null)}>
            <Plus className="h-3.5 w-3.5" /> Add “Not applicable”
          </Button>
        )}
        <label className="ml-auto flex items-center gap-2 text-xs text-slate-600">
          Use a ready set
          <select
            className="h-8 rounded-md border px-2 text-xs"
            value=""
            onChange={(e) => {
              const p = STATUS_PRESETS[Number(e.target.value)];
              if (p) onChange(p.options.map((o) => ({ ...o })));
            }}
          >
            <option value="">Choose…</option>
            {STATUS_PRESETS.map((p, i) => (
              <option key={p.name} value={i}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {value.every((o) => o.score == null) && <p className="text-xs font-medium text-amber-700">At least one choice needs a score.</p>}
    </div>
  );
}

/* =================== Section dialog =================== */
export function SectionDialog({
  section,
  isNew,
  conditionSources,
  statusOptions,
  onSave,
  onClose,
}: {
  section: FormSection;
  isNew: boolean;
  conditionSources: FormField[];
  statusOptions: StatusOption[];
  onSave: (s: FormSection) => void;
  onClose: () => void;
}) {
  const [s, setS] = useState<FormSection>(section);
  const set = (patch: Partial<FormSection>) => setS((cur) => ({ ...cur, ...patch }));
  const types: LicenseTypeKey[] = s.applies_to?.license_types ?? [];
  const source = conditionSources.find((f) => f.key === s.show_if?.field);
  const choices = source ? (source.type === "status" ? (source.status_options?.length ? source.status_options : statusOptions) : source.options || []) : [];

  const save = () => {
    if (s.title.trim().length < 2) return toast.error("Give the section a title.");
    const out: FormSection = {
      ...s,
      title: s.title.trim(),
      title_am: s.title_am?.trim() || null,
      number: s.number?.trim() || null,
      description: s.description?.trim() || null,
      description_am: s.description_am?.trim() || null,
    };
    if (!out.applies_to?.license_types.length) delete out.applies_to;
    if (!out.show_if?.field || !out.show_if.in.length) delete out.show_if;
    onSave(out);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isNew ? "Add section" : "Edit section"}</DialogTitle>
          <DialogDescription>A group of questions, e.g. “Occupational safety and health (OSH)”.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[6rem_1fr]">
          <div className="space-y-2">
            <Label htmlFor="s-num">Number</Label>
            <Input id="s-num" value={s.number ?? ""} onChange={(e) => set({ number: e.target.value })} placeholder="5" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-title">Title (English) *</Label>
            <Input id="s-title" value={s.title} onChange={(e) => set({ title: e.target.value })} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="s-title-am">ርዕስ (አማርኛ)</Label>
            <Input id="s-title-am" lang="am" value={s.title_am ?? ""} onChange={(e) => set({ title_am: e.target.value })} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="s-desc">Instructions (English)</Label>
            <textarea id="s-desc" rows={3} className={textareaClass} value={s.description ?? ""} onChange={(e) => set({ description: e.target.value })} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="s-desc-am">መመሪያ (አማርኛ)</Label>
            <textarea id="s-desc-am" lang="am" rows={3} className={textareaClass} value={s.description_am ?? ""} onChange={(e) => set({ description_am: e.target.value })} />
          </div>
        </div>

        <div className="space-y-2 rounded-lg border p-3">
          <Label>Only for these licenses</Label>
          <div className="flex gap-5 text-sm">
            {(["exploration", "mining"] as LicenseTypeKey[]).map((t) => (
              <label key={t} className="flex items-center gap-2 capitalize">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={types.includes(t)}
                  onChange={(e) => {
                    const next = e.target.checked ? [...types, t] : types.filter((x) => x !== t);
                    set({ applies_to: next.length ? { license_types: next } : undefined });
                  }}
                />
                {t}
              </label>
            ))}
          </div>
          <p className="text-xs text-slate-500">Leave both unticked for all licenses.</p>
        </div>

        <div className="space-y-2 rounded-lg border p-3">
          <Label>Show this section only when…</Label>
          <select
            className="h-9 w-full rounded-md border px-2 text-sm"
            value={s.show_if?.field ?? ""}
            onChange={(e) => set({ show_if: e.target.value ? { field: e.target.value, in: [] } : undefined })}
          >
            <option value="">Always show</option>
            {conditionSources.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label.slice(0, 90)}
              </option>
            ))}
          </select>
          {source && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <span className="text-slate-500">…the answer is:</span>
              {choices.map((o) => (
                <label key={o.value} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    checked={!!s.show_if?.in.includes(o.value)}
                    onChange={(e) =>
                      set({
                        show_if: {
                          field: source.key,
                          in: e.target.checked ? [...(s.show_if?.in || []), o.value] : (s.show_if?.in || []).filter((v) => v !== o.value),
                        },
                      })
                    }
                  />
                  {o.label}
                </label>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>{isNew ? "Add section" : "Done"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
