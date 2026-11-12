"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, Edit, Pause, Play, Search, Square, Trash2, UserCog } from "lucide-react";
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
import Loading01 from "@/features/template/component/Loading/Loading01";
import { usePermissions } from "@/hooks/usePermissions";
import { useGetTeamsQuery } from "@/redux/api/teamApi";
import {
  TaskListParams,
  useDeleteScheduleMutation,
  useGetScheduleByIdQuery,
  useGetTasksQuery,
  useUpdateScheduleMutation,
  useUpdateTaskAssignmentMutation,
} from "@/redux/api/inspectionApi";
import type { TaskListItem } from "@/redux/types/inspection";
import { formatCalendarDate, formatDateTime } from "@/utils/date";
import { ScheduleFormDialog } from "./ScheduleFormDialog";
import { TaskStatusBadge, describeDue, describeFrequency, describeTarget, dueText } from "./taskUi";

type StatusFilter = NonNullable<TaskListParams["status"]> | "all";
const FILTERS: [StatusFilter, string][] = [
  ["all", "All"],
  ["open", "Not submitted"],
  ["overdue", "Overdue"],
  ["submitted", "Submitted"],
  ["late", "Late"],
  ["no_team", "No team"],
];

/** Last allowed day (date input) ↔ due time (midnight after it, Ethiopia time). */
const dueToDay = (dueAt: string) => new Date(new Date(dueAt).getTime() - 1 + 3 * 3600e3).toISOString().slice(0, 10);
const dayToDue = (day: string) => new Date(Date.parse(`${day}T00:00:00+03:00`) + 86400e3).toISOString();

