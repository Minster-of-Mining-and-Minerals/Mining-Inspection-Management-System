"use client";

/**
 * The director's dashboard: one set of filters for everything below it.
 *   Workload  — tasks whose round opened in the period: due, submitted, overdue
 *   Results   — inspections submitted in the period: on time, scores, answers, regions, companies
 *   Map       — where they were submitted
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowDown, ArrowUp, MapPin, Minus, Table2 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, LabelList, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Loading01 from "@/features/template/component/Loading/Loading01";
import { useGetAnalyticsQuery, Analytics, MapFilters } from "@/redux/api/dashboardApi";
import { formatCalendarDate } from "@/utils/date";
import { ScoreTrend } from "@/features/my-work/component/ScoreTrend";
import { DashboardFilterBar, useDashboardFilters } from "./DashboardFilters";

// Colours by job: one blue for amounts; two categories (on time / late); fixed status colours for answers
const BLUE = "#2a78d6";
const ORANGE = "#eb6834";
const STATUS = { met: "#0ca30c", partial: "#fab219", not_met: "#d03b3b", not_counted: "#8a94a4" };
const GRID = "#e2e8f0";
const AXIS = { fontSize: 12, fill: "#64748b" };

const pct = (x: number | null | undefined, digits = 0) => (x == null ? "—" : `${(x * 100).toFixed(digits)}%`);
const ratio = (a: number, b: number) => (b ? a / b : null);
const shortDay = (d: string) => formatCalendarDate(d).replace(/, \d{4}$/, "");

const selectClass = "h-9 min-w-0 rounded-md border border-input bg-white px-2 text-sm";
const weekEnd = (week: string) => new Date(Date.parse(`${week}T00:00:00Z`) + 6 * 86400e3).toISOString().slice(0, 10);

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
      <section aria-label="Headline numbers" className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Kpi label="Completed" value={pct(ratio(w.submitted, w.due))} note={`${w.submitted} of ${w.due} submitted`} bar={ratio(w.submitted, w.due)} href={go({ status: "submitted", date_field: "assigned" })} />
        <Kpi label="Overdue now" value={w.overdue} note={w.overdue ? "past due, not submitted" : "none"} alert={w.overdue > 0} href={go({ status: "overdue", date_field: "assigned" })} />
        <Kpi label="Submitted" value={r.submitted} note={prevLabel ?? "in the period"} delta={p ? r.submitted - p.submitted : undefined} href={go({ status: "submitted" })} />
        <Kpi label="On time" value={pct(ratio(r.on_time, r.submitted))} note={`${r.late} late — see them`} delta={p ? pctDelta(ratio(r.on_time, r.submitted), ratio(p.on_time, p.submitted)) : undefined} unit="pts" href={go({ status: "late" })} />
        <Kpi label="Average score" value={pct(r.avg_score)} note={prevLabel ?? "lowest scores first"} delta={p ? pctDelta(r.avg_score, p.avg_score) : undefined} unit="pts" href={go({ status: "submitted", sort: "score" })} />
        <Kpi label="Companies inspected" value={r.companies} note={`${r.licenses} license${r.licenses === 1 ? "" : "s"}`} href={go({ status: "submitted" })} />
        <Kpi label="Returned for correction" value={r.returned} note={r.no_location ? `${r.no_location} without location` : "of submitted"} href={go({ status: "returned" })} />
      </section>

      {/* Over time */}
      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          title="Inspections submitted per week"
          subtitle="On time and late, by week of submission · click a week to see its inspections"
          table={{ head: ["Week of", "On time", "Late", "Total"], rows: data.weekly.map((x) => [shortDay(x.week), x.on_time, x.late, x.on_time + x.late]) }}
          empty={!data.weekly.length}
        >
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={data.weekly.map((x) => ({ ...x, label: shortDay(x.week) }))}
              margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
              onClick={(e: any) => {
                const wk = e?.activePayload?.[0]?.payload?.week;
                if (wk) router.push(go({ status: "submitted", from: wk, to: weekEnd(wk) }));
              }}
              style={{ cursor: "pointer" }}
            >
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
              <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
              <Tooltip cursor={{ fill: "rgba(148,163,184,0.12)" }} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="on_time" name="On time" stackId="s" fill={BLUE} stroke="#fff" strokeWidth={2} maxBarSize={36} />
              <Bar dataKey="late" name="Late" stackId="s" fill={ORANGE} stroke="#fff" strokeWidth={2} radius={[4, 4, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Average score per week"
          subtitle="Of inspections submitted that week · click a week to see them"
          table={{ head: ["Week of", "Average score"], rows: data.weekly.map((x) => [shortDay(x.week), pct(x.avg_score)]) }}
          empty={!data.weekly.some((x) => x.avg_score != null)}
        >
          <ResponsiveContainer width="100%" height={260}>
            <LineChart
              data={data.weekly.map((x) => ({ week: x.week, label: shortDay(x.week), score: x.avg_score == null ? null : Math.round(x.avg_score * 1000) / 10 }))}
              margin={{ top: 8, right: 12, left: -12, bottom: 0 }}
              onClick={(e: any) => {
                const wk = e?.activePayload?.[0]?.payload?.week;
                if (wk) router.push(go({ status: "submitted", from: wk, to: weekEnd(wk), sort: "score" }));
              }}
              style={{ cursor: "pointer" }}
            >
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
              <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={AXIS} tickLine={false} axisLine={false} />
              <Tooltip formatter={(v: number) => [`${v}%`, "Average score"]} />
              <Line type="monotone" dataKey="score" name="Average score" stroke={BLUE} strokeWidth={2} dot={{ r: 4, fill: BLUE, stroke: "#fff", strokeWidth: 2 }} activeDot={{ r: 6 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Answers */}
      <AnswerMix data={data} />

      <div className="grid gap-4 xl:grid-cols-2">
        <ScoreBars
          title="Compliance by checklist section"
          subtitle="Points scored ÷ points possible, lowest first"
          rows={data.answers.sections.slice(0, 12).map((s) => ({ name: s.section, score: s.score, extra: `${s.answers} answers${new Set(data.answers.sections.map((x) => x.form)).size > 1 ? ` · ${s.form}` : ""}` }))}
        />
        <ScoreBars
          title="Average score by region"
          subtitle="Lowest first · click a region to see its inspections"
          rows={data.by_region.filter((x) => x.avg_score != null).map((x) => ({ name: x.region, score: x.avg_score!, extra: `${x.submitted} inspection${x.submitted === 1 ? "" : "s"}`, href: x.region_id ? go({ status: "submitted", region_id: x.region_id, sort: "score" }) : undefined }))}
        />
      </div>

      {/* Most frequent problems */}
      <section className="rounded-xl border border-slate-200 bg-white p-4" aria-labelledby="notmet-title">
        <h2 id="notmet-title" className="font-semibold text-slate-900">
          Most frequent “Not met”
        </h2>
        <p className="text-xs text-slate-500">Checklist questions answered with the lowest score most often.</p>
        {data.answers.top_not_met.length ? (
          <ol className="mt-3 divide-y">
            {data.answers.top_not_met.map((x, i) => (
              <li key={`${x.form}|${x.question}`} className="grid grid-cols-[1.5rem_1fr_auto] items-center gap-3 py-2 text-sm">
                <span className="text-right text-slate-400">{i + 1}.</span>
                <span className="min-w-0">
                  <span lang="am" className="block text-slate-900">
                    {x.question}
                  </span>
                  <span className="text-xs text-slate-500">{x.section}</span>
                </span>
                <span className="w-36 text-right">
                  <span className="block font-semibold text-slate-900">
                    {x.not_met} <span className="font-normal text-slate-500">of {x.answered}</span>
                  </span>
                  <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`${pct(x.rate)} not met`}>
                    <span className="block h-full rounded-full" style={{ width: `${x.rate * 100}%`, background: STATUS.not_met }} />
                  </span>
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="py-6 text-center text-sm text-slate-500">No “Not met” answers in this period.</p>
        )}
      </section>

      {/* Teams and companies */}
      <div className="grid gap-4 2xl:grid-cols-2">
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white" aria-labelledby="teams-title">
          <div className="p-4 pb-2">
            <h2 id="teams-title" className="font-semibold text-slate-900">
              Team performance
            </h2>
            <p className="text-xs text-slate-500">Assigned and overdue: tasks given to the team in the period. On time and score: inspections the team submitted in the period.</p>
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
                  <th className="px-4 py-2 text-right font-medium">Avg score</th>
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
                      <td className="px-4 py-2 text-right font-semibold tabular-nums">{pct(t.avg_score)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!data.teams.length && <p className="py-6 text-center text-sm text-slate-500">No tasks in this period.</p>}
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white" aria-labelledby="companies-title">
          <div className="p-4 pb-2">
            <h2 id="companies-title" className="font-semibold text-slate-900">
              Lowest-scoring companies
            </h2>
            <p className="text-xs text-slate-500">Average score of their inspections in the period.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Company</th>
                  <th className="px-3 py-2 text-right font-medium">Inspections</th>
                  <th className="px-3 py-2 font-medium">Trend</th>
                  <th className="px-3 py-2 text-right font-medium">Latest</th>
                  <th className="px-4 py-2 text-right font-medium">Average</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.lowest_companies.map((c) => (
                  <tr key={c.company_id}>
                    <td className="px-4 py-2">
                      <Link href={`/companies/${c.company_id}`} className="font-medium text-primary hover:underline">
                        {c.company}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <Link href={go({ company_id: c.company_id, status: "submitted" })} className="text-primary hover:underline">
                        {c.submitted}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{c.scores.length > 1 ? <ScoreTrend scores={c.scores} /> : <span className="text-xs text-slate-400">—</span>}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{pct(c.last_score)}</td>
                    <td className="px-4 py-2 text-right font-semibold tabular-nums">{pct(c.avg_score)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.lowest_companies.length && <p className="py-6 text-center text-sm text-slate-500">No scored inspections in this period.</p>}
          </div>
        </section>
      </div>
    </>
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

/** Horizontal bars of scores (one blue, 0–100%), with the value and a note on each row. */
function ScoreBars({ title, subtitle, rows }: { title: string; subtitle: string; rows: { name: string; score: number; extra?: string; href?: string }[] }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="font-semibold text-slate-900">{title}</h2>
      <p className="text-xs text-slate-500">{subtitle}</p>
      {rows.length ? (
        <ul className="mt-3 space-y-2.5">
          {rows.map((x) => (
            <li key={x.name} className="grid grid-cols-[minmax(0,1fr)_3.5rem] items-center gap-x-3 text-sm">
              <span className="min-w-0">
                {x.href ? (
                  <Link href={x.href} lang="am" className="block truncate font-medium text-primary hover:underline" title={x.name}>
                    {x.name}
                  </Link>
                ) : (
                  <span lang="am" className="block truncate text-slate-800" title={x.name}>
                    {x.name}
                  </span>
                )}
                <span className="mt-1 block h-2.5 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`${pct(x.score)}`}>
                  <span className="block h-full rounded-r-[4px]" style={{ width: `${Math.max(1, x.score * 100)}%`, background: BLUE }} />
                </span>
                {x.extra && <span className="text-[11px] text-slate-500">{x.extra}</span>}
              </span>
              <span className="text-right font-semibold tabular-nums text-slate-900">{pct(x.score)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-10 text-center text-sm text-slate-500">No scored inspections in this period.</p>
      )}
    </section>
  );
}

/** How status questions were answered: one 100% bar with a labelled legend. */
function AnswerMix({ data }: { data: Analytics }) {
  const d = data.answers.distribution;
  const total = d.met + d.partial + d.not_met + d.not_counted;
  const parts = [
    { key: "met", label: "Met (best score)", n: d.met, color: STATUS.met },
    { key: "partial", label: "Partly met", n: d.partial, color: STATUS.partial },
    { key: "not_met", label: "Not met", n: d.not_met, color: STATUS.not_met },
    { key: "not_counted", label: "Not applicable / not counted", n: d.not_counted, color: STATUS.not_counted },
  ];
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4" aria-labelledby="answers-title">
      <h2 id="answers-title" className="font-semibold text-slate-900">
        How checklist items were answered
      </h2>
      <p className="text-xs text-slate-500">
        {total.toLocaleString()} status answers in {data.answers.scanned.toLocaleString()} inspection{data.answers.scanned === 1 ? "" : "s"}
        {data.answers.limited && " (latest 3,000 inspections)"}
      </p>
      {total ? (
        <>
          <div className="mt-3 flex h-5 w-full gap-[2px] overflow-hidden rounded-[4px]" role="img" aria-label={parts.map((x) => `${x.label} ${pct(x.n / total)}`).join(", ")}>
            {parts
              .filter((x) => x.n)
              .map((x) => (
                <span key={x.key} title={`${x.label}: ${x.n} (${pct(x.n / total)})`} style={{ width: `${(x.n / total) * 100}%`, background: x.color }} />
              ))}
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
            {parts.map((x) => (
              <li key={x.key} className="flex items-center gap-1.5 text-slate-700">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: x.color }} aria-hidden />
                {x.label}
                <b className="tabular-nums text-slate-900">{pct(x.n / total)}</b>
                <span className="text-xs text-slate-500">({x.n})</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="py-6 text-center text-sm text-slate-500">No checklist answers in this period.</p>
      )}
    </section>
  );
}
