"use client";

/**
 * License areas on a map (Leaflet + OpenStreetMap), with the inspector's position.
 *   - each license: navy outline; the selected one gold; a tap selects it
 *   - the inspector: a blue dot with the GPS accuracy around it
 * Loaded in the browser only (import it with next/dynamic, ssr: false).
 */
import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import type { LicenseBoundary } from "@/utils/licenseArea";
import type { Position } from "@/hooks/usePosition";
import { showOnlyEthiopia } from "@/utils/ethiopiaOnly";

export interface MapLicense {
  id: string;
  /** Short label drawn on the area, e.g. the company name */
  label: string;
  boundary: LicenseBoundary;
  /** Fill colour (e.g. by team or score); default navy, and gold when selected */
  color?: string;
}

interface Props {
  licenses: MapLicense[];
  selectedId?: string | null;
  /** More areas to highlight with the selected one (e.g. all licenses of a company) */
  highlightIds?: string[];
  onSelect?: (id: string) => void;
  /** Zoom to these areas (takes precedence over fit) */
  focusIds?: string[];
  me?: Position | null;
  /** Zoom to every area, or to the selected one (and the inspector when close) */
  fit?: "all" | "selected";
  /** Change it to move the map to the inspector's position */
  recenterKey?: number;
  /** Space kept free at the bottom for a panel over the map (px) */
  bottomPadding?: number;
  ariaLabel: string;
  className?: string;
}

type LeafletModule = typeof Leaflet;

const ETHIOPIA: [number, number] = [9.1, 40.5];
const NAVY = "#073A55";
const GOLD = "#B88F14";
const BLUE = "#2563EB";

const styleOf = (selected: boolean, color?: string): Leaflet.PathOptions => {
  if (color) return selected ? { color: "#14212B", weight: 3, fillColor: color, fillOpacity: 0.6 } : { color, weight: 1.6, fillColor: color, fillOpacity: 0.32 };
  return selected ? { color: GOLD, weight: 3, fillColor: "#E8C468", fillOpacity: 0.35 } : { color: NAVY, weight: 1.6, fillColor: NAVY, fillOpacity: 0.14 };
};

const asFeature = (boundary: LicenseBoundary) => ({ type: "Feature" as const, properties: {}, geometry: boundary as unknown as GeoJSON.Geometry });

/**
 * Zoomed out further than this, license areas (a few km across) are smaller than a pixel, so each
 * license is also shown as a dot. From this zoom on the areas themselves are visible.
 */
const DOT_MAX_ZOOM = 10;

const dotStyle = (selected: boolean, color?: string): Leaflet.CircleMarkerOptions => ({
  radius: selected ? 8 : 6,
  color: selected ? (color ? "#14212B" : "#6E5208") : "#FFFFFF",
  weight: selected ? 2.5 : 1.5,
  fillColor: selected && !color ? GOLD : color ?? NAVY,
  fillOpacity: 0.95,
});

/** Draw the license areas (and their dots) into fresh layers. */
function drawAreas(
  L: LeafletModule,
  map: Leaflet.Map,
  old: { areas: Leaflet.LayerGroup; dots: Leaflet.LayerGroup } | null,
  licenses: MapLicense[],
  highlighted: Set<string>,
  onSelect: (id: string) => void,
) {
  if (old) {
    map.removeLayer(old.areas);
    map.removeLayer(old.dots);
  }
  const areas = L.layerGroup();
  const dots = L.layerGroup();
  const front: Leaflet.Layer[] = [];
  for (const lic of licenses) {
    const on = highlighted.has(lic.id);
    const shape = L.geoJSON(asFeature(lic.boundary), { style: () => styleOf(on, lic.color) });
    shape.bindTooltip(lic.label, { permanent: licenses.length <= 25 || on, direction: "center", className: "license-area-label" });
    shape.on("click", () => onSelect(lic.id));
    shape.addTo(areas);
    const dot = L.circleMarker(shape.getBounds().getCenter(), dotStyle(on, lic.color));
    dot.bindTooltip(lic.label, { direction: "top", offset: [0, -6] });
    dot.on("click", () => onSelect(lic.id));
    dot.addTo(dots);
    if (on) front.push(shape, dot);
  }
  areas.addTo(map);
  if (map.getZoom() < DOT_MAX_ZOOM) dots.addTo(map);
  for (const layer of front) (layer as Leaflet.Path | Leaflet.GeoJSON).bringToFront();
  return { areas, dots };
}

