"use client";

/**
 * The license area of an inspection task (design option A): the map fills the view, a label says
 * whether you are inside the area, and a panel at the bottom has the task, directions and Start.
 * For a submitted inspection the point where it was submitted is shown instead of your position.
 */
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Crosshair, MapPin, Plane, ShieldAlert } from "lucide-react";
import { usePosition } from "@/hooks/usePosition";
import type { TaskDetail } from "@/redux/types/inspection";
import { distanceText, positionInArea } from "@/utils/licenseArea";
import { dueText } from "./taskUi";

const LicenseMap = dynamic(() => import("@/features/my-work/component/LicenseMap"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 animate-pulse bg-slate-100" />,
});

const TONE = {
  inside: { chip: "border-green-300 bg-green-50 text-green-800", dot: "bg-green-600", panel: "bg-green-50 text-green-800" },
  outside: { chip: "border-orange-300 bg-orange-50 text-orange-900", dot: "bg-orange-600", panel: "bg-orange-50 text-orange-900" },
  unknown: { chip: "border-slate-300 bg-white text-slate-700", dot: "bg-slate-400", panel: "bg-slate-50 text-slate-700" },
};

export function SiteView({ task, onStart }: { task: TaskDetail; onStart?: () => void }) {
  const site = task.site;
  const boundary = site?.boundary ?? null;
  const submitted = task.status === "submitted";
  const live = usePosition(!submitted);
  const [recenter, setRecenter] = useState(0);

  // Submitted: where it was submitted; otherwise the phone's position now
  const sub = task.submit_location;
  const me = submitted ? (sub?.lat != null && sub?.lng != null ? { lat: sub.lat, lng: sub.lng, accuracy: sub.accuracy ?? 0 } : null) : live.position;
  const where = me && boundary ? positionInArea(me.lat, me.lng, boundary) : null;
  const tone = where ? (where.inside ? TONE.inside : TONE.outside) : TONE.unknown;
  const mapLicenses = useMemo(() => (boundary ? [{ id: task.license_id, label: task.license?.license_number ?? "", boundary }] : []), [boundary, task.license_id, task.license?.license_number]);

  const chip = !boundary
    ? "No surveyed area for this license"
    : where
      ? where.inside
        ? submitted ? "Submitted inside the area" : "Inside the license area"
        : `${distanceText(where.distanceM)} ${submitted ? "from the area" : "outside the area"}`
      : submitted ? "No location was recorded" : live.error ?? "Finding your position…";
  const title = !where
    ? chip
    : where.inside
      ? submitted ? "Submitted inside the license area" : "You are inside the license area"
      : submitted ? `Submitted ${distanceText(where.distanceM)} from the license area` : `You are ${distanceText(where.distanceM)} outside the license area`;
  const note = !where
    ? boundary ? "" : "The license is not in the coordinate list yet."
    : where.inside
      ? submitted ? `Location accuracy ±${me?.accuracy ?? "?"} m` : `GPS accuracy ±${me?.accuracy ?? "?"} m`
      : submitted
        ? "Recorded for the supervisor."
        : `Head ${where.direction}. You can still fill in the checklist; where you submit is recorded.`;

  return (
    <div className="relative isolate h-[calc(100vh-15rem)] min-h-[540px] overflow-hidden rounded-xl border border-slate-200 bg-slate-100 supports-[height:100dvh]:h-[calc(100dvh-15rem)]">
      {boundary ? (
        <LicenseMap
          className="absolute inset-0"
          ariaLabel={`Map of license ${task.license?.license_number ?? ""}${where ? `: ${title}` : ""}`}
          licenses={mapLicenses}
          selectedId={task.license_id}
          me={me}
          fit="selected"
          recenterKey={recenter}
          bottomPadding={260}
        />
      ) : (
        <div className="flex h-full items-start justify-center p-10 text-center text-sm text-slate-500">
          <p className="max-w-sm">
            <MapPin className="mx-auto mb-2 h-8 w-8 text-slate-300" />
            This license has no surveyed area yet, so it can&apos;t be shown on the map.
          </p>
        </div>
      )}

      {/* Status label */}
      <div className={`absolute left-3 top-3 z-10 flex max-w-[calc(100%-5rem)] items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-semibold shadow-sm ${tone.chip}`} role="status">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${tone.dot}`} aria-hidden="true" />
        <span className="truncate">{chip}</span>
      </div>
      {boundary && !submitted && (
        <button
          type="button"
          onClick={() => setRecenter((n) => n + 1)}
          disabled={!me}
          aria-label="Centre on my position"
          title="Centre on my position"
          className="absolute right-3 top-[86px] z-10 flex h-11 w-11 items-center justify-center rounded-full border border-slate-300 bg-white text-primary shadow-md disabled:opacity-50"
        >
          <Crosshair className="h-5 w-5" />
        </button>
      )}

      {/* Bottom panel */}
      <div className="absolute inset-x-0 bottom-0 z-10 space-y-3 rounded-t-2xl bg-white px-4 pb-4 pt-2 shadow-[0_-8px_24px_rgba(0,0,0,0.12)]">
        <div className="mx-auto h-1.5 w-10 rounded-full bg-slate-300" aria-hidden="true" />
        {(where || note) && (
          <div className={`flex items-start gap-3 rounded-xl p-3 ${tone.panel}`}>
            <MapPin className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-bold">{title}</p>
              {note && <p className="text-sm">{note}</p>}
            </div>
          </div>
        )}
        <div className="space-y-0.5">
          <p className="font-bold text-slate-900">{task.company?.name}</p>
          <p className="text-sm text-slate-600">
            {task.license?.license_number} · {task.license?.license_type}
            {task.license?.site_name ? ` · ${task.license.site_name}` : ""}
          </p>
          <p className="text-sm text-slate-600">
            {task.form?.name} · due by end of {dueText(task.due_at)}
          </p>
          {site?.travel_mode === "plane" && (
            <p className="flex items-center gap-1.5 text-sm text-slate-600">
              <Plane className="h-4 w-4" /> By plane{site.airport ? ` via ${site.airport}` : ""}
            </p>
          )}
          {site?.notes && /red\s*zone/i.test(site.notes) && (
            <p className="flex items-center gap-1.5 text-sm font-semibold text-red-700">
              <ShieldAlert className="h-4 w-4" /> {site.notes}
            </p>
          )}
        </div>
        {onStart && (
          <button type="button" onClick={onStart} className="flex min-h-12 w-full items-center justify-center rounded-lg bg-primary text-sm font-semibold text-white">
            {task.status === "todo" ? "Start inspection" : submitted ? "See the answers" : "Continue inspection"}
          </button>
        )}
      </div>
    </div>
  );
}
