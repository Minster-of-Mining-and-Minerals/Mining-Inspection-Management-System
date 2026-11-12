"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Flame, MapPin } from "lucide-react";
import { useGetSubmissionMapQuery, MapFilters } from "@/redux/api/dashboardApi";
import { PIN_RED, whenText, type MapMode } from "./SubmissionMap";
import Link from "next/link";
import { Laptop, Search, Smartphone, Tablet } from "lucide-react";
import type { MapPoint } from "@/redux/api/dashboardApi";
import { deviceKind, deviceLabel } from "@/utils/device";

const SubmissionMap = dynamic(() => import("./SubmissionMap"), {
  ssr: false,
  loading: () => <div className="h-[480px] w-full animate-pulse rounded-xl border border-slate-200 bg-slate-100 sm:h-[560px]" />,
});

const PREF_KEY = "mims.dashboard.map.view";
const selectClass = "h-9 min-w-0 rounded-md border border-input bg-white px-2 text-sm";

/**
 * Where inspections were submitted, as a heatmap or points. Uses the dashboard's filters
 * (`base`: period, team, form …) plus its own: on time / late, imprecise points.
 */
export default function SubmissionMapPanel({ base }: { base: MapFilters }) {
  const [mode, setMode] = useState<MapMode>("points");
  const [late, setLate] = useState("");
  const [showImprecise, setShowImprecise] = useState(false);
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null);

  useEffect(() => {
    try {
      const m = window.localStorage.getItem(PREF_KEY);
      if (m === "heat" || m === "points") setMode(m);
    } catch {
      /* preference only */
    }
  }, []);
  const changeMode = (m: MapMode) => {
    setMode(m);
    try {
      window.localStorage.setItem(PREF_KEY, m);
    } catch {
      /* preference only */
    }
  };

  const params = useMemo<MapFilters>(() => {
    return { ...base, late: late || undefined, max_accuracy: showImprecise ? 0 : 500 };
  }, [base, late, showImprecise]);
  const { data, isFetching, isError } = useGetSubmissionMapQuery(params);
  const c = data?.counts;

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4" aria-labelledby="map-title">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 id="map-title" className="font-semibold text-slate-900">
            Where inspections were submitted
          </h2>
          <p className="text-xs text-slate-500">The inspector’s phone location when they pressed Submit.</p>
        </div>
        <div className="flex rounded-lg bg-slate-100 p-1 text-sm" role="group" aria-label="Map view">
          {(
            [
              ["points", "Points", MapPin],
              ["heat", "Heatmap", Flame],
            ] as const
          ).map(([m, label, Icon]) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => changeMode(m)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium ${mode === m ? "bg-white text-primary shadow-sm" : "text-slate-600"}`}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="On time or late" className={`${selectClass} ${late ? "border-primary text-primary" : ""}`} value={late} onChange={(e) => setLate(e.target.value)}>
          <option value="">On time and late</option>
          <option value="false">On time only</option>
          <option value="true">Late only</option>
        </select>
        <label className="flex items-center gap-1.5 text-sm text-slate-600">
          <input type="checkbox" className="h-4 w-4 accent-primary" checked={showImprecise} onChange={(e) => setShowImprecise(e.target.checked)} />
          Include imprecise points (over ±500 m)
        </label>
      </div>

      <p className="text-sm text-slate-600" aria-live="polite">
        {isError ? (
          <span className="text-red-600">Could not load the map data.</span>
        ) : c ? (
          <>
            <b className="text-slate-900">{c.submitted}</b> submitted inspection{c.submitted === 1 ? "" : "s"} · <b className="text-slate-900">{c.on_map}</b> on the map
            {c.no_location > 0 && <> · {c.no_location} without a location (permission refused or no GPS)</>}
            {c.low_accuracy > 0 && !showImprecise && <> · {c.low_accuracy} imprecise, hidden</>}
            {c.limited && " · showing the latest 10,000"}
            {isFetching && " · updating…"}
          </>
        ) : (
          "Loading…"
        )}
      </p>

      {/* Half the width: the map, and the submissions on it */}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="relative isolate z-0">
          <SubmissionMap points={data?.points ?? []} mode={mode} focusId={focus ? `${focus.id}#${focus.n}` : null} />
          {c && c.on_map === 0 && !isFetching && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <p className="rounded-lg bg-white/90 px-4 py-2 text-sm text-slate-600 shadow">No submissions with a location for these filters.</p>
            </div>
          )}
        </div>
        <SubmissionList
          points={data?.points ?? []}
          activeId={focus?.id}
          onPick={(id) => {
            if (mode !== "points") changeMode("points");
            setFocus({ id, n: (focus?.n ?? 0) + 1 });
          }}
        />
      </div>

      {mode === "heat" ? (
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <span>Fewer</span>
          <span className="h-2 w-40 rounded-full" style={{ background: "linear-gradient(90deg,#3b82f6,#22c55e,#eab308,#f97316,#dc2626)" }} aria-hidden />
          <span>More inspections</span>
        </div>
      ) : (
        <ul className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-600" aria-label="Map legend">
          <li className="flex items-center gap-1.5">
            <MapPin className="h-4 w-4" style={{ color: PIN_RED }} fill={PIN_RED} stroke="#fff" aria-hidden /> One submitted inspection (click for details)
          </li>
          <li className="flex items-center gap-1.5">
            <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-white text-[10px] font-bold text-white shadow" style={{ background: PIN_RED }} aria-hidden>
              3
            </span>
            Several close together; zoom in or click to see them
          </li>
        </ul>
      )}
    </section>
  );
}

