"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect, SelectOption } from "@/components/ui/searchable-select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useGetFormsQuery } from "@/redux/api/formApi";
import { useGetLicensesQuery } from "@/redux/api/companyApi";
import { useCreateScheduleMutation, usePreviewScheduleMutation, useUpdateScheduleMutation } from "@/redux/api/inspectionApi";
import type { LicenseTypeKey } from "@/redux/types/form";
import { FREQUENCY_LABEL, Frequency, ScheduleDetail, SchedulePayload, ScheduleTarget, WEEKDAY_LONG, WEEKDAY_SHORT } from "@/redux/types/inspection";
import { formatCalendarDate } from "@/utils/date";
import { describeDue, describeFrequency, dueText } from "./taskUi";

const DEFAULT_DUE: Record<Frequency, number> = { once: 7, daily: 1, weekly: 7, monthly: 30, quarterly: 30, yearly: 30, every_n_days: 1 };
const todayLocal = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10); // Ethiopia (UTC+3)
const selectClass = "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm";

interface Props {
  /** Editing an existing schedule; omit to create */
  schedule?: ScheduleDetail;
  /** Preselect a form when creating from a form's page */
  formId?: string;
  onClose: () => void;
  onSaved?: (scheduleId: string) => void;
}

export function ScheduleFormDialog({ schedule, formId, onClose, onSaved }: Props) {
  const editing = !!schedule;
  const hasTasks = (schedule?.occurrence_count ?? 0) > 0;
  const { data: forms = [] } = useGetFormsQuery();
  const [v, setV] = useState<SchedulePayload>(() =>
    schedule
      ? {
          form_id: schedule.form_id,
          name: schedule.name,
          target_type: schedule.target_type,
          license_type: schedule.license_type,
          license_ids: schedule.licenses?.map((l) => l.license_id) ?? [],
          frequency: schedule.frequency,
          interval_days: schedule.interval_days,
          weekdays: schedule.weekdays,
          month_day: schedule.month_day,
          start_date: String(schedule.start_date).slice(0, 10),
          end_date: schedule.end_date ? String(schedule.end_date).slice(0, 10) : null,
          due_days: schedule.due_days,
          notes: schedule.notes,
        }
      : { form_id: formId, name: "", target_type: "assigned", license_type: "mining", license_ids: [], frequency: "weekly", weekdays: null, start_date: todayLocal(), end_date: null, due_days: 7, notes: "" },
  );
  const [dueTouched, setDueTouched] = useState(editing);
  const set = (patch: Partial<SchedulePayload>) => setV((cur) => ({ ...cur, ...patch }));

  const { data: licenses } = useGetLicensesQuery({ limit: 200 }, { skip: v.target_type !== "licenses" });
  const licenseOptions: SelectOption[] = useMemo(
    () => (licenses?.data ?? []).map((l) => ({ value: l.license_id, label: `${l.company?.name ?? ""} — ${l.license_number} (${l.license_type})` })),
    [licenses],
  );
  const chosen = licenseOptions.filter((o) => v.license_ids?.includes(o.value));
  const scheduleable = forms.filter((f) => f.published && (f.is_active || f.form_id === v.form_id));

  const [preview, { data: pv, isLoading: previewing, error: previewError, reset: resetPreview }] = usePreviewScheduleMutation();
  const [createSchedule, { isLoading: creating }] = useCreateScheduleMutation();
  const [updateSchedule, { isLoading: updating }] = useUpdateScheduleMutation();

  /** What is sent: only the fields that matter for the chosen frequency / target */
  const payload = (): SchedulePayload => {
    const p: SchedulePayload = { ...v, name: v.name?.trim(), notes: v.notes?.trim() || null, end_date: v.end_date || null };
    if (p.frequency !== "every_n_days") delete p.interval_days;
    if (!["daily", "weekly"].includes(p.frequency!)) delete p.weekdays;
    if (!["monthly", "quarterly", "yearly"].includes(p.frequency!)) delete p.month_day;
    if (p.target_type !== "license_type") delete p.license_type;
    if (p.target_type !== "licenses") delete p.license_ids;
    if (p.frequency === "once") p.end_date = null;
    return p;
  };

  // Live preview (debounced)
  const previewKey = JSON.stringify({ ...payload(), name: undefined, notes: undefined });
  useEffect(() => {
    if (!v.form_id || !v.start_date || (v.target_type === "licenses" && !v.license_ids?.length) || (v.frequency === "every_n_days" && !v.interval_days)) {
      resetPreview();
      return;
    }
    const t = setTimeout(() => preview(payload()), 400);
    return () => clearTimeout(t);
  }, [previewKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const changeFrequency = (frequency: Frequency) => {
    set({
      frequency,
      weekdays: frequency === "weekly" ? [v.start_date ? new Date(`${v.start_date}T00:00:00Z`).getUTCDay() : 1] : null,
      month_day: ["monthly", "quarterly", "yearly"].includes(frequency) ? Math.min(28, Number((v.start_date || todayLocal()).slice(8, 10))) : null,
      interval_days: frequency === "every_n_days" ? v.interval_days || 3 : null,
      ...(dueTouched ? {} : { due_days: DEFAULT_DUE[frequency] }),
    });
  };

  const save = async () => {
    if ((v.name?.trim().length ?? 0) < 3) return toast.error("Give the schedule a name.");
    if (!v.form_id) return toast.error("Choose a form.");
    if (v.target_type === "licenses" && !v.license_ids?.length) return toast.error("Choose at least one license.");
    if (v.end_date && v.start_date && v.end_date < v.start_date) return toast.error("The end date is before the start date.");
    try {
      const p = payload();
      if (editing && hasTasks) delete p.form_id;
      const r = editing ? await updateSchedule({ id: schedule!.schedule_id, data: p }).unwrap() : await createSchedule(p).unwrap();
      toast.success(r.message || "Schedule saved.");
      onSaved?.(r.schedule_id);
      onClose();
    } catch (e: any) {
      toast.error(e?.data?.message || "Could not save the schedule.");
    }
  };

  const toggleWeekday = (d: number) => {
    const all = v.weekdays?.length ? v.weekdays : [0, 1, 2, 3, 4, 5, 6];
    const next = all.includes(d) ? all.filter((x) => x !== d) : [...all, d].sort();
    if (!next.length) return;
    set({ weekdays: next.length === 7 ? null : next });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit schedule" : "New inspection schedule"}</DialogTitle>
          <DialogDescription>
            Each time the schedule comes round, every covered license gets a task for its team. {editing && "Changes apply to tasks created from now on."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="sch-name">Name *</Label>
              <Input id="sch-name" value={v.name ?? ""} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Monthly field monitoring — mining licenses" />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="sch-form">Form *</Label>
              <select id="sch-form" className={selectClass} value={v.form_id ?? ""} disabled={editing && hasTasks} onChange={(e) => set({ form_id: e.target.value })}>
                <option value="">Choose a published form…</option>
                {scheduleable.map((f) => (
                  <option key={f.form_id} value={f.form_id}>
                    {f.name} (version {f.published?.version_number}, {f.published?.summary.questions} questions)
                  </option>
                ))}
              </select>
              {editing && hasTasks && <p className="text-xs text-slate-500">The form can’t change once tasks exist.</p>}
            </div>
          </div>

          {/* Licenses */}
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Which licenses *</legend>
            {(
              [
                ["assigned", "Everyone the form applies to", "Follows the form’s “Applies to” list, including licenses added to it later."],
                ["license_type", "All licenses of one type", "Every active exploration or mining license."],
                ["licenses", "Chosen licenses", "Pick them one by one, e.g. for a short daily check."],
              ] as [ScheduleTarget, string, string][]
            ).map(([value, label, hint]) => (
              <div key={value} className={`rounded-lg border p-3 ${v.target_type === value ? "border-primary bg-primary/5" : "border-slate-200"}`}>
                {/* Only the radio and its text are the clickable label; the pickers below sit outside it */}
                <label className="flex cursor-pointer items-start gap-3">
                  <input type="radio" name="sch-target" className="mt-1 accent-primary" checked={v.target_type === value} onChange={() => set({ target_type: value })} />
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="font-medium">{label}</span>
                    <span className="block text-xs text-slate-500">{hint}</span>
                  </span>
                </label>
                {value === "license_type" && v.target_type === "license_type" && (
                  <select
                    aria-label="License type"
                    className={`${selectClass} ml-7 mt-2 max-w-48`}
                    value={v.license_type ?? "mining"}
                    onChange={(e) => set({ license_type: e.target.value as LicenseTypeKey })}
                  >
                    <option value="mining">Mining</option>
                    <option value="exploration">Exploration</option>
                  </select>
                )}
                {value === "licenses" && v.target_type === "licenses" && (
                  <div className="ml-7 mt-2 space-y-1">
                    <SearchableSelect
                      isMulti
                      options={licenseOptions}
                      value={chosen}
                      onChange={(o) => set({ license_ids: ((o as SelectOption[]) || []).map((x) => x.value) })}
                      placeholder="Search company or license number"
                    />
                    <p className="text-xs text-slate-500">{chosen.length} chosen</p>
                  </div>
                )}
              </div>
            ))}
          </fieldset>

          {/* How often */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="sch-freq">How often *</Label>
              <select id="sch-freq" className={selectClass} value={v.frequency} onChange={(e) => changeFrequency(e.target.value as Frequency)}>
                {(Object.keys(FREQUENCY_LABEL) as Frequency[]).map((f) => (
                  <option key={f} value={f}>
                    {FREQUENCY_LABEL[f]}
                  </option>
                ))}
              </select>
            </div>

            {v.frequency === "weekly" && (
              <div className="space-y-1">
                <Label htmlFor="sch-weekday">Opens on</Label>
                <select id="sch-weekday" className={selectClass} value={v.weekdays?.[0] ?? 1} onChange={(e) => set({ weekdays: [Number(e.target.value)] })}>
                  {WEEKDAY_LONG.map((d, i) => (
                    <option key={d} value={i}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {["monthly", "quarterly", "yearly"].includes(v.frequency!) && (
              <div className="space-y-1">
                <Label htmlFor="sch-day">Day of the month</Label>
                <Input id="sch-day" type="number" min={1} max={28} value={v.month_day ?? 1} onChange={(e) => set({ month_day: Math.min(28, Math.max(1, Number(e.target.value) || 1)) })} />
                <p className="text-xs text-slate-500">1–28, so it exists in every month.</p>
              </div>
            )}
            {v.frequency === "every_n_days" && (
              <div className="space-y-1">
                <Label htmlFor="sch-int">Every how many days</Label>
                <Input id="sch-int" type="number" min={2} max={365} value={v.interval_days ?? ""} onChange={(e) => set({ interval_days: Number(e.target.value) || null })} />
              </div>
            )}
            {v.frequency === "daily" && (
              <div className="space-y-1 sm:col-span-2">
                <Label>On these days</Label>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAY_SHORT.map((d, i) => {
                    const on = !v.weekdays?.length || v.weekdays.includes(i);
                    return (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleWeekday(i)}
                        className={`h-8 rounded-full border px-3 text-xs font-medium ${on ? "border-primary bg-primary text-white" : "border-slate-300 text-slate-600"}`}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-1">
              <Label htmlFor="sch-start">{v.frequency === "once" ? "Date *" : "Starts on *"}</Label>
              <Input id="sch-start" type="date" value={v.start_date ?? ""} onChange={(e) => set({ start_date: e.target.value })} />
            </div>
            {v.frequency !== "once" && (
              <div className="space-y-1">
                <Label htmlFor="sch-end">Ends on (optional)</Label>
                <Input id="sch-end" type="date" value={v.end_date ?? ""} min={v.start_date} onChange={(e) => set({ end_date: e.target.value || null })} />
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="sch-due">Days the team has to submit *</Label>
              <Input
                id="sch-due"
                type="number"
                min={1}
                max={366}
                value={v.due_days ?? 1}
                onChange={(e) => {
                  setDueTouched(true);
                  set({ due_days: Math.max(1, Number(e.target.value) || 1) });
                }}
              />
              <p className="text-xs text-slate-500">1 = the same day. Long forms need more days. After that, tasks show as overdue and can still be submitted late.</p>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="sch-notes">Notes for the teams (optional)</Label>
            <textarea id="sch-notes" rows={2} className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={v.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} />
          </div>

          {/* Preview */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
            <p className="flex items-center gap-2 font-semibold text-slate-900">
              <CalendarClock className="h-4 w-4 text-primary" /> {describeFrequency(v)}, {describeDue(v.due_days ?? 1)}
            </p>
            {previewing && !pv ? (
              <p className="mt-2 text-slate-500">Checking…</p>
            ) : previewError ? (
              <p className="mt-2 text-red-600">{(previewError as any)?.data?.message || "Could not check the schedule."}</p>
            ) : pv ? (
              <div className="mt-2 space-y-1 text-slate-700">
                <p>
                  <strong>{pv.license_count}</strong> license{pv.license_count === 1 ? "" : "s"} → {pv.license_count} task{pv.license_count === 1 ? "" : "s"} each time.
                </p>
                {pv.licenses_without_team > 0 && (
                  <p className="flex items-center gap-1 text-amber-700">
                    <AlertTriangle className="h-4 w-4" /> {pv.licenses_without_team} license(s) have no team; their tasks wait until you assign one.
                  </p>
                )}
                {pv.next.length > 0 ? (
                  <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
                    {pv.next.slice(0, 4).map((n) => (
                      <li key={n.opens}>
                        Opens {formatCalendarDate(n.opens)} → due by end of {dueText(n.due_at)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-500">No dates in this range.</p>
                )}
              </div>
            ) : (
              <p className="mt-2 text-slate-500">Choose a form and licenses to see what will be created.</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={creating || updating}>
            {creating || updating ? "Saving…" : editing ? "Save changes" : "Create schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
