"use client";

/**
 * Enter a license's surveyed area (its corner points) in the system, instead of the coordinate
 * list. Points are pasted or typed one per line, in degrees-minutes-seconds or decimal, on the
 * Adindan datum (as on the license certificates) or WGS 84 (GPS, Google Maps). A map shows the
 * area as it will be saved. Saving changes only this license's area and location: never its team.
 */
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { AlertTriangle, MapPin, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useGetLicenseAreaQuery, useSetLicenseAreaMutation } from "@/redux/api/companyApi";
import type { CompanyLicense, LicenseArea } from "@/redux/types/company";
import type { LicenseBoundary, LngLat } from "@/utils/licenseArea";
import { adindanToWgs84, inEthiopia, parsePointLines } from "@/utils/coordinates";

const LicenseMap = dynamic(() => import("@/features/my-work/component/LicenseMap"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 animate-pulse bg-slate-100" />,
});

type Datum = "adindan" | "wgs84";

/** The stored area as text: one decimal WGS 84 point per line, a blank line between parts. */
const boundaryText = (b: LicenseBoundary | null | undefined) => {
  if (!b) return "";
  const polys = (b.type === "Polygon" ? [b.coordinates] : b.coordinates) as LngLat[][][];
  return polys
    .map((poly) => {
      const ring = poly[0] ?? [];
      const pts = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring;
      return pts.map(([lng, lat]) => `${lat.toFixed(6)}, ${lng.toFixed(6)}`).join("\n");
    })
    .join("\n\n");
};

export function LicenseAreaDialog({ license, companyId, onClose }: { license: CompanyLicense; companyId: string; onClose: () => void }) {
  const { data: current, isLoading, isError } = useGetLicenseAreaQuery(license.license_id);
  if (isLoading || isError)
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-primary">License area · {license.license_number}</DialogTitle>
            <DialogDescription>{isError ? "Could not load the license area." : "Loading…"}</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  return <AreaEditor license={license} companyId={companyId} current={current ?? null} onClose={onClose} />;
}

