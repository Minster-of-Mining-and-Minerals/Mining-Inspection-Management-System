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
const selectClass = "h-9 min-w-0 rounded-md border border-input bg-white px-2 text-sm";

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

/** One row of filters, sticky under the header. `busy` shows "Updating…". */
export function DashboardFilterBar({ state, busy }: { state: DashboardFiltersState; busy?: boolean }) {
  const { period, setPeriod, from, setFrom, to, setTo, f, setF } = state;
  const { data: options } = useGetSubmissionMapOptionsQuery();
  const set = (k: keyof MapFilters) => (e: React.ChangeEvent<HTMLSelectElement>) => setF((cur) => ({ ...cur, [k]: e.target.value || undefined }));
  const active = Object.values(f).some(Boolean) || period !== "30";
  const Select = ({ k, label, list }: { k: keyof MapFilters; label: string; list?: { id: string; name: string }[] }) =>
    list && list.length ? (
      <select aria-label={label} className={`${selectClass} ${f[k] ? "border-primary text-primary" : ""}`} value={(f[k] as string) ?? ""} onChange={set(k)}>
        <option value="">{label}: all</option>
        {list.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    ) : null;

  return (
    <div className="sticky top-14 z-20 -mx-3 flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-100/95 px-3 py-2.5 backdrop-blur sm:top-16 sm:-mx-6 sm:px-6">
      <SectorFilter />
      <select aria-label="Period" className={selectClass} value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
        {PERIODS.map(([k, label]) => (
          <option key={k} value={k}>
            {label}
          </option>
        ))}
      </select>
      {period === "custom" && (
        <>
          <input type="date" aria-label="From" className={selectClass} value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          <input type="date" aria-label="To" className={selectClass} value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </>
      )}
      <Select k="region_id" label="Region" list={options?.regions} />
      <Select k="team_id" label="Team" list={options?.teams} />
      <Select k="submitted_by" label="Inspector" list={options?.inspectors} />
      <Select k="form_id" label="Checklist" list={options?.forms} />
      <Select k="schedule_id" label="Schedule" list={options?.schedules} />
      <Select k="company_id" label="Company" list={options?.companies} />
      <select aria-label="License type" className={`${selectClass} ${f.license_type ? "border-primary text-primary" : ""}`} value={f.license_type ?? ""} onChange={set("license_type")}>
        <option value="">License type: all</option>
        <option value="mining">Mining</option>
        <option value="exploration">Exploration</option>
      </select>
      {active && (
        <button
          type="button"
          className="flex items-center gap-1 text-sm text-primary hover:underline"
          onClick={() => {
            setF({});
            setPeriod("30");
          }}
        >
          <X className="h-4 w-4" /> Clear
        </button>
      )}
      {busy && <span className="text-xs text-slate-500">Updating…</span>}
    </div>
  );
}
