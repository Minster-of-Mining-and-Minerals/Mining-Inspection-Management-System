/**
 * License areas on the map: the surveyed boundary (GeoJSON, [lng, lat] in WGS 84 — the same
 * system as the phone's GPS) and where the inspector is relative to it.
 */

export type LngLat = [number, number];
export interface LicenseBoundary {
  type: "MultiPolygon" | "Polygon";
  coordinates: LngLat[][][] | LngLat[][];
}

/** Where the inspector is relative to a license area. */
export interface SitePosition {
  inside: boolean;
  /** Metres to the nearest edge (outside: how far away the area is) */
  distanceM: number;
  /** Compass direction from the inspector to the nearest edge, e.g. "south-west" (outside only) */
  direction: string | null;
}

const polygonsOf = (g: LicenseBoundary): LngLat[][][] => (g.type === "Polygon" ? [g.coordinates as LngLat[][]] : (g.coordinates as LngLat[][][]));

const inRing = (lng: number, lat: number, ring: LngLat[]) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

export const insideArea = (lat: number, lng: number, g: LicenseBoundary) =>
  polygonsOf(g).some(([outer, ...holes]) => inRing(lng, lat, outer) && !holes.some((h) => inRing(lng, lat, h)));

const DIRECTIONS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];

/** Position of a GPS point relative to the area (flat local projection: accurate for the km range). */
export const positionInArea = (lat: number, lng: number, g: LicenseBoundary): SitePosition => {
  const kx = 111320 * Math.cos((lat * Math.PI) / 180);
  const ky = 110574;
  let best = Infinity;
  let bx = 0;
  let by = 0;
  for (const poly of polygonsOf(g))
    for (const ring of poly)
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const ax = (ring[j][0] - lng) * kx, ay = (ring[j][1] - lat) * ky;
        const cx = (ring[i][0] - lng) * kx, cy = (ring[i][1] - lat) * ky;
        const dx = cx - ax, dy = cy - ay;
        const len2 = dx * dx + dy * dy;
        const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
        const px = ax + t * dx, py = ay + t * dy;
        const d = Math.hypot(px, py);
        if (d < best) [best, bx, by] = [d, px, py];
      }
  const inside = insideArea(lat, lng, g);
  const bearing = (Math.atan2(bx, by) * 180) / Math.PI; // 0 = north, clockwise
  return { inside, distanceM: Math.round(best), direction: inside ? null : DIRECTIONS[Math.round(((bearing + 360) % 360) / 45) % 8] };
};

/** "850 m" / "2.4 km" / "31 km" */
export const distanceText = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : m < 10000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 1000)} km`);

/** Great-circle distance in metres. */
export const distanceBetween = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const r = (d: number) => (d * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
};
