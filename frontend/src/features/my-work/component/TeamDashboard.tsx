"use client";

import { useRouter } from "next/navigation";
import { UsersRound } from "lucide-react";
import Loading01 from "@/features/template/component/Loading/Loading01";
import { useGetMyStatsQuery } from "@/redux/api/myWorkApi";
import type { MyStats, TeamStats } from "@/redux/types/myWork";
import { formatCalendarDate, formatDateTime } from "@/utils/date";

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

/** Dashboard for field teams: the team's and the signed-in inspector's own progress. */
export default function TeamDashboard() {
  const router = useRouter();
  const { data, isLoading, isError } = useGetMyStatsQuery(undefined, { refetchOnMountOrArgChange: true });
  if (isLoading) return <Loading01 />;
  if (isError) return <p className="py-10 text-center text-red-600">Could not load your progress.</p>;
  if (!data)
    return (
      <div className="mx-auto max-w-md rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-600">
        <UsersRound className="mx-auto mb-2 h-8 w-8 text-slate-300" />
        You are not in an inspection team yet.
      </div>
    );

  return (
    <div className="w-full space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-primary">Dashboard</h1>
        <p className="text-sm text-slate-500">{data.team.name}: tasks and submissions. Only your team’s inspections are counted.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <StatsCard title="Team · this month" s={data.this_month} />
        <StatsCard title="Team · all time" s={data.overall} />
        <section className="rounded-xl border border-primary/30 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">Me</h2>
          <dl className="mt-3 grid grid-cols-2 gap-3">
            <Tile label="Inspections I submitted" value={data.me.submitted} />
            <Tile label="Submitted late" value={data.me.late} tone={data.me.late ? "text-amber-700" : undefined} />
            <Tile label="Returned for correction" value={data.me.returned} tone={data.me.returned ? "text-violet-700" : undefined} />
          </dl>
        </section>
      </div>

      <WeeklyChart weekly={data.weekly} />

      <div>
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-900">Recent submissions</h2>
          {data.recent.length ? (
            <ul className="divide-y">
              {data.recent.map((r) => (
                <li key={r.inspection_id}>
                  <button type="button" onClick={() => router.push(`/inspections/${r.inspection_id}`)} className="flex w-full items-center gap-3 py-2 text-left text-sm hover:bg-slate-50">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-slate-800">{r.company_name}</span>
                      <span className="text-xs text-slate-500">
                        {r.form_name} · {formatDateTime(r.submitted_at)} · {r.submitted_by_name ?? "—"}
                        {r.is_late && <span className="text-amber-700"> · late</span>}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-6 text-center text-sm text-slate-500">Nothing submitted yet.</p>
          )}
        </section>
      </div>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={`text-2xl font-bold ${tone ?? "text-slate-900"}`}>{value}</dd>
    </div>
  );
}

function StatsCard({ title, s }: { title: string; s: TeamStats }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      <dl className="mt-3 grid grid-cols-2 gap-3">
        <Tile label="Submitted" value={`${s.submitted} / ${s.tasks}`} />
        <Tile label="On time" value={pct(s.on_time, s.submitted)} tone={s.submitted && s.on_time / s.submitted < 0.8 ? "text-amber-700" : undefined} />
        <Tile label="Overdue now" value={s.overdue} tone={s.overdue ? "text-red-700" : undefined} />
      </dl>
      <p className="mt-2 text-xs text-slate-500">
        {s.open} open · {s.late} submitted late
      </p>
    </section>
  );
}

/** Team submissions per week (last 8 weeks); one series, so no legend. Hover or focus a bar for its numbers. */
function WeeklyChart({ weekly }: { weekly: MyStats["weekly"] }) {
  // Fill missing weeks so the axis is even (weeks start on Monday)
  const monday = (d: Date) => {
    const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
    return x;
  };
  const start = monday(new Date(Date.now() + 3 * 3600e3));
  const byWeek = new Map(weekly.map((w) => [w.week, w]));
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() - (7 - i) * 7);
    const key = d.toISOString().slice(0, 10);
    return { week: key, submitted: byWeek.get(key)?.submitted ?? 0, mine: byWeek.get(key)?.mine ?? 0 };
  });
  const max = Math.max(1, ...weeks.map((w) => w.submitted));

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-900">Team submissions per week</h2>
      <p className="text-xs text-slate-500">Last 8 weeks · hover a bar for your share</p>
      <div className="mt-4 flex h-40 items-end gap-0.5 border-b border-slate-200" aria-hidden>
        {weeks.map((w) => (
          <div key={w.week} className="group relative flex h-full flex-1 flex-col items-center justify-end px-1">
            <span className="mb-1 text-xs text-slate-600">{w.submitted || ""}</span>
            <span className="block w-full max-w-10 rounded-t-[4px] bg-primary transition-opacity group-hover:opacity-80" style={{ height: `${Math.round((w.submitted / max) * 128)}px`, minHeight: w.submitted ? 4 : 0 }} />
            <span className="pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 shadow group-hover:block">
              Week of {formatCalendarDate(w.week)}: {w.submitted} submitted, {w.mine} by you
            </span>
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-0.5" aria-hidden>
        {weeks.map((w) => (
          <span key={w.week} className="flex-1 text-center text-[11px] text-slate-500">
            {formatCalendarDate(w.week).replace(/, \d{4}$/, "")}
          </span>
        ))}
      </div>
      {/* Same numbers as a table, for screen readers */}
      <table className="sr-only">
        <caption>Team submissions per week</caption>
        <thead>
          <tr>
            <th>Week of</th>
            <th>Submitted by the team</th>
            <th>Submitted by you</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((w) => (
            <tr key={w.week}>
              <td>{formatCalendarDate(w.week)}</td>
              <td>{w.submitted}</td>
              <td>{w.mine}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