export default function ScheduleDetail() {
  const { scheduleId } = useParams<{ scheduleId: string }>();
  const router = useRouter();
  const { check } = usePermissions();
  const canUpdate = check({ allPermissions: ["ROUNDS:UPDATE"] });
  const canDelete = check({ allPermissions: ["ROUNDS:DELETE"] });
  const canAssign = check({ allPermissions: ["INSPECTIONS:ASSIGN"] });

  const { data: s, isLoading, isError } = useGetScheduleByIdQuery(scheduleId, { skip: !scheduleId });
  const [updateSchedule, { isLoading: updating }] = useUpdateScheduleMutation();
  const [deleteSchedule] = useDeleteScheduleMutation();
  const [editing, setEditing] = useState(false);
  const [round, setRound] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [assigning, setAssigning] = useState<TaskListItem | null>(null);

  const occurrence = round ?? s?.occurrences[0]?.occurrence_date ?? null;
  const { data: tasks, isFetching } = useGetTasksQuery(
    { schedule_id: scheduleId, occurrence_date: occurrence ?? undefined, status: status === "all" ? undefined : status, search: search.trim() || undefined, limit: 200 },
    { skip: !occurrence },
  );

  if (isLoading) return <Loading01 />;
  if (isError || !s) return <div className="p-8 text-center text-red-600">Schedule not found.</div>;

  const setStatusTo = async (next: "active" | "paused" | "ended") => {
    if (next === "ended" && !window.confirm("End this schedule? No new tasks will be created. Open tasks stay and can still be submitted.")) return;
    try {
      const r = await updateSchedule({ id: s.schedule_id, data: { status: next } }).unwrap();
      toast.success(next === "paused" ? "Paused: no new tasks until you resume it." : next === "ended" ? "Schedule ended." : r.message || "Resumed.");
    } catch (e: any) {
      toast.error(e?.data?.message || "Could not change the schedule.");
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete “${s.name}”? Its tasks that nobody started are deleted too.`)) return;
    try {
      await deleteSchedule(s.schedule_id).unwrap();
      toast.success("Schedule deleted.");
      router.push("/schedules");
    } catch (e: any) {
      toast.error(e?.data?.message || "Could not delete the schedule.");
    }
  };

  const current = s.occurrences.find((o) => o.occurrence_date === occurrence);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start gap-3">
        <Button variant="outline" size="icon" onClick={() => router.push("/schedules")} aria-label="Back to schedules">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-primary">{s.name}</h1>
          <p className="text-sm text-slate-600">
            <button type="button" className="font-medium text-primary hover:underline" onClick={() => router.push(`/forms/${s.form_id}`)}>
              {s.form?.name}
            </button>{" "}
            · {describeFrequency(s)} · {describeDue(s.due_days)} · {describeTarget(s)} ({s.license_count})
          </p>
          <p className="text-xs text-slate-500">
            From {formatCalendarDate(String(s.start_date))}
            {s.end_date ? ` to ${formatCalendarDate(String(s.end_date))}` : ""} ·{" "}
            <span className={s.status === "active" ? "font-medium text-green-700" : s.status === "paused" ? "font-medium text-amber-700" : ""}>{s.status}</span>
            {s.next_dates[0] && s.status === "active" && ` · next round ${formatCalendarDate(s.next_dates[0])}`}
          </p>
          {s.notes && <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{s.notes}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {canUpdate && s.status !== "ended" && (
            <Button variant="outline" className="gap-2" onClick={() => setEditing(true)}>
              <Edit className="h-4 w-4" /> Edit
            </Button>
          )}
          {canUpdate && s.status === "active" && (
            <Button variant="outline" className="gap-2" disabled={updating} onClick={() => setStatusTo("paused")}>
              <Pause className="h-4 w-4" /> Pause
            </Button>
          )}
          {canUpdate && s.status !== "active" && (
            <Button variant="outline" className="gap-2" disabled={updating} onClick={() => setStatusTo("active")}>
              <Play className="h-4 w-4" /> {s.status === "ended" ? "Restart" : "Resume"}
            </Button>
          )}
          {canUpdate && s.status !== "ended" && (
            <Button variant="outline" className="gap-2" disabled={updating} onClick={() => setStatusTo("ended")}>
              <Square className="h-4 w-4" /> End
            </Button>
          )}
          {canDelete && (
            <Button variant="outline" size="icon" aria-label="Delete schedule" onClick={remove}>
              <Trash2 className="h-4 w-4 text-red-500" />
            </Button>
          )}
        </div>
      </div>

      {s.licenses_without_team > 0 && (
        <p className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4" /> {s.licenses_without_team} covered license(s) have no team. Assign a team to the license (Companies) or to the task below.
        </p>
      )}

      {/* Totals */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Rounds so far", s.occurrence_count, "text-slate-900"],
          ["Tasks submitted", `${s.totals.submitted} / ${s.totals.total}`, "text-green-700"],
          ["Submitted late", s.totals.late, "text-amber-700"],
          ["Overdue now", s.totals.overdue, "text-red-700"],
        ].map(([label, value, tone]) => (
          <div key={label as string} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">{label}</p>
            <p className={`text-2xl font-bold ${tone}`}>{value}</p>
          </div>
        ))}
      </div>

      {s.occurrences.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 py-10 text-center text-sm text-slate-500">
          No tasks yet. {s.next_dates[0] ? `The first round opens on ${formatCalendarDate(s.next_dates[0])}.` : ""}
        </p>
      ) : (
        <div className="flex flex-wrap items-start gap-4">
          {/* Rounds */}
          <nav aria-label="Rounds" className="w-full space-y-1 rounded-xl border border-slate-200 bg-white p-2 lg:w-64">
            <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Rounds</p>
            <div className="max-h-[520px] space-y-1 overflow-y-auto">
              {s.occurrences.map((o) => (
                <button
                  key={o.occurrence_date}
                  type="button"
                  onClick={() => setRound(o.occurrence_date)}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm ${o.occurrence_date === occurrence ? "bg-primary/10 text-primary" : "hover:bg-slate-50"}`}
                >
                  <span className="font-medium">{formatCalendarDate(o.occurrence_date)}</span>
                  <span className="block text-xs text-slate-500">
                    {o.submitted}/{o.total} submitted
                    {o.overdue > 0 && <span className="text-red-600"> · {o.overdue} overdue</span>}
                    {o.late > 0 && <span className="text-amber-700"> · {o.late} late</span>}
                  </span>
                </button>
              ))}
            </div>
          </nav>

          {/* Tasks of the round */}
          <section className="min-w-0 flex-[999_1_560px] space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="mr-auto font-semibold text-slate-900">
                Round of {occurrence && formatCalendarDate(occurrence)}
                {current && <span className="ml-2 text-sm font-normal text-slate-500">due by end of {dueText(current.due_at)}</span>}
              </h2>
              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input aria-label="Search company or license" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Company or license number" className="pl-9" />
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              {FILTERS.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setStatus(key)}
                  className={`h-8 rounded-full border px-3 text-xs font-medium ${status === key ? "border-primary bg-primary text-white" : "border-slate-300 text-slate-600 hover:border-primary"}`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Company / license</th>
                    <th className="px-3 py-2 font-medium">Team</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Submitted</th>
                    {canAssign && <th className="px-3 py-2" />}
                  </tr>
                </thead>
                <tbody className={`divide-y ${isFetching ? "opacity-60" : ""}`}>
                  {(tasks?.data ?? []).map((t) => (
                    <tr key={t.inspection_id} className="cursor-pointer hover:bg-slate-50" onClick={() => router.push(`/inspections/${t.inspection_id}`)}>
                      <td className="px-3 py-2">
                        <p className="font-medium text-slate-900">{t.company?.name}</p>
                        <p className="text-xs text-slate-500">
                          {t.license?.license_number} · {t.license?.license_type}
                        </p>
                      </td>
                      <td className="px-3 py-2 text-slate-700">{t.team?.name ?? <span className="font-medium text-amber-700">No team</span>}</td>
                      <td className="px-3 py-2">
                        <TaskStatusBadge task={t} />
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-600">
                        {t.submitted_at ? (
                          <>
                            {formatDateTime(t.submitted_at)}
                            <span className="block text-slate-500">{t.submitter?.full_name}</span>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      {canAssign && (
                        <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                          {t.status !== "submitted" && (
                            <Button variant="ghost" size="sm" className="gap-1" onClick={() => setAssigning(t)}>
                              <UserCog className="h-4 w-4" /> Team / due
                            </Button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {tasks && tasks.data.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No tasks match.</p>}
              {tasks && tasks.meta.totalItems > tasks.data.length && (
                <p className="border-t px-3 py-2 text-xs text-slate-500">
                  Showing {tasks.data.length} of {tasks.meta.totalItems}. Use the search to find others.
                </p>
              )}
            </div>
          </section>
        </div>
      )}

      {editing && <ScheduleFormDialog schedule={s} onClose={() => setEditing(false)} />}
      {assigning && <AssignDialog task={assigning} onClose={() => setAssigning(null)} />}
    </div>
  );
}

/** Give one open task to another team and/or move its due date. */
function AssignDialog({ task, onClose }: { task: TaskListItem; onClose: () => void }) {
  const { data: teams } = useGetTeamsQuery({ is_active: true, limit: 200 });
  const [update, { isLoading }] = useUpdateTaskAssignmentMutation();
  const [teamId, setTeamId] = useState(task.team_id ?? "");
  const [day, setDay] = useState(dueToDay(task.due_at));

  const save = async () => {
    try {
      await update({ id: task.inspection_id, team_id: teamId || null, due_at: dayToDue(day) }).unwrap();
      toast.success("Saved.");
      onClose();
    } catch (e: any) {
      toast.error(e?.data?.message || "Could not save.");
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Team and due date</DialogTitle>
          <DialogDescription>
            {task.company?.name} · {task.license?.license_number}. Only this task changes; the license keeps its team for later rounds.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="as-team">Team</Label>
            <select id="as-team" className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              <option value="">No team</option>
              {(teams?.data ?? []).map((t) => (
                <option key={t.team_id} value={t.team_id}>
                  {t.name}
                </option>
              ))}
            </select>
            {task.status === "in_progress" && <p className="text-xs text-amber-700">This task has been started; the new team sees the answers saved so far.</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="as-due">Last day to submit</Label>
            <Input id="as-due" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
            <p className="text-xs text-slate-500">After this day the task shows as overdue; it can still be submitted, marked late.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={isLoading || !day}>
            {isLoading ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
