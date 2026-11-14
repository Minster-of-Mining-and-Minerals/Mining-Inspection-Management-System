"use client";

/**
 * The companies page as a map (admins).
 *   left:   the matching companies, with a search; choosing one zooms the map to all its license areas
 *   middle: every matching license area, coloured by team
 *   right:  the chosen company and license (team, last inspection, tasks, links)
 * Uses the same filters as the table, plus zone, team and RED ZONE.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Search, ShieldAlert, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useGetLicenseMapQuery } from "@/redux/api/companyApi";
import { useGetAdminAreasQuery } from "@/redux/api/adminAreaApi";
import { useGetTeamsQuery } from "@/redux/api/teamApi";
import type { LicenseMapParams, MapLicenseRow } from "@/redux/types/company";
import { formatCalendarDate } from "@/utils/date";
import { MapMaximizeButton, useMapMaximize } from "@/components/common/MapMaximize";

const LicenseMap = dynamic(() => import("@/features/my-work/component/LicenseMap"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 animate-pulse bg-slate-100" />,
});


// Distinct, colour-blind-friendly team colours (blue/orange first), repeated when there are more teams
const TEAM_COLOURS = ["#1D5FA8", "#D9730D", "#2A9D8F", "#8E44AD", "#B8860B", "#C2185B", "#5D6D7E", "#3E7C17", "#6D4C41", "#0097A7", "#7B1FA2", "#455A64"];
const NO_TEAM = "#9AA3AB";
const short = (name: string) => (name.length > 22 ? `${name.slice(0, 20).trim()}…` : name);
const selectClass = (on: boolean) => `h-9 rounded-md border px-2 text-sm ${on ? "border-primary bg-sky-50 font-semibold text-primary" : "border-slate-300 bg-white"}`;
const isRedZone = (l: MapLicenseRow) => !!l.notes && /red\s*zone/i.test(l.notes);

interface CompanyGroup {
  company_id: string;
  name: string;
  licenses: MapLicenseRow[];
  teams: string[];
  regions: string[];
}

/** Filters shared with the table (owned by CompaniesList) */
export function CompaniesMap({ base, regionId }: { base: Omit<LicenseMapParams, "team_id" | "red_zone" | "overdue">; regionId: string | undefined }) {
  const [zoneId, setZoneId] = useState("");
  const max = useMapMaximize();
  const [teamId, setTeamId] = useState("");
  const [redZone, setRedZone] = useState(false);
  const [listSearch, setListSearch] = useState("");
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [licenseId, setLicenseId] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const itemRefs = useRef(new Map<string, HTMLButtonElement>());

  const { data: zones } = useGetAdminAreasQuery({ level: "zone", parent_id: regionId, limit: 200 }, { skip: !regionId });
  const { data: teams } = useGetTeamsQuery({ limit: 200 });
  const params: LicenseMapParams = {
    ...base,
    area_id: (regionId && zoneId) || base.area_id,
    team_id: teamId || undefined,
    red_zone: redZone || undefined,
  };
  const { data, isFetching, isError } = useGetLicenseMapQuery(params);
  const rows = useMemo(() => data?.data ?? [], [data]);

  /* ---------- companies (the list) ---------- */
  const companies = useMemo<CompanyGroup[]>(() => {
    const map = new Map<string, CompanyGroup>();
    for (const l of rows) {
      const g = map.get(l.company_id) ?? { company_id: l.company_id, name: l.company_name, licenses: [], teams: [], regions: [] };
      g.licenses.push(l);
      if (l.team_name && !g.teams.includes(l.team_name)) g.teams.push(l.team_name);
      for (const r of (l.region ?? "").split(", ").filter(Boolean)) if (!g.regions.includes(r)) g.regions.push(r);
      map.set(l.company_id, g);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);
  const shownCompanies = useMemo(() => {
    const q = listSearch.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c) =>
      [c.name, ...c.teams, ...c.regions, ...c.licenses.flatMap((l) => [l.license_number, l.woreda ?? "", l.minerals ?? "", l.mineral_text ?? ""])].some((x) => x.toLowerCase().includes(q)),
    );
  }, [companies, listSearch]);

  const company = companies.find((c) => c.company_id === companyId) ?? null;
  const license = company?.licenses.find((l) => l.license_id === licenseId) ?? company?.licenses[0] ?? null;

  /** Choose a company in the list: highlight all its areas and zoom to them. */
  const chooseCompany = (id: string) => {
    const c = companies.find((x) => x.company_id === id);
    setCompanyId(id);
    setLicenseId((c?.licenses.find((l) => l.boundary) ?? c?.licenses[0])?.license_id ?? null);
    setFocused(true);
  };
  /** Click an area on the map: choose its license and company (no zoom). */
  const chooseLicense = (id: string) => {
    const l = rows.find((x) => x.license_id === id);
    if (!l) return;
    setCompanyId(l.company_id);
    setLicenseId(id);
  };

  // Keep the chosen company visible in the list
  useEffect(() => {
    if (companyId) itemRefs.current.get(companyId)?.scrollIntoView({ block: "nearest" });
  }, [companyId]);

  /* ---------- the map ---------- */
  const teamColour = useMemo(() => {
    const ids = [...new Set((teams?.data ?? []).map((t) => t.team_id))];
    return new Map(ids.map((id, i) => [id, TEAM_COLOURS[i % TEAM_COLOURS.length]]));
  }, [teams]);
  const mapLicenses = useMemo(
    () =>
      rows
        .filter((l) => l.boundary)
        .map((l) => ({
          id: l.license_id,
          label: short(l.company_name),
          boundary: l.boundary!,
          color: l.team_id ? teamColour.get(l.team_id) ?? NO_TEAM : NO_TEAM,
        })),
    [rows, teamColour],
  );
  // Stable arrays (the map redraws when they change)
  const highlightIds = useMemo(() => companies.find((c) => c.company_id === companyId)?.licenses.map((l) => l.license_id) ?? [], [companies, companyId]);
  const focusIds = useMemo(
    () => (focused ? companies.find((c) => c.company_id === companyId)?.licenses.filter((l) => l.boundary).map((l) => l.license_id) : undefined),
    [focused, companies, companyId],
  );
  const legend = (() => {
          const teamsShown = [...new Map(rows.map((l) => [l.team_id ?? "none", { name: l.team_name ?? "No team", sector: l.sector_name }])).entries()];
          const repeated = (name: string) => teamsShown.filter(([, t]) => t.name === name).length > 1;
          return teamsShown
            .map(([id, t]) => ({ key: id, label: id !== "none" && t.sector && repeated(t.name) ? `${t.name} · ${t.sector}` : t.name, colour: id === "none" ? NO_TEAM : teamColour.get(id) ?? NO_TEAM }))
            .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
        })();
  const filtersOn = !!(zoneId || teamId || redZone);

  // The chosen company and license (a card on the map on a PC, below the map on a phone)
  const licenseDetails =
    company && license ? (
      <>
        {company.licenses.length > 1 && (
          <div role="group" aria-label="Licenses of this company" className="flex flex-wrap gap-1.5">
            {company.licenses.map((l) => (
              <button
                key={l.license_id}
                type="button"
                aria-pressed={l.license_id === license.license_id}
                onClick={() => setLicenseId(l.license_id)}
                className={`min-h-8 rounded-md border px-2 text-xs font-semibold ${l.license_id === license.license_id ? "border-golden-dark bg-amber-50 text-slate-900" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}
              >
                {l.license_number}
              </button>
            ))}
          </div>
        )}
        <div className="space-y-1 rounded-lg bg-slate-50 p-3 text-sm">
          <p className="font-semibold">{license.license_number}</p>
          <p className="text-slate-600">
            {license.license_type} · {license.minerals || license.mineral_text || "—"} · {license.status}
          </p>
          <p className="text-slate-600">{license.woreda || license.region || "Location not recorded"}</p>
          <p className="text-slate-600">
            {license.team_name ?? "No team"}
            {license.travel_mode ? ` · by ${license.travel_mode}${license.airport ? ` via ${license.airport}` : ""}` : ""}
          </p>
          {!license.boundary && <p className="text-slate-500">No surveyed area: not on the map.</p>}
          {isRedZone(license) && (
            <p className="flex items-center gap-1.5 font-semibold text-red-700">
              <ShieldAlert className="h-4 w-4" /> {license.notes}
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-slate-200 p-2.5">
            <p className="text-xs text-slate-500">Last inspected</p>
            <p className="text-base font-bold text-primary">{license.last_inspected_at ? formatCalendarDate(license.last_inspected_at) : "Not yet"}</p>
          </div>
          <div className="rounded-lg border border-slate-200 p-2.5">
            <p className="text-xs text-slate-500">Open tasks</p>
            <p className="text-xl font-bold text-primary">{license.open_tasks}</p>
            {license.overdue_tasks > 0 && <p className="text-xs font-semibold text-orange-700">{license.overdue_tasks} overdue</p>}
          </div>
        </div>
        <div className="space-y-2">
          <Link href={`/companies/${company.company_id}`} className="flex min-h-10 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-white">
            Open company
          </Link>
          <Link
            href={`/inspections?company_id=${company.company_id}`}
            className="flex min-h-10 items-center justify-center rounded-lg border-[1.5px] border-primary text-sm font-semibold text-primary"
          >
            See its inspections
          </Link>
        </div>
      </>
    ) : null;
  const details =
    company && licenseDetails ? (
      <>
        <div>
          <p className="text-xs font-semibold text-slate-500">COMPANY</p>
          <p className="text-lg font-bold text-slate-900">{company.name}</p>
          <p className="text-sm text-slate-600">{company.regions.join(", ") || "Location not recorded"}</p>
        </div>
        {licenseDetails}
      </>
    ) : null;

  return (
    <div className="space-y-3">
      {/* Map-only filters (the rest are above, shared with the table) */}
      <div className="grid grid-cols-2 items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 lg:flex lg:flex-wrap">
        {regionId && (
          <select aria-label="Zone" className={selectClass(!!zoneId)} value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
            <option value="">All zones</option>
            {(zones?.data ?? []).map((z) => (
              <option key={z.area_id} value={z.area_id}>
                {z.name}
              </option>
            ))}
          </select>
        )}
        <select aria-label="Team" className={selectClass(!!teamId)} value={teamId} onChange={(e) => setTeamId(e.target.value)}>
          <option value="">All teams</option>
          {(teams?.data ?? []).map((t) => (
            <option key={t.team_id} value={t.team_id}>
              {t.name}
            </option>
          ))}
        </select>
        <label className={`flex h-9 items-center gap-2 rounded-md border px-3 text-sm ${redZone ? "border-primary bg-sky-50 font-semibold text-primary" : "border-slate-300"}`}>
          <input type="checkbox" checked={redZone} onChange={(e) => setRedZone(e.target.checked)} /> RED ZONE only
        </label>
        {filtersOn && (
          <button
            type="button"
            className="text-sm font-semibold text-primary hover:underline"
            onClick={() => {
              setZoneId("");
              setTeamId("");
              setRedZone(false);
            }}
          >
            Clear these filters
          </button>
        )}
        <span className="col-span-2 text-sm text-slate-500 lg:ml-auto" aria-live="polite">
          {isFetching ? "Loading…" : data ? `${data.meta.licenses} licenses of ${data.meta.companies} companies${data.meta.without_area ? ` · ${data.meta.without_area} without a surveyed area (not on the map)` : ""}` : ""}
        </span>
      </div>

      {isError ? (
        <p className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">Could not load the map.</p>
      ) : (
        <div className="flex flex-col gap-3 lg:h-[calc(100vh-20rem)] lg:min-h-[560px] lg:flex-row lg:supports-[height:100dvh]:h-[calc(100dvh-20rem)]">
          {/* Companies */}
          <aside className="order-2 flex w-full shrink-0 flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 lg:order-none lg:w-72" aria-label="Companies">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input aria-label="Search companies on the map" value={listSearch} onChange={(e) => setListSearch(e.target.value)} placeholder="Company, license, team, place" className="pl-9" />
            </div>
            <p className="px-1 text-xs font-semibold text-slate-500">
              {shownCompanies.length} of {companies.length} companies<span className="font-normal lg:hidden"> · tap one to show it on the map</span>
            </p>
            <div className="space-y-1.5 lg:-mr-1 lg:flex-1 lg:overflow-y-auto lg:pr-1">
              {shownCompanies.map((c) => {
                const on = c.company_id === companyId;
                const onMap = c.licenses.filter((l) => l.boundary).length;
                return (
                  <div key={c.company_id} className={on ? "rounded-lg border-2 border-primary lg:border-0" : ""}>
                  <button
                    ref={(el) => {
                      if (el) itemRefs.current.set(c.company_id, el);
                      else itemRefs.current.delete(c.company_id);
                    }}
                    type="button"
                    aria-pressed={on}
                    onClick={() => chooseCompany(c.company_id)}
                    className={`w-full scroll-mt-[calc(40dvh+5rem)] rounded-lg border px-3 py-2.5 text-left transition-colors lg:scroll-mt-0 ${on ? "border-transparent bg-amber-50 lg:border-golden-dark" : "border-slate-200 hover:bg-slate-50"}`}
                  >
                    <span className="block text-sm font-semibold text-slate-900">{c.name}</span>
                    <span className="block text-xs text-slate-500">
                      {c.licenses.length} license{c.licenses.length === 1 ? "" : "s"}
                      {c.teams.length ? ` · ${c.teams.join(", ")}` : " · no team"}
                      {onMap < c.licenses.length ? ` · ${c.licenses.length - onMap} not on the map` : ""}
                    </span>
                    {c.regions.length > 0 && <span className="block truncate text-xs text-slate-500">{c.regions.join(", ")}</span>}
                    {c.licenses.some(isRedZone) && <span className="mt-0.5 block text-xs font-semibold text-red-700">RED ZONE</span>}
                  </button>
                  {on && licenseDetails && <div className="space-y-3 px-3 pb-3 pt-2 lg:hidden">{licenseDetails}</div>}
                  </div>
                );
              })}
              {!shownCompanies.length && <p className="py-6 text-center text-sm text-slate-500">No company matches.</p>}
            </div>
          </aside>

          {/* Map */}
          <div className={`isolate order-1 sticky top-14 z-20 h-[40vh] min-h-[260px] flex-none overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-md supports-[height:100dvh]:h-[40dvh] sm:top-16 lg:relative lg:top-auto lg:z-auto lg:order-none lg:shadow-none lg:h-auto lg:flex-1 ${max.frameClass}`}>
            <LicenseMap
              className="absolute inset-0"
              ariaLabel={company && focused ? `Map zoomed to ${company.name}` : `Map of ${mapLicenses.length} license areas, coloured by team`}
              licenses={mapLicenses}
              selectedId={license?.license_id ?? null}
              highlightIds={highlightIds}
              onSelect={chooseLicense}
              focusIds={focusIds}
              fit="all"
            />
            <MapMaximizeButton {...max} className="absolute right-3 top-[86px] z-10" />
            <div className="absolute left-3 top-3 z-10 flex flex-wrap items-center gap-2">
              {focused && company && (
                <button type="button" onClick={() => setFocused(false)} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-primary shadow-md">
                  Show all
                </button>
              )}
            </div>
            <div className="absolute bottom-8 left-3 z-10 max-h-[45%] space-y-1.5 overflow-y-auto rounded-lg bg-white/95 px-3 py-2 shadow-md">
              {legend.map((row) => (
                <p key={row.key} className="flex items-center gap-2 text-xs text-slate-800">
                  <span className="h-3.5 w-3.5 shrink-0 rounded-sm" style={{ background: row.colour }} aria-hidden="true" />
                  {row.label}
                </p>
              ))}
            </div>
            {details && (
              <div className="absolute right-14 top-3 z-10 hidden max-h-[calc(100%-1.5rem)] w-80 space-y-3 overflow-y-auto rounded-xl bg-white p-4 shadow-xl lg:block" aria-label="Selected company">
                <button
                  type="button"
                  onClick={() => {
                    setCompanyId(null);
                    setFocused(false);
                  }}
                  aria-label="Close"
                  className="float-right -mr-1 -mt-1 flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
                >
                  <X className="h-4 w-4" />
                </button>
                {details}
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
