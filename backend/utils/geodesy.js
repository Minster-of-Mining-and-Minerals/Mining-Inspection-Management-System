"use strict";
/**
 * Coordinates of license areas.
 *
 * The Ministry's coordinate list uses the Adindan datum (Clarke 1880 ellipsoid); phones give
 * WGS 84. The two differ by roughly 100–200 m in Ethiopia, so coordinates are converted before
 * they are stored or compared with a phone's position.
 *
 * Geometries are GeoJSON: [lng, lat] pairs; a MultiPolygon is [[[outer ring], …holes], …].
 */
const { pointInGeometry } = require("../services/geoService");

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

/** 13° 58' 44.46" → 13.97901… (null when not a number). */
const dmsToDecimal = (d, m = 0, s = 0) => {
  const [D, M, S] = [d, m, s].map((x) => (x === "" || x == null ? 0 : Number(x)));
  if (![D, M, S].every(Number.isFinite) || d === "" || d == null) return null;
  const sign = D < 0 ? -1 : 1;
  return sign * (Math.abs(D) + M / 60 + S / 3600);
};

const ELLIPSOIDS = {
  clarke1880: { a: 6378249.145, rf: 293.465 }, // Clarke 1880 (RGS), used by Adindan
  wgs84: { a: 6378137, rf: 298.257223563 },
};
// Adindan → WGS 84 for Ethiopia (NIMA TR8350.2, "ADI-A"), metres
const ADINDAN_TO_WGS84 = { dx: -165, dy: -11, dz: 206 };

const toEcef = (lat, lng, { a, rf }) => {
  const f = 1 / rf;
  const e2 = f * (2 - f);
  const p = rad(lat);
  const l = rad(lng);
  const N = a / Math.sqrt(1 - e2 * Math.sin(p) ** 2);
  return [N * Math.cos(p) * Math.cos(l), N * Math.cos(p) * Math.sin(l), N * (1 - e2) * Math.sin(p)];
};

const fromEcef = ([x, y, z], { a, rf }) => {
  const f = 1 / rf;
  const e2 = f * (2 - f);
  const lng = Math.atan2(y, x);
  const p = Math.hypot(x, y);
  let lat = Math.atan2(z, p * (1 - e2));
  for (let i = 0; i < 6; i++) {
    const N = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2);
    const h = p / Math.cos(lat) - N;
    lat = Math.atan2(z, p * (1 - (e2 * N) / (N + h)));
  }
  return [deg(lat), deg(lng)];
};

/** [lat, lng] on Adindan → [lat, lng] on WGS 84. */
const adindanToWgs84 = (lat, lng) => {
  const [x, y, z] = toEcef(lat, lng, ELLIPSOIDS.clarke1880);
  const { dx, dy, dz } = ADINDAN_TO_WGS84;
  return fromEcef([x + dx, y + dy, z + dz], ELLIPSOIDS.wgs84);
};

/** Inside Ethiopia's bounding box (with a margin): catches typed coordinates that are clearly wrong. */
const inEthiopia = (lat, lng) => lat > 3.2 && lat < 15.1 && lng > 32.9 && lng < 48.1;

/** Signed area (in degrees², planar) and centroid of a ring of [lng, lat]. */
const ringAreaCentroid = (ring) => {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x0, y0] = ring[j];
    const [x1, y1] = ring[i];
    const cross = x0 * y1 - x1 * y0;
    a += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  a /= 2;
  return a ? { area: a, lng: cx / (6 * a), lat: cy / (6 * a) } : { area: 0, lng: ring[0][0], lat: ring[0][1] };
};

/**
 * A point to show the area by: the area-weighted centre when it lies inside the area,
 * otherwise the centre of the largest part, otherwise a point inside that part.
 * @returns {{ lat, lng }}
 */
const centerOf = (geometry) => {
  const polys = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const parts = polys.map((p) => ({ poly: p, ...ringAreaCentroid(p[0]) }));
  const total = parts.reduce((s, p) => s + Math.abs(p.area), 0);
  if (total) {
    const lng = parts.reduce((s, p) => s + p.lng * Math.abs(p.area), 0) / total;
    const lat = parts.reduce((s, p) => s + p.lat * Math.abs(p.area), 0) / total;
    if (pointInGeometry(lng, lat, geometry)) return { lat, lng };
  }
  const largest = parts.sort((x, y) => Math.abs(y.area) - Math.abs(x.area))[0];
  if (pointInGeometry(largest.lng, largest.lat, geometry)) return { lat: largest.lat, lng: largest.lng };
  // Odd shapes: the first grid point inside the largest part
  const ring = largest.poly[0];
  const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  for (let i = 1; i < 20; i++) for (let j = 1; j < 20; j++) {
    const lng = minX + ((maxX - minX) * i) / 20, lat = minY + ((maxY - minY) * j) / 20;
    if (pointInGeometry(lng, lat, { type: "Polygon", coordinates: largest.poly })) return { lat, lng };
  }
  return { lat: ring[0][1], lng: ring[0][0] };
};

/** Points spread over the area (vertices, centre and an inside grid): to find which woredas it touches. */
const samplePoints = (geometry, grid = 6) => {
  const polys = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const out = [];
  for (const poly of polys) {
    const ring = poly[0];
    out.push(...ring);
    const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1]);
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    for (let i = 0; i <= grid; i++) for (let j = 0; j <= grid; j++) {
      const p = [minX + ((maxX - minX) * i) / grid, minY + ((maxY - minY) * j) / grid];
      if (pointInGeometry(p[0], p[1], { type: "Polygon", coordinates: poly })) out.push(p);
    }
  }
  const c = centerOf(geometry);
  out.push([c.lng, c.lat]);
  return out;
};

/** Distance in metres from a point to the nearest edge of the area (0 when on the edge). */
const distanceToEdgeMeters = (lat, lng, geometry) => {
  const polys = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  // Local flat projection around the point (metres); accurate enough for the km range
  const kx = 111320 * Math.cos(rad(lat));
  const ky = 110574;
  let best = Infinity;
  for (const poly of polys) for (const ring of poly) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const ax = (ring[j][0] - lng) * kx, ay = (ring[j][1] - lat) * ky;
      const bx = (ring[i][0] - lng) * kx, by = (ring[i][1] - lat) * ky;
      const dx = bx - ax, dy = by - ay;
      const len2 = dx * dx + dy * dy;
      const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
      best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
    }
  }
  return best;
};

/**
 * Where a GPS point is relative to a license area.
 * @returns {{ inside: boolean, distance_m: number }} distance_m: to the edge (outside: how far away)
 */
const positionInArea = (lat, lng, geometry) => {
  const inside = pointInGeometry(lng, lat, geometry);
  return { inside, distance_m: Math.round(distanceToEdgeMeters(lat, lng, geometry)) };
};

module.exports = { dmsToDecimal, adindanToWgs84, inEthiopia, centerOf, samplePoints, distanceToEdgeMeters, positionInArea };
