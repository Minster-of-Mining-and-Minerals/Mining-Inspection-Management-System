"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import Loading01 from "@/features/template/component/Loading/Loading01";
import { usePermissions } from "@/hooks/usePermissions";
import { useGetSchedulesQuery } from "@/redux/api/inspectionApi";
import type { Schedule } from "@/redux/types/inspection";
import { formatCalendarDate } from "@/utils/date";
import { ScheduleFormDialog } from "./ScheduleFormDialog";
import { describeDue, describeFrequency, describeTarget } from "./taskUi";
import { SectorFilter } from "@/components/common/SectorFilter";

const STATUS_CHIP: Record<Schedule["status"], string> = {
  active: "bg-green-100 text-green-800",
  paused: "bg-amber-100 text-amber-800",
  ended: "bg-slate-100 text-slate-600",
};

/** Admin: every inspection schedule, what it covers and how the current round is going. */
export default function SchedulesList() {
  const router = useRouter();
  const { check } = usePermissions();
  const canCreate = check({ allPermissions: ["ROUNDS:CREATE"] });
  const { data: schedules = [], isLoading, isError } = useGetSchedulesQuery();
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<"all" | Schedule["status"]>("all");

  if (isLoading) return <Loading01 />;
  const shown = schedules.filter((s) => filter === "all" || s.status === filter);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary">Inspection schedules</h1>
          <p className="text-sm text-slate-500">Which checklist is filled for which licenses, how often, and how long teams have. Each round gives every license a task for its team.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SectorFilter />
          {canCreate && (
            <Button onClick={() => setCreating(true)} className="gap-2">
              <Plus className="h-4 w-4" /> New schedule
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {(["all", "active", "paused", "ended"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`h-8 rounded-full border px-3 text-xs font-medium capitalize ${filter === f ? "border-primary bg-primary text-white" : "border-slate-300 text-slate-600 hover:border-primary"}`}
          >
            {f} {f === "all" ? `(${schedules.length})` : `(${schedules.filter((s) => s.status === f).length})`}
          </button>
        ))}
      </div>

      {isError ? (
        <p className="py-10 text-center text-red-600">Could not load schedules.</p>
      ) : shown.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 py-12 text-center text-sm text-slate-500">
          <CalendarClock className="mx-auto mb-2 h-8 w-8 text-slate-300" />
          {schedules.length ? "No schedules here." : "No schedules yet. Create one to start giving teams their inspection tasks."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Schedule</th>
                <th className="px-4 py-2 font-medium">How often</th>
                <th className="px-4 py-2 font-medium">Licenses</th>
                <th className="px-4 py-2 font-medium">Current round</th>
                <th className="px-4 py-2 font-medium">Next</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {shown.map((s) => {
                const c = s.current;
                const pct = c && c.total ? Math.round((c.submitted / c.total) * 100) : 0;
                return (
                  <tr key={s.schedule_id} className="cursor-pointer hover:bg-slate-50" onClick={() => router.push(`/schedules/${s.schedule_id}`)}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-primary">{s.name}</p>
                      <p className="text-xs text-slate-500">{s.form?.name}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {describeFrequency(s)}
                      <span className="block text-xs text-slate-500">{describeDue(s.due_days)}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {s.license_count}
                      <span className="block text-xs text-slate-500">{describeTarget(s)}</span>
                    </td>
                    <td className="px-4 py-3">
                      {c ? (
                        <div className="w-40 space-y-1">
                          <p className="text-xs text-slate-600">
                            {formatCalendarDate(c.occurrence_date)}: <strong>{c.submitted}</strong> / {c.total} submitted
                          </p>
                          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                            <div className="h-full bg-green-600" style={{ width: `${pct}%` }} />
                          </div>
                          {c.overdue > 0 && <p className="text-xs font-medium text-red-600">{c.overdue} overdue</p>}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">No tasks yet</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{s.next_dates[0] ? formatCalendarDate(s.next_dates[0]) : "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_CHIP[s.status]}`}>{s.status}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {creating && <ScheduleFormDialog onClose={() => setCreating(false)} onSaved={(id) => router.push(`/schedules/${id}`)} />}
    </div>
  );
}
