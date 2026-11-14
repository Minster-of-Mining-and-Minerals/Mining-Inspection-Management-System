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
import { TaskStatusBadge, dueText } from "./taskUi";
import { ExportMenu, FilterBar, FilterKey, FilterSheetButton } from "./InspectionFilters";
import { SectorFilter } from "@/components/common/SectorFilter";

const STATUSES: [NonNullable<TaskListParams["status"]> | "", string][] = [
  // All, Submitted and In progress first, then the others
  ["", "All"],
  ["submitted", "Submitted"],
  ["in_progress", "In progress"],
  ["open", "Not submitted"],
  ["todo", "Not started"],
  ["overdue", "Overdue"],
  ["on_time", "On time"],
  ["late", "Late"],
  ["returned", "Returned for correction"],
];
const KEYS = ["status", "team_id", "submitted_by", "form_id", "schedule_id", "company_id", "region_id", "license_type", "from", "to", "date_field", "sort", "search"] as const;
type Key = (typeof KEYS)[number];
const FILTER_KEYS: FilterKey[] = ["region_id", "team_id", "submitted_by", "company_id", "license_type", "form_id", "schedule_id", "date_field", "from", "to"];

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

  const filterValues = Object.fromEntries(FILTER_KEYS.map((k) => [k, filters[k]])) as Partial<Record<FilterKey, string>>;
  const clearFilters = () => {
    setSearch("");
    router.replace(pathname, { scroll: false });
  };
  // What the export takes: the page's filters (not the page number)
  const exportQuery = Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) as Record<string, string>;

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
        <SectorFilter className="hidden h-10 lg:block" />
        <ExportMenu query={exportQuery} />
      </div>

      <div className="min-w-0 space-y-4">
          {/* Search, and on a phone the Filters sheet */}
          <div className="flex gap-2.5">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3.5 z-10 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <Input aria-label="Search company or license" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Company or license number" className="h-11 rounded-lg bg-white pl-11 text-[15px]" />
            </div>
            <FilterSheetButton values={filterValues} options={options} onChange={(p) => setParam(p)} onClear={clearFilters} />
          </div>

          <FilterBar values={filterValues} options={options} onChange={(p) => setParam(p)} onClear={clearFilters} />

          {/* Status: pills on a phone, underlined tabs on a computer */}
          <nav aria-label="Status" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:mx-0 lg:gap-1 lg:border-b lg:border-slate-200 lg:px-0 lg:pb-0">
            {STATUSES.map(([k, label]) => {
              const on = (filters.status ?? "") === k;
              return (
                <button
                  key={k || "all"}
                  type="button"
                  aria-current={on ? "page" : undefined}
                  onClick={() => setParam({ status: k || undefined })}
                  className={`shrink-0 whitespace-nowrap text-sm font-semibold transition-colors
                    h-9 rounded-full border px-3.5 lg:h-auto lg:rounded-none lg:border-0 lg:border-b-[3px] lg:px-4 lg:py-2.5
                    ${on ? "border-primary bg-primary text-white lg:border-golden-bright lg:bg-transparent lg:text-primary" : "border-slate-300 bg-white text-slate-600 hover:text-primary lg:border-transparent lg:bg-transparent"}`}
                >
                  {label}
                </button>
              );
            })}
          </nav>

          {(filterCount > 0 || filters.status || filters.search) && (
            <button type="button" className={`flex items-center gap-1 text-sm text-primary hover:underline ${filters.status || filters.search ? "" : "lg:hidden"}`} onClick={clearFilters}>
              <X className="h-4 w-4" /> Clear all filters
            </button>
          )}

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
