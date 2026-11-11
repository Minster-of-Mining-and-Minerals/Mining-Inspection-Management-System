"use client";

/**
 * My companies as a map (design option D).
 *   PC: the team's licenses listed on the left (nearest first), the map on the right; a card on
 *       the map shows the chosen license. Choosing one in the list (or on the map) zooms to it.
 *   Phone: a dropdown above the map to choose a license; its buttons at the bottom.
 */
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ChevronDown, Crosshair, MapPin, Plane, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { usePosition } from "@/hooks/usePosition";
import type { MyLicense } from "@/redux/types/myWork";
import { distanceText, positionInArea, type SitePosition } from "@/utils/licenseArea";
import { dueText } from "@/features/inspections/component/taskUi";
import { MapMaximizeButton, useMapMaximize } from "@/components/common/MapMaximize";

const LicenseMap = dynamic(() => import("./LicenseMap"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 animate-pulse bg-slate-100" />,
});

const short = (name: string) => (name.length > 22 ? `${name.slice(0, 20).trim()}…` : name);

type Row = MyLicense & { where: SitePosition | null };

/** "Inside" / "2.4 km" / "" (position unknown) */
const distanceLabel = (where: SitePosition | null) => (!where ? "" : where.inside ? "Inside" : distanceText(where.distanceM));

