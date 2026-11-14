"use client";

/** The filter bar shared by the dashboard and the submission map (period, region, team, inspector …). */
import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { useGetSubmissionMapOptionsQuery, MapFilters } from "@/redux/api/dashboardApi";
import { SectorFilter } from "@/components/common/SectorFilter";

const todayLocal = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() + 3 * 3600e3 - (n - 1) * 86400e3).toISOString().slice(0, 10);
type Period = "7" | "30" | "90" | "365" | "all" | "custom";
const PERIODS: [Period, string][] = [
  ["7", "Last 7 days"],
  ["30", "Last 30 days"],
  ["90", "Last 3 months"],
  ["365", "Last 12 months"],
  ["all", "All time"],
  ["custom", "Custom dates"],
];

/** Filter state; `base` is what the API calls take. */
export function useDashboardFilters() {
  const [period, setPeriod] = useState<Period>("30");
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(todayLocal());
  const [f, setF] = useState<MapFilters>({});
  const base = useMemo<MapFilters>(() => {
    const dates = period === "all" ? {} : period === "custom" ? { from, to } : { from: daysAgo(Number(period)), to: todayLocal() };
    return { ...f, ...dates };
  }, [f, period, from, to]);
  return { base, period, setPeriod, from, setFrom, to, setTo, f, setF };
}
export type DashboardFiltersState = ReturnType<typeof useDashboardFilters>;

const fieldClass = "h-10 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";
const activeClass = "border-primary bg-sky-50/60 font-medium text-primary";
type Option = { id: string; name: string };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold text-slate-600">
      {label}
      {children}
    </label>
  );
}

function Pick({ label, value, list, onChange }: { label: string; value?: string; list?: Option[]; onChange: (v?: string) => void }) {
  return (
    <select aria-label={label} className={`${fieldClass} ${value ? activeClass : ""}`} value={value ?? ""} onChange={(e) => onChange(e.target.value || undefined)}>
      <option value="">All</option>
      {(list ?? []).map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}

/**
 * The filter bar (like the Inspections page): Period, Region, Team, Company, License type.
 * Sticky under the header on a computer. `busy` shows "Updating…".
 */
export function DashboardFilterBar({ state, busy }: { state: DashboardFiltersState; busy?: boolean }) {
  const { period, setPeriod, from, setFrom, to, setTo, f, setF } = state;
  const { data: options } = useGetSubmissionMapOptionsQuery();
  const put = (k: keyof MapFilters) => (v?: string) => setF((cur) => ({ ...cur, [k]: v }));
  const active = Object.values(f).some(Boolean) || period !== "30";

  return (
    <div className="-mx-3 bg-slate-100/95 px-3 py-2.5 backdrop-blur sm:-mx-6 sm:px-6 lg:sticky lg:top-16 lg:z-20 lg:border-b lg:border-slate-200">
      <section aria-label="Filters" className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="grid min-w-0 flex-1 grid-cols-2 gap-3 lg:grid-cols-5">
            <Field label="Period">
              <select aria-label="Period" className={`${fieldClass} ${period !== "30" ? activeClass : ""}`} value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
                {PERIODS.map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Region">
              <Pick label="Region" value={f.region_id} list={options?.regions} onChange={put("region_id")} />
            </Field>
            <Field label="Team">
              <Pick label="Team" value={f.team_id} list={options?.teams} onChange={put("team_id")} />
            </Field>
            <Field label="Company">
              <Pick label="Company" value={f.company_id} list={options?.companies} onChange={put("company_id")} />
            </Field>
            <Field label="License type">
              <select aria-label="License type" className={`${fieldClass} ${f.license_type ? activeClass : ""}`} value={f.license_type ?? ""} onChange={(e) => put("license_type")(e.target.value || undefined)}>
                <option value="">All</option>
                <option value="mining">Mining</option>
                <option value="exploration">Exploration</option>
              </select>
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SectorFilter className="h-10 rounded-lg" />
            {active && (
              <button
                type="button"
                className="flex h-10 shrink-0 items-center gap-1 px-1 text-sm font-semibold text-primary hover:underline"
                onClick={() => {
                  setF({});
                  setPeriod("30");
                }}
              >
                <X className="h-4 w-4" /> Clear all
              </button>
            )}
            {busy && <span className="text-xs text-slate-500">Updating…</span>}
          </div>
        </div>

        {period === "custom" && (
          <div className="grid grid-cols-2 gap-3 lg:w-1/2">
            <Field label="From">
              <input type="date" aria-label="From" className={`${fieldClass} ${activeClass}`} value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="To">
              <input type="date" aria-label="To" className={`${fieldClass} ${activeClass}`} value={to} min={from} onChange={(e) => setTo(e.target.value)} />
            </Field>
          </div>
        )}

      </section>
    </div>
  );
}
