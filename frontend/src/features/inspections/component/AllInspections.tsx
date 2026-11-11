"use client";

/**
 * All inspections (staff), with filters kept in the address — so the dashboard can link
 * straight to "overdue", "late", "returned", a region, a team, a week …
 */
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TaskListParams, TeamProgress, useGetTasksQuery, useGetTeamProgressQuery } from "@/redux/api/inspectionApi";
import type { TaskListItem } from "@/redux/types/inspection";
import { useGetSubmissionMapOptionsQuery } from "@/redux/api/dashboardApi";
import { formatCalendarDate, formatDateTime } from "@/utils/date";
import { TaskStatusBadge, dueText, scoreText, scoreTone } from "./taskUi";
import { SectorFilter } from "@/components/common/SectorFilter";

const STATUSES: [NonNullable<TaskListParams["status"]> | "", string][] = [
  ["", "All"],
  ["open", "Not submitted"],
  ["todo", "Not started"],
  ["in_progress", "In progress"],
  ["overdue", "Overdue"],
  ["submitted", "Submitted"],
  ["on_time", "On time"],
  ["late", "Late"],
  ["returned", "Returned for correction"],
];
const KEYS = ["status", "team_id", "submitted_by", "form_id", "schedule_id", "company_id", "region_id", "license_type", "from", "to", "date_field", "sort", "search"] as const;
type Key = (typeof KEYS)[number];
const selectClass = "h-9 min-w-0 rounded-md border border-input bg-white px-2 text-sm";

