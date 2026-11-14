"use client";

/**
 * Map of where inspections were submitted (the inspector's GPS on Submit):
 * red location pins (grouped when close together) or a heatmap of how many.
 * Leaflet + OpenStreetMap; loaded in the browser only.
 */
import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import type { MapPoint } from "@/redux/api/dashboardApi";
import { deviceLabel } from "@/utils/device";
import { showOnlyEthiopia } from "@/utils/ethiopiaOnly";

export type MapMode = "heat" | "points";

const ETHIOPIA: [number, number] = [9.1, 40.5];
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** A red location pin (the point of the pin is where the inspection was submitted). */
export const PIN_RED = "#dc2626";
const PIN_SVG = `<svg width="30" height="40" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,.4))">
  <path d="M15 1C7.3 1 1 7.2 1 14.9 1 25.3 15 39 15 39s14-13.7 14-24.1C29 7.2 22.7 1 15 1z" fill="${PIN_RED}" stroke="#ffffff" stroke-width="2"/>
  <circle cx="15" cy="15" r="5.2" fill="#ffffff"/>
</svg>`;

export const whenText = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { timeZone: "Africa/Addis_Ababa", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).replace(/\b(am|pm)\b/, (s) => s.toUpperCase());

const popupHtml = (p: MapPoint) => `<div style="min-width:210px;font:13px/1.45 system-ui,sans-serif">
    <div style="font-weight:700">${esc(p.submitted_by_name ?? "Unknown inspector")}</div>
    <div style="color:#64748b">${esc(p.team_name ?? "No team")}</div>
    <div style="margin-top:6px"><b>${esc(p.company_name)}</b></div>
    <div style="color:#64748b">${esc(p.license_number)} · ${esc(p.license_type)} · ${esc(p.form_name)}</div>
    <div style="margin-top:6px">📍 ${esc(p.place?.label ?? "Place not named")}${p.accuracy != null ? ` <span style="color:#64748b">(±${Math.round(p.accuracy)} m)</span>` : ""}</div>
    <div>📱 ${esc(deviceLabel(p.user_agent, p.platform))}</div>
    <div>🕒 ${esc(whenText(p.submitted_at))}${p.is_late ? ' · <span style="color:#b45309;font-weight:600">late</span>' : ""}</div>
    <a href="/inspections/${esc(p.inspection_id)}" style="display:inline-block;margin-top:6px;font-weight:600">Open inspection →</a>
  </div>`;

export default function SubmissionMap({ points, mode, focusId }: { points: MapPoint[]; mode: MapMode; focusId?: string | null }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const layer = useRef<any>(null);
  const markers = useRef(new Map<string, any>());
  const L = useRef<any>(null);
  const fitted = useRef("");

  // Create the map once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const leaflet = (await import("leaflet")).default;
      (window as any).L = leaflet; // the plugins attach themselves to window.L
      await import("leaflet.heat");
      await import("leaflet.markercluster");
      if (cancelled || !el.current || map.current) return;
      L.current = leaflet;
      map.current = leaflet.map(el.current, { center: ETHIOPIA, zoom: 6, minZoom: 5, maxZoom: 18, scrollWheelZoom: true });
      leaflet
        .tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        })
        .addTo(map.current);
      void showOnlyEthiopia(leaflet, map.current);
      draw();
    })();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Redraw when the points or the mode change
  const draw = () => {
    const leaflet = L.current;
    const m = map.current;
    if (!leaflet || !m) return;
    if (layer.current) m.removeLayer(layer.current);
    layer.current = null;
    markers.current.clear();
    if (!points.length) return;

    if (mode === "heat") {
      layer.current = (leaflet as any)
        .heatLayer(
          points.map((p) => [p.lat, p.lng, 1]),
          { radius: 26, blur: 20, minOpacity: 0.35, maxZoom: 13, gradient: { 0.25: "#3b82f6", 0.5: "#22c55e", 0.7: "#eab308", 0.9: "#f97316", 1: "#dc2626" } },
        )
        .addTo(m);
    } else {
      // Red location pins; nearby ones group into a red circle with the count
      const group = (leaflet as any).markerClusterGroup({
        showCoverageOnHover: false,
        maxClusterRadius: 45,
        spiderfyOnMaxZoom: true,
        iconCreateFunction: (cluster: any) => {
          const n = cluster.getChildCount();
          const size = n < 10 ? 34 : n < 100 ? 40 : 46;
          return leaflet.divIcon({
            html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${PIN_RED};border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);color:#fff;font:700 13px system-ui,sans-serif;display:flex;align-items:center;justify-content:center">${n}</div>`,
            className: "",
            iconSize: [size, size],
          });
        },
      });
      const pin = leaflet.divIcon({ html: PIN_SVG, className: "", iconSize: [30, 40], iconAnchor: [15, 39], popupAnchor: [0, -34] });
      for (const p of points) {
        const marker = leaflet.marker([p.lat, p.lng], { icon: pin, title: `${p.submitted_by_name ?? ""} · ${p.company_name}`, alt: `Inspection: ${p.company_name}` }).bindPopup(popupHtml(p));
        marker.addTo(group);
        markers.current.set(p.inspection_id, marker);
      }
      layer.current = group.addTo(m);
    }

    // Zoom to the points when the set changes (not when only the mode changes)
    const key = `${points.length}:${points[0]?.inspection_id}:${points[points.length - 1]?.inspection_id}`;
    if (fitted.current !== key) {
      fitted.current = key;
      m.fitBounds(leaflet.latLngBounds(points.map((p) => [p.lat, p.lng])).pad(0.15), { maxZoom: 12 });
    }
  };
  useEffect(draw, [points, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // A submission picked in the list: zoom to it and open its details
  useEffect(() => {
    const m = map.current;
    const leaflet = L.current;
    if (!focusId || !m || !leaflet) return;
    const id = focusId.split("#")[0]; // "id#n": picking the same one again still re-focuses
    const p = points.find((x) => x.inspection_id === id);
    if (!p) return;
    const marker = markers.current.get(id);
    if (marker && layer.current?.zoomToShowLayer) layer.current.zoomToShowLayer(marker, () => marker.openPopup());
    else {
      m.setView([p.lat, p.lng], Math.max(m.getZoom(), 14));
      leaflet.popup().setLatLng([p.lat, p.lng]).setContent(popupHtml(p)).openOn(m);
    }
  }, [focusId]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={el} className="relative isolate z-0 h-[50vh] min-h-[360px] w-full rounded-xl border border-slate-200 bg-slate-100" role="region" aria-label="Map of inspection submissions" />;
}