function AreaEditor({ license, companyId, current, onClose }: { license: CompanyLicense; companyId: string; current: LicenseArea | null; onClose: () => void }) {
  const [setArea, { isLoading: saving }] = useSetLicenseAreaMutation();
  // An existing area opens as its WGS 84 points, ready to correct
  const [datum, setDatum] = useState<Datum>(current?.boundary ? "wgs84" : "adindan");
  const [text, setText] = useState(() => boundaryText(current?.boundary));
  const [confirmRemove, setConfirmRemove] = useState(false);

  const parsed = useMemo(() => parsePointLines(text), [text]);
  const outside = useMemo(() => {
    const list: string[] = [];
    parsed.parts.forEach((p, pi) => p.forEach((pt, i) => !inEthiopia(pt.lat, pt.lng) && list.push(`Part ${pi + 1}, point ${i + 1}`)));
    return list;
  }, [parsed]);
  const shortParts = parsed.parts.map((p, i) => (p.length < 3 ? i + 1 : 0)).filter(Boolean);

  // The area as it will be saved (WGS 84), for the map
  const preview = useMemo<LicenseBoundary | null>(() => {
    const polys = parsed.parts
      .filter((p) => p.length >= 3)
      .map((p) => {
        const ring: LngLat[] = p.map((pt) => {
          const [la, ln] = datum === "adindan" ? adindanToWgs84(pt.lat, pt.lng) : [pt.lat, pt.lng];
          return [ln, la];
        });
        ring.push([...ring[0]] as LngLat);
        return [ring];
      });
    return polys.length ? { type: "MultiPolygon", coordinates: polys } : null;
  }, [parsed, datum]);
  const shown = preview ?? current?.boundary ?? null;
  const mapLicenses = useMemo(() => (shown ? [{ id: license.license_id, label: license.license_number, boundary: shown }] : []), [shown, license.license_id, license.license_number]);
  // A new key whenever the previewed area changes, so the map fits it again
  const refit = useMemo(() => (preview ? Math.round(JSON.stringify(preview.coordinates).length + (preview.coordinates.flat(3) as number[]).reduce((a, b) => a + b, 0) * 1e4) : 0), [preview]);

  const points = parsed.parts.reduce((n, p) => n + p.length, 0);
  const canSave = !!preview && !parsed.bad.length && !outside.length && !shortParts.length && !saving;

  const save = async () => {
    try {
      const r = await setArea({ licenseId: license.license_id, companyId, body: { datum, parts: parsed.parts } }).unwrap();
      toast.success(r.message || "License area saved.");
      onClose();
    } catch (e) {
      toast.error((e as { data?: { message?: string } })?.data?.message || "Could not save the license area.");
    }
  };
  const remove = async () => {
    try {
      const r = await setArea({ licenseId: license.license_id, companyId, body: { clear: true } }).unwrap();
      toast.success(r.message || "The license area was removed.");
      onClose();
    } catch (e) {
      toast.error((e as { data?: { message?: string } })?.data?.message || "Could not remove the area.");
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="max-h-[94vh] w-[96vw] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="text-primary">License area · {license.license_number}</DialogTitle>
          <DialogDescription>
            The corner points of the license area. They set the area on the maps, the &ldquo;inside the license area&rdquo; check, and the license&apos;s woreda, zone and
            region. The team and its inspections don&apos;t change.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 lg:grid-cols-2">
          <div className="min-w-0 space-y-3">
            {current?.boundary && (
              <p className="flex items-start gap-1.5 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>
                  Current area{current.areas.length ? `: ${current.areas.map((a) => a.name).join(", ")}` : ""}. Its points are below in WGS84; correct them or paste new ones.
                </span>
              </p>
            )}

            <fieldset>
              <legend className="mb-1.5 text-sm font-semibold text-slate-800">Coordinate system</legend>
              <div role="radiogroup" className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
                {(
                  [
                    ["adindan", "Adindan", "as on the license certificate"],
                    ["wgs84", "WGS84", "GPS, Google Maps"],
                  ] as const
                ).map(([k, label, hint]) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={datum === k}
                    onClick={() => setDatum(k)}
                    className={`rounded-md px-2 py-1.5 text-left ${datum === k ? "bg-white shadow-sm" : "hover:bg-white/60"}`}
                  >
                    <span className={`block text-sm font-semibold ${datum === k ? "text-primary" : "text-slate-700"}`}>{label}</span>
                    <span className="block text-[11px] text-slate-500">{hint}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="space-y-1">
              <label htmlFor="area-points" className="text-sm font-semibold text-slate-800">
                Corner points
              </label>
              <p className="text-xs text-slate-500">
                One point per line, in order around the area. Paste from Excel or type: degrees-minutes-seconds <code className="rounded bg-slate-100 px-1">9 01 48.4 38 44 48.5</code> or
                decimal <code className="rounded bg-slate-100 px-1">9.030100, 38.746800</code> (latitude first). A blank line starts another part.
              </p>
              <textarea
                id="area-points"
                rows={11}
                value={text}
                onChange={(e) => setText(e.target.value)}
                spellCheck={false}
                placeholder={"9 01 48.4   38 44 48.5\n9 02 10.1   38 45 30.0\n9 01 20.7   38 46 02.3\n9 00 55.2   38 44 59.9"}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <p className="text-xs text-slate-600" aria-live="polite">
                {points ? `${points} point${points === 1 ? "" : "s"} in ${parsed.parts.length} part${parsed.parts.length === 1 ? "" : "s"}` : "No points yet"}
              </p>
            </div>

            {(parsed.bad.length > 0 || outside.length > 0 || shortParts.length > 0) && (
              <div role="alert" className="space-y-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {parsed.bad.length > 0 && (
                  <p className="flex gap-1.5">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> Line{parsed.bad.length === 1 ? "" : "s"} {parsed.bad.slice(0, 8).join(", ")}: not a point (needs 2 decimal numbers or 6 for
                    degrees-minutes-seconds).
                  </p>
                )}
                {outside.length > 0 && (
                  <p className="flex gap-1.5">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> Outside Ethiopia: {outside.slice(0, 5).join("; ")}. Check the numbers (latitude first).
                  </p>
                )}
                {shortParts.length > 0 && (
                  <p className="flex gap-1.5">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> Part {shortParts.join(", ")}: needs at least 3 points.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-slate-800">{preview ? "Preview: the area as it will be saved" : current?.boundary ? "Current area" : "Preview"}</p>
            <div className="relative isolate h-80 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 lg:h-[420px]">
              {shown ? (
                <LicenseMap className="absolute inset-0" ariaLabel={`Map of license ${license.license_number}`} licenses={mapLicenses} selectedId={license.license_id} fit="selected" recenterKey={refit} />
              ) : (
                <p className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-500">Paste or type at least 3 points to see the area here.</p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <div>
            {current?.boundary &&
              (confirmRemove ? (
                <span className="flex flex-wrap items-center gap-2 text-sm">
                  Remove the area?
                  <Button variant="destructive" size="sm" onClick={remove} disabled={saving}>
                    Yes, remove
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmRemove(false)} disabled={saving}>
                    No
                  </Button>
                </span>
              ) : (
                <Button variant="ghost" className="gap-1.5 text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => setConfirmRemove(true)} disabled={saving}>
                  <Trash2 className="h-4 w-4" /> Remove area
                </Button>
              ))}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={!canSave}>
              {saving ? "Saving…" : "Save area"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
