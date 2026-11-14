"use client";

/** The filter bar shared by the dashboard and the submission map (period, region, team, inspector …). */
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
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

/** The chosen filter's name, for the summary next to the button */
const nameOf = (list: Option[] | undefined, id?: string) => (id ? list?.find((o) => o.id === id)?.name : undefined);

/**
 * The dashboard's filters. Computer: a bar with Period, Region, Team, Company, License type.
 * Phone: one "Filters" button that opens them in a sheet from the bottom; next to the button,
 * what is chosen (e.g. "Last 30 days · Team 1"). `busy` shows "Updating…".
 */
export function DashboardFilterBar({ state, busy }: { state: DashboardFiltersState; busy?: boolean }) {
  const { period, setPeriod, from, setFrom, to, setTo, f, setF } = state;
  const { data: options } = useGetSubmissionMapOptionsQuery();
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const put = (k: keyof MapFilters) => (v?: string) => setF((cur) => ({ ...cur, [k]: v }));
  const count = (["region_id", "team_id", "company_id", "license_type"] as (keyof MapFilters)[]).filter((k) => f[k]).length + (period !== "30" ? 1 : 0);
  const clear = () => {
    setF({});
    setPeriod("30");
  };

  // Escape closes; on a phone the page behind doesn't scroll
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = before;
    };
  }, [open]);

  const periodLabel = period === "custom" ? `${from} – ${to}` : PERIODS.find(([k]) => k === period)?.[1];
  const summary = [
    periodLabel,
    nameOf(options?.regions, f.region_id),
    nameOf(options?.teams, f.team_id),
    nameOf(options?.companies, f.company_id),
    f.license_type === "mining" ? "Mining" : f.license_type === "exploration" ? "Exploration" : undefined,
  ].filter(Boolean);

  const periodSelect = (
    <select aria-label="Period" className={`${fieldClass} ${period !== "30" ? activeClass : ""}`} value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
      {PERIODS.map(([k, label]) => (
        <option key={k} value={k}>
          {label}
        </option>
      ))}
    </select>
  );
  const dates = period === "custom" && (
    <>
      <Field label="From">
        <input type="date" aria-label="From" className={`${fieldClass} ${activeClass}`} value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
      </Field>
      <Field label="To">
        <input type="date" aria-label="To" className={`${fieldClass} ${activeClass}`} value={to} min={from} onChange={(e) => setTo(e.target.value)} />
      </Field>
    </>
  );
  const licenseSelect = (
    <select aria-label="License type" className={`${fieldClass} ${f.license_type ? activeClass : ""}`} value={f.license_type ?? ""} onChange={(e) => put("license_type")(e.target.value || undefined)}>
      <option value="">All</option>
      <option value="mining">Mining</option>
      <option value="exploration">Exploration</option>
    </select>
  );

  const fields = (
    <div className="space-y-4">
      <SectorFilter className="h-10 w-full rounded-lg" />
      <Group title="When">
        <div className="col-span-2">
          <Field label="Period">{periodSelect}</Field>
        </div>
        {dates}
      </Group>
      <Group title="Where & who">
        <Field label="Region">
          <Pick label="Region" value={f.region_id} list={options?.regions} onChange={put("region_id")} />
        </Field>
        <Field label="Team">
          <Pick label="Team" value={f.team_id} list={options?.teams} onChange={put("team_id")} />
        </Field>
      </Group>
      <Group title="What">
        <div className="col-span-2">
          <Field label="Company">
            <Pick label="Company" value={f.company_id} list={options?.companies} onChange={put("company_id")} />
          </Field>
        </div>
        <Field label="License type">{licenseSelect}</Field>
      </Group>
    </div>
  );

  return (
    <>
    {/* Computer: the filter bar */}
    <div className="-mx-6 hidden border-b border-slate-200 bg-slate-100/95 px-6 py-2.5 backdrop-blur lg:sticky lg:top-16 lg:z-20 lg:block">
      <section aria-label="Filters" className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex items-end gap-3">
          <div className="grid min-w-0 flex-1 grid-cols-5 gap-3">
            <Field label="Period">{periodSelect}</Field>
            <Field label="Region">
              <Pick label="Region" value={f.region_id} list={options?.regions} onChange={put("region_id")} />
            </Field>
            <Field label="Team">
              <Pick label="Team" value={f.team_id} list={options?.teams} onChange={put("team_id")} />
            </Field>
            <Field label="Company">
              <Pick label="Company" value={f.company_id} list={options?.companies} onChange={put("company_id")} />
            </Field>
            <Field label="License type">{licenseSelect}</Field>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SectorFilter className="h-10 rounded-lg" />
            {count > 0 && (
              <button type="button" className="flex h-10 shrink-0 items-center gap-1 px-1 text-sm font-semibold text-primary hover:underline" onClick={clear}>
                <X className="h-4 w-4" /> Clear all
              </button>
            )}
            {busy && <span className="text-xs text-slate-500">Updating…</span>}
          </div>
        </div>
        {period === "custom" && <div className="grid w-1/2 grid-cols-2 gap-3">{dates}</div>}
      </section>
    </div>

    {/* Phone: one Filters button that opens the dropdown */}
    <div className="relative flex flex-wrap items-center gap-x-3 gap-y-2 lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`flex h-11 shrink-0 items-center gap-2 rounded-lg border-[1.5px] border-primary px-3.5 text-sm font-bold lg:h-10 ${count ? "bg-primary text-white" : "bg-white text-primary"}`}
      >
        <SlidersHorizontal className="h-4 w-4" /> Filters{count ? ` (${count})` : ""}
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <p className="min-w-0 flex-1 truncate text-sm text-slate-600" aria-live="polite">
        {summary.join(" · ")}
        {busy && <span className="ml-2 text-xs text-slate-400">Updating…</span>}
      </p>
      {count > 0 && (
        <button type="button" onClick={clear} className="flex h-10 shrink-0 items-center gap-1 text-sm font-semibold text-primary hover:underline">
          <X className="h-4 w-4" /> Clear all
        </button>
      )}

      {open && (
        <>
          {/* Click outside closes (dimmed on a phone) */}
          <div className="fixed inset-0 z-40 bg-slate-900/55" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Filters"
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[92vh] flex-col rounded-t-2xl bg-white shadow-2xl"
          >
            <div className="flex justify-center pt-2.5 lg:hidden" aria-hidden="true">
              <span className="h-1 w-10 rounded-full bg-slate-300" />
            </div>
            <div className="flex items-center justify-between border-b border-slate-200 py-2 pl-5 pr-2 lg:py-1.5 lg:pl-4">
              <h2 className="text-lg font-bold text-slate-900 lg:text-base">Filters</h2>
              <button ref={closeRef} type="button" aria-label="Close filters" onClick={() => setOpen(false)} className="flex h-11 w-11 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100 lg:h-9 lg:w-9">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-4 lg:px-4">{fields}</div>
            <div className="flex gap-2.5 border-t border-slate-200 px-5 pb-6 pt-3 lg:px-4 lg:pb-3">
              <Button variant="outline" className="h-12 flex-1 lg:h-10" onClick={clear}>
                Clear all
              </Button>
              <Button className="h-12 flex-[2] lg:h-10" onClick={() => setOpen(false)}>
                Show results
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
    </>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">{title}</p>
      <div className="grid grid-cols-2 gap-2.5">{children}</div>
    </div>
  );
}