/** Draw the blue dot and its accuracy circle. */
function drawMe(L: LeafletModule, map: Leaflet.Map, old: Leaflet.LayerGroup | null, me: Position | null | undefined) {
  if (old) map.removeLayer(old);
  if (!me) return null;
  return L.layerGroup([
    L.circle([me.lat, me.lng], { radius: Math.max(me.accuracy, 5), color: BLUE, weight: 1, fillColor: BLUE, fillOpacity: 0.12, interactive: false }),
    L.circleMarker([me.lat, me.lng], { radius: 7, color: "#FFFFFF", weight: 2.5, fillColor: BLUE, fillOpacity: 1, interactive: false }),
  ]).addTo(map);
}

export default function LicenseMap({ licenses, selectedId, highlightIds, onSelect, focusIds, me, fit = "all", recenterKey = 0, bottomPadding = 0, ariaLabel, className }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const lib = useRef<LeafletModule | null>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const areas = useRef<{ areas: Leaflet.LayerGroup; dots: Leaflet.LayerGroup } | null>(null);
  const meLayer = useRef<Leaflet.LayerGroup | null>(null);
  const fitted = useRef("");
  const onSelectRef = useRef(onSelect);
  // The map is created asynchronously (Leaflet loads in the browser only)
  const [ready, setReady] = useState(false);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // Create the map once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default as unknown as LeafletModule;
      if (cancelled || !el.current || map.current) return;
      lib.current = L;
      const m = L.map(el.current, { center: ETHIOPIA, zoom: 6, minZoom: 5, maxZoom: 18, zoomControl: false });
      L.control.zoom({ position: "topright" }).addTo(m);
      L.control.scale({ imperial: false, position: "bottomleft" }).addTo(m);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(m);
      map.current = m;
      void showOnlyEthiopia(L, m);
      // Dots while zoomed out, the areas themselves when zoomed in
      m.on("zoomend", () => {
        const dots = areas.current?.dots;
        if (!dots) return;
        if (m.getZoom() < DOT_MAX_ZOOM) {
          if (!m.hasLayer(dots)) dots.addTo(m);
        } else if (m.hasLayer(dots)) m.removeLayer(dots);
      });
      setReady(true);
    })();
    const resize = new ResizeObserver(() => map.current?.invalidateSize());
    if (el.current) resize.observe(el.current);
    return () => {
      cancelled = true;
      resize.disconnect();
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // License areas, and the zoom when the set or the selection changes
  useEffect(() => {
    const L = lib.current;
    const m = map.current;
    if (!ready || !L || !m) return;
    const highlighted = new Set([...(highlightIds ?? []), ...(selectedId ? [selectedId] : [])]);
    areas.current = drawAreas(L, m, areas.current, licenses, highlighted, (id) => onSelectRef.current?.(id));
    const focus = focusIds?.length ? licenses.filter((l) => focusIds.includes(l.id)) : null;
    const target = focus?.length ? focus : fit === "selected" && selectedId ? licenses.filter((l) => l.id === selectedId) : licenses;
    const key = `${focus?.length ? "focus" : fit}:${target.map((l) => l.id).join(",")}`;
    if (!target.length || fitted.current === key) return;
    fitted.current = key;
    const collection: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: target.map((l) => asFeature(l.boundary)) };
    let bounds = L.geoJSON(collection).getBounds();
    // At a single site, show the inspector too when they are near
    if (fit === "selected" && me && bounds.pad(2).contains([me.lat, me.lng])) bounds = bounds.extend([me.lat, me.lng]);
    m.fitBounds(bounds, { paddingTopLeft: [24, 70], paddingBottomRight: [24, 24 + bottomPadding], maxZoom: 15 });
  }, [ready, licenses, selectedId, highlightIds, focusIds, fit, bottomPadding, me]);

  // The inspector's position
  useEffect(() => {
    const L = lib.current;
    const m = map.current;
    if (!ready || !L || !m) return;
    meLayer.current = drawMe(L, m, meLayer.current, me);
  }, [ready, me]);

  // "Show my position"
  useEffect(() => {
    if (recenterKey && me && map.current) map.current.setView([me.lat, me.lng], Math.max(map.current.getZoom(), 14));
  }, [recenterKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={el} role="region" aria-label={ariaLabel} className={className} />;
}