export default function AllInspections() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const { data: options } = useGetSubmissionMapOptionsQuery();

  const filters = useMemo(() => Object.fromEntries(KEYS.map((k) => [k, sp.get(k) || undefined]).filter(([, v]) => v)) as Partial<Record<Key, string>>, [sp]);
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const [search, setSearch] = useState(filters.search ?? "");

  const setParam = (patch: Partial<Record<Key | "page", string | undefined>>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!("page" in patch)) next.delete("page");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };
  useEffect(() => {
    const t = setTimeout(() => {
      if ((filters.search ?? "") !== search.trim()) setParam({ search: search.trim() || undefined });
    }, 350);
    return () => clearTimeout(t);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data, isFetching, isError } = useGetTasksQuery({ ...(filters as TaskListParams), page, limit: 50 });
  // Every team's progress under the same filters (not team or status)
  const progressFilters = Object.fromEntries(Object.entries(filters).filter(([k]) => k !== "team_id" && k !== "status")) as Omit<TaskListParams, "team_id" | "status">;
  const { data: teams } = useGetTeamProgressQuery(progressFilters);
  const meta = data?.meta;
  const filterCount = KEYS.filter((k) => k !== "status" && k !== "search" && k !== "date_field" && k !== "sort" && filters[k]).length;

  const Select = ({ k, label, list }: { k: Key; label: string; list?: { id: string; name: string }[] }) =>
    list && list.length ? (
      <select aria-label={label} className={`${selectClass} ${filters[k] ? "border-primary text-primary" : ""}`} value={filters[k] ?? ""} onChange={(e) => setParam({ [k]: e.target.value || undefined })}>
        <option value="">{label}: all</option>
        {list.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    ) : null;

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        {sp.get("from_dashboard") && (
          <Button variant="outline" size="icon" aria-label="Back to the dashboard" onClick={() => router.push("/dashboard")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-primary">Inspections</h1>
          <p className="text-sm text-slate-500">Every inspection task and its result. Open one to see its answers, photos, location and history.</p>
        </div>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Status">
        {STATUSES.map(([k, label]) => (
          <button
            key={k || "all"}
            type="button"
            role="tab"
            aria-selected={(filters.status ?? "") === k}
            onClick={() => setParam({ status: k || undefined })}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${(filters.status ?? "") === k ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-56">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input aria-label="Search company or license" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Company or license number" className="h-9 bg-white pl-9" />
        </div>
        <SectorFilter />
        <Select k="region_id" label="Region" list={options?.regions} />
        <Select k="team_id" label="Team" list={options?.teams} />
        <Select k="submitted_by" label="Inspector" list={options?.inspectors} />
        <Select k="form_id" label="Checklist" list={options?.forms} />
        <Select k="schedule_id" label="Schedule" list={options?.schedules} />
        <Select k="company_id" label="Company" list={options?.companies} />
        <select aria-label="License type" className={`${selectClass} ${filters.license_type ? "border-primary text-primary" : ""}`} value={filters.license_type ?? ""} onChange={(e) => setParam({ license_type: e.target.value || undefined })}>
          <option value="">License type: all</option>
          <option value="mining">Mining</option>
          <option value="exploration">Exploration</option>
        </select>
        <input type="date" aria-label="From" className={selectClass} value={filters.from ?? ""} onChange={(e) => setParam({ from: e.target.value || undefined })} />
        <input type="date" aria-label="To" className={selectClass} value={filters.to ?? ""} onChange={(e) => setParam({ to: e.target.value || undefined })} />
        <select aria-label="Dates are" className={selectClass} value={filters.date_field ?? "submitted"} onChange={(e) => setParam({ date_field: e.target.value === "assigned" ? "assigned" : undefined })}>
          <option value="submitted">Dates: submitted on</option>
          <option value="assigned">Dates: round started on</option>
        </select>
        {(filterCount > 0 || filters.status || filters.search) && (
          <button
            type="button"
            className="flex items-center gap-1 text-sm text-primary hover:underline"
            onClick={() => {
              setSearch("");
              router.replace(pathname, { scroll: false });
            }}
          >
            <X className="h-4 w-4" /> Clear
          </button>
        )}
      </div>

      {teams && teams.length > 0 && (
        <TeamProgressStrip
          teams={teams}
          teamId={filters.team_id}
          noTeam={filters.status === "no_team"}
          onPick={(t) =>
            !t.team_id
              ? setParam({ team_id: undefined, status: filters.status === "no_team" ? undefined : "no_team" })
              : setParam({ team_id: filters.team_id === t.team_id ? undefined : t.team_id, ...(filters.status === "no_team" ? { status: undefined } : {}) })
          }
        />
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[1020px] text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Company / license</th>
              <th className="px-3 py-2 font-medium">Checklist</th>
              <th className="px-3 py-2 font-medium">Team</th>
              <th className="px-3 py-2 font-medium">Round · due</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Progress</th>
              <th className="px-3 py-2 font-medium">Submitted</th>
              <th className="px-4 py-2 text-right font-medium">Score</th>
            </tr>
          </thead>
          <tbody className={`divide-y ${isFetching ? "opacity-60" : ""}`}>
            {(data?.data ?? []).map((t) => (
              <tr key={t.inspection_id} className="cursor-pointer hover:bg-slate-50" onClick={() => router.push(`/inspections/${t.inspection_id}`)}>
                <td className="px-4 py-2">
                  <Link href={`/inspections/${t.inspection_id}`} className="font-medium text-slate-900 hover:text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
                    {t.company?.name}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {t.license?.license_number} · {t.license?.license_type}
                  </p>
                </td>
                <td className="px-3 py-2 text-slate-700">
                  {t.form?.name}
                  {t.schedule && <p className="text-xs text-slate-500">{t.schedule.name}</p>}
                </td>
                <td className="px-3 py-2 text-slate-700">{t.team?.name ?? <span className="font-medium text-amber-700">No team</span>}</td>
                <td className="px-3 py-2 text-xs text-slate-600">
                  {formatCalendarDate(t.occurrence_date)}
                  <span className="block text-slate-500">due {dueText(t.due_at)}</span>
                </td>
                <td className="px-3 py-2">
                  <TaskStatusBadge task={t} />
                </td>
                <td className="px-3 py-2">
                  <TaskProgress task={t} />
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
                <td className={`px-4 py-2 text-right font-semibold tabular-nums ${scoreTone(t.score)}`}>{t.status === "submitted" ? scoreText(t.score) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {isError && <p className="py-8 text-center text-sm text-red-600">Could not load inspections.</p>}
        {data && !data.data.length && <p className="py-10 text-center text-sm text-slate-500">No inspections match.</p>}
      </div>

      {meta && meta.totalItems > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
          <span>
            {(page - 1) * meta.itemsPerPage + 1}–{Math.min(page * meta.itemsPerPage, meta.totalItems)} of {meta.totalItems.toLocaleString()}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setParam({ page: String(page - 1) })}>
              <ChevronLeft className="h-4 w-4" /> Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= meta.totalPages} onClick={() => setParam({ page: String(page + 1) })}>
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** How much of a task is answered: a bar and "12 / 40" while open. */
function TaskProgress({ task: t }: { task: TaskListItem }) {
  if (t.status === "submitted") return <span className="text-xs font-medium text-green-700">Complete</span>;
  if (t.status === "todo" || !t.progress) return <span className="text-xs text-slate-400">Not started</span>;
  const { answered, total } = t.progress;
  const pct = total ? Math.round((answered / total) * 100) : 0;
  return (
    <div className="w-28" title={`${answered} of ${total} questions answered`}>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-amber-500" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-slate-600">
        {answered} / {total} · {pct}%
      </span>
    </div>
  );
}

/** One card per team: submitted of all its tasks, with in progress / not started / overdue. A tap filters the list to it. */
function TeamProgressStrip({ teams, teamId, noTeam, onPick }: { teams: TeamProgress[]; teamId?: string; noTeam: boolean; onPick: (t: TeamProgress) => void }) {
  return (
    <section aria-label="Progress by team" className="space-y-1.5">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Progress by team</h2>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {teams.map((t) => {
          const on = t.team_id ? teamId === t.team_id : noTeam;
          const pct = (n: number) => `${t.total ? (n / t.total) * 100 : 0}%`;
          return (
            <button
              key={t.team_id ?? "none"}
              type="button"
              aria-pressed={on}
              onClick={() => onPick(t)}
              className={`w-48 shrink-0 space-y-1.5 rounded-xl border bg-white p-3 text-left transition-colors ${on ? "border-primary ring-2 ring-primary/20" : "border-slate-200 hover:border-primary"}`}
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className={`truncate text-sm font-semibold ${t.team_id ? "text-slate-900" : "text-amber-700"}`}>{t.name}</span>
                <span className="shrink-0 text-xs tabular-nums text-slate-500">
                  {t.submitted}/{t.total}
                </span>
              </span>
              <span className="flex h-1.5 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
                <span className="h-full bg-primary" style={{ width: pct(t.submitted) }} />
                <span className="h-full bg-amber-500" style={{ width: pct(t.in_progress) }} />
              </span>
              <span className="block text-[11px] leading-snug text-slate-500">
                {t.submitted} submitted · {t.in_progress} in progress · {t.todo} not started
                {t.overdue > 0 && <span className="font-semibold text-red-600"> · {t.overdue} overdue</span>}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
