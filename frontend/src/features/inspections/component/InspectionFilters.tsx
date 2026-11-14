"use client";

/**
 * Filters of the Inspections page (design: "Inspections · Desktop / Mobile", "Filters sheet"):
 *   - computer: a bar above the list — Region, Team, Company, License type, and "Dates";
 *   - phone: a Filters button opening a bottom sheet with the same groups, Clear all and Show results.
 * Filters apply at once (they live in the address); "Show results" closes the sheet.
 * Also the Export menu (CSV / JSON of what is filtered).
 */
import { useEffect, useRef, useState } from "react";
import { getSession } from "next-auth/react";
import { toast } from "sonner";
import { ChevronDown, Download, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectorFilter } from "@/components/common/SectorFilter";
import { getSelectedSectorId } from "@/lib/sectorSelection";
import { resolveApiBaseUrl } from "@/utils/apiUrl";

export type FilterKey = "region_id" | "team_id" | "submitted_by" | "company_id" | "license_type" | "form_id" | "schedule_id" | "date_field" | "from" | "to";
type Option = { id: string; name: string };
export interface FilterOptions {
  regions?: Option[];
  teams?: Option[];
  inspectors?: Option[];
  companies?: Option[];
  forms?: Option[];
  schedules?: Option[];
}
interface Props {
  values: Partial<Record<FilterKey, string>>;
  options?: FilterOptions;
  onChange: (patch: Partial<Record<FilterKey, string | undefined>>) => void;
  onClear: () => void;
}

const fieldClass = "h-10 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";
const activeClass = "border-primary bg-sky-50/60 font-medium text-primary";

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`flex flex-col gap-1 text-xs font-semibold text-slate-600 ${wide ? "col-span-2" : ""}`}>
      {label}
      {children}
    </label>
  );
}