/** The submissions on the map: who, which company, when, where (place name) and on what device. */
function SubmissionList({ points, activeId, onPick }: { points: MapPoint[]; activeId?: string; onPick: (id: string) => void }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t
      ? points.filter((p) => [p.submitted_by_name, p.company_name, p.license_number, p.team_name, p.place?.label, deviceLabel(p.user_agent, p.platform)].some((x) => x?.toLowerCase().includes(t)))
      : points;
  }, [points, q]);
  const DeviceIcon = ({ ua }: { ua: string | null }) => {
    const k = deviceKind(ua);
    const Icon = k === "phone" ? Smartphone : k === "tablet" ? Tablet : Laptop;
    return <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />;
  };
  return (
    <div className="flex h-[50vh] min-h-[360px] flex-col overflow-hidden rounded-xl border border-slate-200">
      <div className="flex items-center gap-2 border-b bg-slate-50 px-3 py-2">
        <h3 className="text-sm font-semibold text-slate-900">Submissions</h3>
        <span className="text-xs text-slate-500">{shown.length}</span>
        <div className="relative ml-auto w-44 sm:w-56">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            aria-label="Search submissions"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Inspector, company, place…"
            className="h-8 w-full rounded-md border border-input bg-white pl-8 pr-2 text-xs"
          />
        </div>
      </div>
      {shown.length ? (
        <ul className="flex-1 divide-y overflow-y-auto">
          {shown.map((p) => (
            <li key={p.inspection_id}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => onPick(p.inspection_id)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onPick(p.inspection_id))}
                className={`grid cursor-pointer gap-0.5 px-3 py-2.5 text-sm hover:bg-slate-50 focus:bg-slate-50 focus:outline-none ${activeId === p.inspection_id ? "bg-red-50/60" : ""}`}
                aria-label={`Show ${p.submitted_by_name ?? "submission"} at ${p.company_name} on the map`}
              >
                <span className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 shrink-0" style={{ color: PIN_RED }} aria-hidden />
                  <span className="min-w-0 flex-1 truncate font-semibold text-slate-900">{p.submitted_by_name ?? "Unknown inspector"}</span>
                  <span className="shrink-0 text-xs text-slate-500">{whenText(p.submitted_at)}</span>
                </span>
                <span className="truncate pl-6 text-slate-700">
                  {p.company_name} <span className="text-slate-400">· {p.team_name ?? "No team"}</span>
                </span>
                <span className="truncate pl-6 text-xs text-slate-600">
                  {p.place?.label ?? "Place not named yet"}
                  {p.accuracy != null && <span className="text-slate-400"> · ±{Math.round(p.accuracy)} m</span>}
                </span>
                <span className="flex items-center gap-1.5 pl-6 text-xs text-slate-500">
                  <DeviceIcon ua={p.user_agent} />
                  <span className="truncate">{deviceLabel(p.user_agent, p.platform)}</span>
                  <span className="ml-auto" />
                  <Link href={`/inspections/${p.inspection_id}`} onClick={(e) => e.stopPropagation()} className="shrink-0 font-medium text-primary hover:underline">
                    Open
                  </Link>
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="flex flex-1 items-center justify-center px-4 text-center text-sm text-slate-500">{points.length ? "No submissions match." : "No submissions with a location for these filters."}</p>
      )}
    </div>
  );
}
