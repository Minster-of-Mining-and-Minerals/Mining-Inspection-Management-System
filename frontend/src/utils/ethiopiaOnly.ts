/**
 * Maps show Ethiopia only:
 *   - the view can't be moved away from Ethiopia or zoomed out further than the whole country;
 *   - everything outside the border is covered (light grey), the border drawn on top.
 * The outline (public/maps/ethiopia-outline.json) is the regions of the official boundaries
 * merged into one; it is built by backend/scripts/build-country-outline.js.
 */
import type * as Leaflet from "leaflet";

interface Outline {
  bbox: [number, number, number, number]; // west, south, east, north
  outline: { type: "MultiPolygon"; coordinates: [number, number][][][] };
}

// Ethiopia's extent, used until (or if) the outline file can't be loaded
const FALLBACK_BBOX: Outline["bbox"] = [32.99, 3.4, 47.99, 14.85];
const MASK_COLOUR = "#E9ECE6";

let loading: Promise<Outline | null> | null = null;
const loadOutline = () =>
  (loading ??= fetch("/maps/ethiopia-outline.json")
    .then((r) => (r.ok ? (r.json() as Promise<Outline>) : null))
    .catch(() => null));

/** Lock the map to Ethiopia and grey out the rest. Call once, right after creating the map. */
export async function showOnlyEthiopia(L: typeof Leaflet, map: Leaflet.Map) {
  const lockTo = (bbox: Outline["bbox"]) => {
    const [w, s, e, n] = bbox;
    const bounds = L.latLngBounds([s, w], [n, e]);
    map.options.maxBoundsViscosity = 1;
    map.setMaxBounds(bounds.pad(0.08));
    // Not further out than the whole country (recomputed when the map changes size)
    const limitZoom = () => map.setMinZoom(Math.max(4, map.getBoundsZoom(bounds.pad(0.02))));
    limitZoom();
    map.on("resize", limitZoom);
  };

  lockTo(FALLBACK_BBOX);
  const data = await loadOutline();
  // The map may have been closed while the outline was loading
  if (!data || !(map as unknown as { _loaded?: boolean })._loaded || !map.getContainer().isConnected) return;
  lockTo(data.bbox);

  if (!map.getPane("ethiopiaMask")) {
    const pane = map.createPane("ethiopiaMask");
    pane.style.zIndex = "350"; // above the street map (200), below license areas and markers (400+)
    pane.style.pointerEvents = "none";
  }
  const world: [number, number][] = [
    [-85, -180],
    [-85, 180],
    [85, 180],
    [85, -180],
  ];
  const border = data.outline.coordinates.map((poly) => poly[0].map(([lng, lat]) => [lat, lng] as [number, number]));
  L.polygon([world, ...border], { pane: "ethiopiaMask", stroke: false, fillColor: MASK_COLOUR, fillOpacity: 1, interactive: false }).addTo(map);
  L.polygon(border, { pane: "ethiopiaMask", fill: false, color: "#073A55", weight: 1.5, opacity: 0.55, interactive: false }).addTo(map);
}