function Pick({ value, list, onChange, label }: { value?: string; list?: Option[]; onChange: (v?: string) => void; label: string }) {
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

function Group({ title, columns, children }: { title: string; columns: 1 | 2; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">{title}</p>
      <div className={columns === 2 ? "grid grid-cols-2 gap-2.5" : "grid grid-cols-1 gap-2.5"}>{children}</div>
    </div>
  );
}

/** The grouped fields of the phone sheet. */
function FilterFields({ values: v, options: o, onChange, columns }: Props & { columns: 1 | 2 }) {
  const wide = columns === 2;
  return (
    <div className="space-y-4">
      <Group title="Where & who" columns={columns}>
        <Field label="Region">
          <Pick label="Region" value={v.region_id} list={o?.regions} onChange={(x) => onChange({ region_id: x })} />
        </Field>
        <Field label="Team">
          <Pick label="Team" value={v.team_id} list={o?.teams} onChange={(x) => onChange({ team_id: x })} />
        </Field>
      </Group>
      <Group title="What" columns={columns}>
        <Field label="Company" wide={wide}>
          <Pick label="Company" value={v.company_id} list={o?.companies} onChange={(x) => onChange({ company_id: x })} />
        </Field>
        <Field label="License type">
          <select aria-label="License type" className={`${fieldClass} ${v.license_type ? activeClass : ""}`} value={v.license_type ?? ""} onChange={(e) => onChange({ license_type: e.target.value || undefined })}>
            <option value="">All</option>
            <option value="mining">Mining</option>
            <option value="exploration">Exploration</option>
          </select>
        </Field>
      </Group>
      <Group title="When" columns={columns}>
        <div className="col-span-full grid grid-cols-2 gap-2.5">
          <Field label="From">
            <input type="date" aria-label="From" className={`${fieldClass} ${v.from ? activeClass : ""}`} value={v.from ?? ""} onChange={(e) => onChange({ from: e.target.value || undefined })} />
          </Field>
          <Field label="To">
            <input type="date" aria-label="To" className={`${fieldClass} ${v.to ? activeClass : ""}`} value={v.to ?? ""} onChange={(e) => onChange({ to: e.target.value || undefined })} />
          </Field>
        </div>
      </Group>
    </div>
  );
}

const MORE_KEYS: FilterKey[] = ["from", "to"];

/** Computer: the filter bar above the list. The less-used filters open with "More filters". */
export function FilterBar({ values: v, options: o, onChange, onClear }: Props) {
  const count = activeCount(v);
  const moreCount = MORE_KEYS.filter((k) => v[k]).length;
  const [more, setMore] = useState(moreCount > 0);
  const showMore = more || moreCount > 0;
  return (
    <section aria-label="Filters" className="hidden space-y-3 rounded-xl border border-slate-200 bg-white p-3 lg:block">
      <div className="flex items-end gap-3">
        <div className="grid min-w-0 flex-1 grid-cols-4 gap-3">
          <Field label="Region">
            <Pick label="Region" value={v.region_id} list={o?.regions} onChange={(x) => onChange({ region_id: x })} />
          </Field>
          <Field label="Team">
            <Pick label="Team" value={v.team_id} list={o?.teams} onChange={(x) => onChange({ team_id: x })} />
          </Field>
          <Field label="Company">
            <Pick label="Company" value={v.company_id} list={o?.companies} onChange={(x) => onChange({ company_id: x })} />
          </Field>
          <Field label="License type">
            <select aria-label="License type" className={`${fieldClass} ${v.license_type ? activeClass : ""}`} value={v.license_type ?? ""} onChange={(e) => onChange({ license_type: e.target.value || undefined })}>
              <option value="">All</option>
              <option value="mining">Mining</option>
              <option value="exploration">Exploration</option>
            </select>
          </Field>
        </div>
        <button
          type="button"
          aria-expanded={showMore}
          onClick={() => setMore(!showMore)}
          disabled={moreCount > 0}
          className={`flex h-10 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold disabled:cursor-default ${moreCount ? "border-primary bg-sky-50/60 text-primary" : "border-slate-300 text-slate-700 hover:border-primary hover:text-primary"}`}
        >
          <SlidersHorizontal className="h-4 w-4" /> Dates{moreCount ? ` (${moreCount})` : ""}
          <ChevronDown className={`h-4 w-4 transition-transform ${showMore ? "rotate-180" : ""}`} />
        </button>
        {count > 0 && (
          <button type="button" onClick={onClear} className="flex h-10 shrink-0 items-center gap-1 px-1 text-sm font-semibold text-primary hover:underline">
            <X className="h-4 w-4" /> Clear all
          </button>
        )}
      </div>
      {showMore && (
        <div className="grid grid-cols-4 gap-3 border-t border-slate-100 pt-3">
          <Field label="From">
            <input type="date" aria-label="From" className={`${fieldClass} ${v.from ? activeClass : ""}`} value={v.from ?? ""} onChange={(e) => onChange({ from: e.target.value || undefined })} />
          </Field>
          <Field label="To">
            <input type="date" aria-label="To" className={`${fieldClass} ${v.to ? activeClass : ""}`} value={v.to ?? ""} onChange={(e) => onChange({ to: e.target.value || undefined })} />
          </Field>
        </div>
      )}
    </section>
  );
}

/** Phone: the Filters button and its bottom sheet. */
export function FilterSheetButton(props: Props) {
  const [open, setOpen] = useState(false);
  const count = activeCount(props.values);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = before;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`flex h-11 shrink-0 items-center gap-2 rounded-lg border-[1.5px] px-3.5 text-sm font-bold lg:hidden ${count ? "border-primary bg-primary text-white" : "border-primary bg-white text-primary"}`}
        aria-haspopup="dialog"
      >
        <SlidersHorizontal className="h-4 w-4" /> Filters{count ? ` (${count})` : ""}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end bg-slate-900/55 lg:hidden" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="Filters" className="flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-center pt-2.5" aria-hidden="true">
              <span className="h-1 w-10 rounded-full bg-slate-300" />
            </div>
            <div className="flex items-center justify-between border-b border-slate-200 py-2 pl-5 pr-2">
              <h2 className="text-lg font-bold text-slate-900">Filters</h2>
              <button ref={closeRef} type="button" aria-label="Close filters" onClick={() => setOpen(false)} className="flex h-11 w-11 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 overflow-y-auto px-5 py-4">
              <SectorFilter />
              <FilterFields {...props} columns={2} />
            </div>
            <div className="flex gap-2.5 border-t border-slate-200 px-5 pb-6 pt-3">
              <Button variant="outline" className="h-12 flex-1" onClick={props.onClear}>
                Clear all
              </Button>
              <Button className="h-12 flex-[2]" onClick={() => setOpen(false)}>
                Show results
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const activeCount = (v: Partial<Record<FilterKey, string>>) => (["region_id", "team_id", "submitted_by", "company_id", "license_type", "form_id", "schedule_id", "from", "to"] as FilterKey[]).filter((k) => v[k]).length;

/** Export: the filtered inspections as CSV (opens in Excel) or JSON — a summary, or one row per answer. */
export function ExportMenu({ query }: { query: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = async (detail: "summary" | "answers", format: "csv" | "json") => {
    setOpen(false);
    setBusy(true);
    try {
      const session = await getSession();
      const headers: Record<string, string> = {};
      if (session?.accessToken) headers.Authorization = `Bearer ${session.accessToken}`;
      const sector = (session?.user as { is_central?: boolean } | undefined)?.is_central ? getSelectedSectorId() : null;
      if (sector) headers["X-Sector-Id"] = sector;
      const params = new URLSearchParams({ ...query, detail, format });
      const r = await fetch(`${resolveApiBaseUrl()}/inspections/export?${params}`, { headers });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.message || "The export failed.");
      const blob = await r.blob();
      const name = /filename="([^"]+)"/.exec(r.headers.get("content-disposition") ?? "")?.[1] ?? `inspections.${format}`;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The export failed.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="relative">
      <Button variant="outline" className="h-10 gap-1.5" disabled={busy} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        <Download className="h-4 w-4" /> {busy ? "Exporting…" : "Export"} <ChevronDown className="h-4 w-4" />
      </Button>
      {open && (
        <>
          <button type="button" aria-hidden="true" tabIndex={-1} className="fixed inset-0 z-30 cursor-default" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute right-0 z-40 mt-1 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
            <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">Summary · one row per inspection</p>
            <button role="menuitem" type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => run("summary", "csv")}>
              CSV <span className="text-slate-500">(Excel)</span>
            </button>
            <button role="menuitem" type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => run("summary", "json")}>
              JSON
            </button>
            <p className="border-t border-slate-100 px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">With answers · one row per answer</p>
            <button role="menuitem" type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => run("answers", "csv")}>
              CSV <span className="text-slate-500">(Excel)</span>
            </button>
            <button role="menuitem" type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => run("answers", "json")}>
              JSON
            </button>
            <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">Exports what is filtered on this page (all pages).</p>
          </div>
        </>
      )}
    </div>
  );
}
