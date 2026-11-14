"use client";

/**
 * The director's dashboard: one set of filters for everything below it.
 *   Workload  — tasks whose round opened in the period: due, submitted, overdue
 *   Results   — inspections submitted in the period: on time, scores, answers, regions, companies
 *   Map       — where they were submitted
 * Central users looking at all sectors also get the headline numbers per sector.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useDispatch } from "react-redux";
import { baseApi } from "@/redux/baseApi";
import { setSelectedSectorId } from "@/lib/sectorSelection";
import { localizedName } from "@/utils/localizedName";
import { AlertTriangle, ArrowDown, ArrowUp, MapPin, Minus, Table2 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Loading01 from "@/features/template/component/Loading/Loading01";
import { useGetAnalyticsQuery, Analytics, MapFilters } from "@/redux/api/dashboardApi";
import { formatCalendarDate } from "@/utils/date";
import { DashboardFilterBar, useDashboardFilters } from "./DashboardFilters";

// Colours by job: one blue for amounts; two categories (on time / late); fixed status colours for answers
const BLUE = "#2a78d6";
const GRID = "#e2e8f0";
const AXIS = { fontSize: 12, fill: "#64748b" };

const pct = (x: number | null | undefined, digits = 0) => (x == null ? "—" : `${(x * 100).toFixed(digits)}%`);
const ratio = (a: number, b: number) => (b ? a / b : null);
const shortDay = (d: string) => formatCalendarDate(d).replace(/, \d{4}$/, "");

const selectClass = "h-9 min-w-0 rounded-md border border-input bg-white px-2 text-sm";

/** Link to the inspections list with the dashboard's filters plus `extra` (later keys win). */
const listLink = (base: MapFilters, extra: Record<string, string | undefined>) => {
  const q = new URLSearchParams({ from_dashboard: "1" });
  for (const [k, v] of Object.entries({ ...base, ...extra })) if (v != null && v !== "" && typeof v !== "number") q.set(k, String(v));
  return `/inspections?${q.toString()}`;
};

export default function DirectorDashboard() {
  const filters = useDashboardFilters();
  const { base } = filters;
  const { data, isLoading, isFetching, isError } = useGetAnalyticsQuery(base);

  return (
    <div className="space-y-4">
      <DashboardFilterBar state={filters} busy={isFetching && !isLoading} />

      {isLoading ? (
        <Loading01 />
      ) : isError || !data ? (
        <p className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">Could not load the dashboard.</p>
      ) : (
        <Body data={data} base={base} />
      )}

      <Link
        href="/submission-map"
        className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600">
          <MapPin className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-slate-900">Submission map</span>
          <span className="block text-sm text-slate-500">Where each inspection was submitted: inspector, place, device and time.</span>
        </span>
        <span className="text-sm font-medium text-primary">Open →</span>
      </Link>
    </div>
  );
}