export function MyCompaniesMap({ licenses }: { licenses: MyLicense[] }) {
  const { position, error } = usePosition(true);
  const max = useMapMaximize();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const [search, setSearch] = useState("");
  const [dropOpen, setDropOpen] = useState(false);
  const [recenter, setRecenter] = useState(0);

  // Nearest first once the position is known
  const rows = useMemo<Row[]>(() => {
    const all = licenses.map((l) => ({ ...l, where: position && l.boundary ? positionInArea(position.lat, position.lng, l.boundary) : null }));
    return all.sort((a, b) => (a.where && b.where ? (a.where.inside ? 0 : a.where.distanceM) - (b.where.inside ? 0 : b.where.distanceM) : a.company_name.localeCompare(b.company_name)));
  }, [licenses, position]);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? rows.filter((l) => [l.company_name, l.license_number, l.minerals, l.mineral_text, l.woreda, l.region].some((x) => x?.toLowerCase().includes(q))) : rows;
  }, [rows, search]);
  const mapLicenses = useMemo(
    () => licenses.filter((l) => l.boundary).map((l) => ({ id: l.license_id, label: short(l.company_name), boundary: l.boundary! })),
    [licenses],
  );
  const selected = rows.find((l) => l.license_id === selectedId) ?? null;
  const withoutArea = licenses.filter((l) => !l.boundary);

  const choose = (id: string) => {
    setSelectedId(id);
    setZoomed(true);
    setDropOpen(false);
  };

  const listItem = (l: Row, compact = false) => {
    const on = l.license_id === selectedId;
    return (
      <button
        key={l.license_id}
        type="button"
        onClick={() => choose(l.license_id)}
        aria-pressed={on}
        className={`flex w-full items-center gap-3 rounded-lg border text-left transition-colors ${compact ? "min-h-12 px-3 py-2" : "px-3 py-2.5"} ${
          on ? "border-golden-dark bg-amber-50" : "border-slate-200 bg-white hover:bg-slate-50"
        }`}
      >
        <span className={`w-1 self-stretch rounded-full ${on ? "bg-golden-dark" : l.boundary ? "bg-slate-300" : "bg-slate-200"}`} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-slate-900">{l.company_name}</span>
          <span className="block truncate text-xs text-slate-500">
            {l.license_number}
            {l.minerals || l.mineral_text ? ` · ${l.minerals || l.mineral_text}` : ""}
          </span>
          {!compact && (
            <span className="block truncate text-xs text-slate-500">
              {l.open_tasks[0] ? `Next task due ${dueText(l.open_tasks[0].due_at)}` : "No open task"}
              {!l.boundary && " · not on the map"}
            </span>
          )}
        </span>
        <span className={`shrink-0 text-sm font-bold ${l.where?.inside ? "text-green-700" : "text-primary"}`}>{distanceLabel(l.where)}</span>
      </button>
    );
  };

  const details = selected && (
    <>
      <div className="flex items-start gap-3">
        <span className="w-1.5 self-stretch rounded-full bg-golden-dark" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-bold text-slate-900">{selected.company_name}</p>
          <p className="text-sm text-slate-600">
            {selected.license_number} · {selected.license_type}
            {selected.minerals || selected.mineral_text ? ` · ${selected.minerals || selected.mineral_text}` : ""}
          </p>
          <p className="text-sm text-slate-600">
            {selected.where ? (selected.where.inside ? <span className="font-semibold text-green-700">You are inside this area</span> : `${distanceText(selected.where.distanceM)} from you`) : selected.boundary ? (error ? "Your position is not known" : "Finding your position…") : "No surveyed area"}
            {selected.open_tasks[0] ? ` · next task due ${dueText(selected.open_tasks[0].due_at)}` : " · no open task"}
          </p>
          {selected.travel_mode === "plane" && (
            <p className="flex items-center gap-1 text-sm text-slate-600">
              <Plane className="h-3.5 w-3.5" /> By plane{selected.airport ? ` via ${selected.airport}` : ""}
            </p>
          )}
        </div>
      </div>
      {selected.open_tasks[0] && (
        <Link href={`/inspections/${selected.open_tasks[0].inspection_id}`} className="flex min-h-11 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-white">
          Open task
        </Link>
      )}
    </>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 lg:h-[calc(100vh-14rem)] lg:min-h-[560px] lg:flex-row lg:supports-[height:100dvh]:h-[calc(100dvh-14rem)]">
        {/* PC: the list on the left */}
        <aside className="hidden w-[360px] shrink-0 flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 lg:flex" aria-label="Your licenses">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input aria-label="Search licenses" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Company, license, mineral" className="pl-9" />
          </div>
          <p className="px-1 text-xs font-semibold text-slate-500">
            {shown.length} license{shown.length === 1 ? "" : "s"} · {position ? "nearest first" : "A–Z"}
          </p>
          <div className="-mr-1 flex-1 space-y-2 overflow-y-auto pr-1">{shown.map((l) => listItem(l))}</div>
        </aside>

        {/* Phone: a dropdown above the map */}
        <div className="relative lg:hidden">
          <button
            type="button"
            onClick={() => setDropOpen((o) => !o)}
            aria-expanded={dropOpen}
            className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-slate-300 bg-white px-3 text-left"
          >
            <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${selected ? "bg-golden-dark" : "bg-slate-300"}`} aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-slate-900">{selected ? selected.company_name : "Choose a license"}</span>
              <span className="block truncate text-xs text-slate-500">
                {selected ? `${selected.license_number}${distanceLabel(selected.where) ? ` · ${distanceLabel(selected.where)}` : ""}` : `${licenses.length} licenses`}
              </span>
            </span>
            <ChevronDown className={`h-5 w-5 shrink-0 text-primary transition-transform ${dropOpen ? "rotate-180" : ""}`} />
          </button>
          {dropOpen && (
            <div className="absolute inset-x-0 top-full z-20 mt-2 space-y-2 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
              <Input aria-label="Search licenses" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search company or license" />
              <div className="max-h-[55dvh] space-y-1.5 overflow-y-auto">{shown.map((l) => listItem(l, true))}</div>
            </div>
          )}
        </div>

        {/* The map */}
        <div className={`relative isolate h-[calc(100vh-17rem)] min-h-[420px] flex-none overflow-hidden rounded-xl border border-slate-200 bg-slate-100 supports-[height:100dvh]:h-[calc(100dvh-17rem)] lg:h-auto lg:flex-1 ${max.frameClass}`}>
          <LicenseMap
            className="absolute inset-0"
            ariaLabel={selected && zoomed ? `Map zoomed to ${selected.company_name}, ${selected.license_number}` : `Map of your team's ${mapLicenses.length} license areas`}
            licenses={mapLicenses}
            selectedId={selectedId}
            onSelect={choose}
            me={position}
            fit={zoomed && selected?.boundary ? "selected" : "all"}
            recenterKey={recenter}
          />

          {zoomed && selected && (
            <button
              type="button"
              onClick={() => setZoomed(false)}
              className="absolute left-3 top-3 z-10 min-h-10 rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-semibold text-primary shadow-md"
            >
              Show all licenses
            </button>
          )}
          <button
            type="button"
            onClick={() => setRecenter((n) => n + 1)}
            disabled={!position}
            aria-label="Show my position"
            title={error ?? "Show my position"}
            className="absolute right-3 top-[86px] z-10 flex h-11 w-11 items-center justify-center rounded-full border border-slate-300 bg-white text-primary shadow-md disabled:opacity-50"
          >
            <Crosshair className="h-5 w-5" />
          </button>
          <MapMaximizeButton {...max} className="absolute right-3 top-[140px] z-10" />

          {/* PC: the chosen license on the map */}
          {selected && <div className="absolute right-16 top-3 z-10 hidden w-[330px] space-y-3 rounded-xl bg-white p-4 shadow-xl lg:block">{details}</div>}

          {/* Phone: the chosen license at the bottom */}
          <div className="absolute inset-x-0 bottom-0 z-10 space-y-3 rounded-t-2xl bg-white px-4 pb-4 pt-3 shadow-[0_-8px_24px_rgba(0,0,0,0.12)] lg:hidden">
            {details ?? (
              <p className="flex items-center gap-2 text-sm text-slate-600">
                <MapPin className="h-4 w-4 text-golden-dark" /> Choose a license above, or tap an area on the map.
              </p>
            )}
          </div>
        </div>
      </div>

      {withoutArea.length > 0 && (
        <p className="text-sm text-slate-500">
          Not on the map (no surveyed area yet): {withoutArea.map((l) => `${l.company_name} (${l.license_number})`).join(", ")}.
        </p>
      )}
    </div>
  );
}