function Body({ data, base }: { data: Analytics; base: MapFilters }) {
  const router = useRouter();
  const go = (extra: Record<string, string | undefined>) => listLink(base, extra);
  const w = data.workload;
  const r = data.results;
  const p = data.previous;
  const prevLabel = data.period.previous ? `vs ${shortDay(data.period.previous.from)} – ${shortDay(data.period.previous.to)}` : null;

  return (
    <>
      {/* Headline numbers */}
      <section aria-label="Headline numbers" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Completed" value={pct(ratio(w.submitted, w.due))} note={`${w.submitted} of ${w.due} submitted`} bar={ratio(w.submitted, w.due)} href={go({ status: "submitted", date_field: "assigned" })} />
        <Kpi label="Overdue now" value={w.overdue} note={w.overdue ? "past due, not submitted" : "none"} alert={w.overdue > 0} href={go({ status: "overdue", date_field: "assigned" })} />
        <Kpi label="Submitted" value={r.submitted} note={prevLabel ?? "in the period"} delta={p ? r.submitted - p.submitted : undefined} href={go({ status: "submitted" })} />
        <Kpi label="On time" value={pct(ratio(r.on_time, r.submitted))} note={`${r.late} late — see them`} delta={p ? pctDelta(ratio(r.on_time, r.submitted), ratio(p.on_time, p.submitted)) : undefined} unit="pts" href={go({ status: "late" })} />
        <Kpi label="Companies inspected" value={r.companies} note={`${r.licenses} license${r.licenses === 1 ? "" : "s"}`} href={go({ status: "submitted" })} />
        <Kpi label="Returned for correction" value={r.returned} note={r.no_location ? `${r.no_location} without location` : "of submitted"} href={go({ status: "returned" })} />
      </section>

      {/* Central users, all sectors: the same numbers per sector */}
      {data.by_sector && <BySector rows={data.by_sector} />}

      {/* Over time */}
      <div className="grid gap-4">
        <ChartCard
          title="Inspections submitted per day"
          subtitle={`${data.daily.reduce((n, x) => n + x.submitted, 0)} submitted over ${data.daily.length} day${data.daily.length === 1 ? "" : "s"} · click a day to see its inspections`}
          table={{ head: ["Day", "Submitted", "On time", "Late"], rows: data.daily.filter((x) => x.submitted).map((x) => [formatCalendarDate(x.day), x.submitted, x.on_time, x.late]) }}
          empty={!data.daily.some((x) => x.submitted)}
        >
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={data.daily.map((x) => ({ ...x, label: shortDay(x.day) }))}
              margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
              onClick={(e: any) => {
                const d = e?.activePayload?.[0]?.payload;
                if (d?.submitted) router.push(go({ status: "submitted", from: d.day, to: d.day }));
              }}
              style={{ cursor: "pointer" }}
            >
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} interval="preserveStartEnd" minTickGap={18} />
              <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
              <Tooltip cursor={{ fill: "rgba(148,163,184,0.12)" }} content={<DayTip />} />
              <Bar dataKey="submitted" name="Submitted" fill={BLUE} radius={[4, 4, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

      </div>

      {/* Teams and companies */}
      <div className="grid gap-4">
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white" aria-labelledby="teams-title">
          <div className="p-4 pb-2">
            <h2 id="teams-title" className="font-semibold text-slate-900">
              Team performance
            </h2>
            <p className="text-xs text-slate-500">Assigned and overdue: tasks given to the team in the period. On time: inspections the team submitted in the period.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Team</th>
                  <th className="px-3 py-2 text-right font-medium">Assigned</th>
                  <th className="px-3 py-2 font-medium">Completed</th>
                  <th className="px-3 py-2 text-right font-medium">Overdue</th>
                  <th className="px-3 py-2 text-right font-medium">On time</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.teams.map((t) => {
                  const done = ratio(t.submitted, t.due);
                  return (
                    <tr key={t.team_id ?? "none"}>
                      <td className="px-4 py-2 font-medium">
                        {t.team_id ? (
                          <Link href={go({ team_id: t.team_id, date_field: "assigned" })} className="text-primary hover:underline">
                            {t.team}
                          </Link>
                        ) : (
                          <Link href={go({ status: "no_team", date_field: "assigned" })} className="text-amber-700 hover:underline">
                            {t.team}
                          </Link>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{t.due}</td>
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-2">
                          <span className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                            <span className="block h-full rounded-full" style={{ width: `${(done ?? 0) * 100}%`, background: BLUE }} />
                          </span>
                          <span className="tabular-nums">{pct(done)}</span>
                        </span>
                      </td>
                      <td className={`px-3 py-2 text-right tabular-nums ${t.overdue ? "font-semibold text-red-700" : ""}`}>
                        {t.overdue && t.team_id ? (
                          <Link href={go({ team_id: t.team_id, status: "overdue", date_field: "assigned" })} className="hover:underline">
                            {t.overdue}
                          </Link>
                        ) : (
                          t.overdue
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{pct(ratio(t.on_time, t.submitted_in_period))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!data.teams.length && <p className="py-6 text-center text-sm text-slate-500">No tasks in this period.</p>}
          </div>
        </section>

      </div>
    </>
  );
}

/** Headline numbers per sector (central users looking at every sector). Clicking a sector switches to it. */
function BySector({ rows }: { rows: NonNullable<Analytics["by_sector"]> }) {
  const locale = useLocale();
  const dispatch = useDispatch();
  const open = (id: string) => {
    setSelectedSectorId(id);
    dispatch(baseApi.util.resetApiState());
  };
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white" aria-labelledby="sectors-title">
      <div className="p-4 pb-2">
        <h2 id="sectors-title" className="font-semibold text-slate-900">
          By sector
        </h2>
        <p className="text-xs text-slate-500">Same period and filters. Choose a sector to see only its numbers.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Sector</th>
              <th className="px-3 py-2 text-right font-medium">Due</th>
              <th className="px-3 py-2 text-right font-medium">Completed</th>
              <th className="px-3 py-2 text-right font-medium">Overdue</th>
              <th className="px-3 py-2 text-right font-medium">Submitted</th>
              <th className="px-3 py-2 text-right font-medium">On time</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((s) => (
              <tr key={s.sector_node_id}>
                <td className="px-4 py-2">
                  <button type="button" onClick={() => open(s.sector_node_id)} className="font-medium text-primary hover:underline">
                    {localizedName({ name: s.sector, name_am: s.sector_am }, locale)}
                  </button>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{s.due}</td>
                <td className="px-3 py-2 text-right tabular-nums">{pct(ratio(s.completed, s.due))}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${s.overdue ? "font-semibold text-red-700" : ""}`}>{s.overdue}</td>
                <td className="px-3 py-2 text-right tabular-nums">{s.submitted}</td>
                <td className="px-3 py-2 text-right tabular-nums">{pct(ratio(s.submitted - s.late, s.submitted))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Difference in percentage points between two ratios. */
const pctDelta = (a: number | null, b: number | null) => (a == null || b == null ? undefined : Math.round((a - b) * 100));

function Kpi({ label, value, note, delta, unit, bar, alert, href }: { label: string; value: string | number; note?: string; delta?: number; unit?: string; bar?: number | null; alert?: boolean; href?: string }) {
  const Wrap = ({ children }: { children: React.ReactNode }) =>
    href ? (
      <Link href={href} className={`group block rounded-xl border bg-white p-4 transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary ${alert ? "border-red-200" : "border-slate-200"}`} aria-label={`${label}: ${value}. Open the list`}>
        {children}
      </Link>
    ) : (
      <div className={`rounded-xl border bg-white p-4 ${alert ? "border-red-200" : "border-slate-200"}`}>{children}</div>
    );
  return (
    <Wrap>
      <p className="flex items-center gap-1 text-xs text-slate-500">
        {alert && <AlertTriangle className="h-3.5 w-3.5 text-red-600" aria-hidden />}
        {label}
      </p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${alert ? "text-red-700" : "text-slate-900"}`}>{value}</p>
      {bar != null && (
        <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
          <span className="block h-full rounded-full" style={{ width: `${bar * 100}%`, background: BLUE }} />
        </span>
      )}
      {delta !== undefined && (
        <p className="mt-1 flex items-center gap-0.5 text-xs font-medium text-slate-700">
          {delta > 0 ? <ArrowUp className="h-3.5 w-3.5" aria-label="up" /> : delta < 0 ? <ArrowDown className="h-3.5 w-3.5" aria-label="down" /> : <Minus className="h-3.5 w-3.5" aria-label="same" />}
          {delta > 0 ? "+" : ""}
          {delta}
          {unit ? ` ${unit}` : ""}
        </p>
      )}
      {note && <p className="mt-0.5 text-xs text-slate-500">{note}</p>}
      {href && <p className="mt-1 text-xs font-medium text-primary opacity-70 group-hover:opacity-100">View list →</p>}
    </Wrap>
  );
}

/** A chart with a "Table" switch showing the same numbers. */
/** Hover on a day: the date, how many were submitted, on time / late. */
function DayTip({ active, payload }: { active?: boolean; payload?: { payload: Analytics["daily"][number] }[] }) {
  const d = active ? payload?.[0]?.payload : undefined;
  if (!d) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-semibold text-slate-900">{formatCalendarDate(d.day)}</p>
      <p className="mt-0.5 text-slate-700">
        <span className="font-semibold">{d.submitted}</span> submitted
      </p>
      {d.submitted > 0 && (
        <p className="text-slate-500">
          {d.on_time} on time · {d.late} late
        </p>
      )}
    </div>
  );
}

function ChartCard({ title, subtitle, children, table, empty }: { title: string; subtitle?: string; children: React.ReactNode; table: { head: string[]; rows: (string | number)[][] }; empty?: boolean }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-2 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-slate-900">{title}</h2>
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        </div>
        {!empty && (
          <button type="button" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-100">
            <Table2 className="h-3.5 w-3.5" /> {asTable ? "Chart" : "Table"}
          </button>
        )}
      </div>
      {empty ? (
        <p className="py-16 text-center text-sm text-slate-500">No submissions in this period.</p>
      ) : asTable ? (
        <div className="max-h-[260px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white text-left text-xs text-slate-500">
              <tr>
                {table.head.map((h, i) => (
                  <th key={h} className={`py-1.5 pr-3 font-medium ${i ? "text-right" : ""}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {table.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j} className={`py-1.5 pr-3 tabular-nums ${j ? "text-right" : ""}`}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </section>
  );
}
