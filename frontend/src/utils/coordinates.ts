/**
 * A point on the map written in the formats inspectors copy: decimal degrees, degrees-minutes-
 * seconds, a map link, and UTM. All WGS84 (what phones, GPS devices and Google Maps use).
 */
import type { LicenseBoundary, LngLat } from "./licenseArea";

export type CoordFormat = "decimal" | "dms" | "link" | "utm";
export const COORD_FORMATS: [CoordFormat, string][] = [
  ["decimal", "Decimal"],
  ["dms", "D° M′ S″"],
  ["link", "Link"],
  ["utm", "UTM"],
];

const dmsPart = (value: number, pos: string, neg: string) => {
  const hemi = value >= 0 ? pos : neg;
  let v = Math.abs(value);
  let d = Math.floor(v);
  v = (v - d) * 60;
  let m = Math.floor(v);
  let s = Math.round((v - m) * 600) / 10; // one decimal
  if (s >= 60) {
    s = 0;
    m += 1;
  }
  if (m >= 60) {
    m = 0;
    d += 1;
  }
  return `${d}°${String(m).padStart(2, "0")}′${s.toFixed(1).padStart(4, "0")}″${hemi}`;
};

/** UTM on WGS84 (standard transverse Mercator series, accurate to well under a metre). */
export const toUtm = (lat: number, lng: number) => {
  const zone = Math.min(60, Math.floor((lng + 180) / 6) + 1);
  const a = 6378137;
  const f = 1 / 298.257223563;
  const k0 = 0.9996;
  const e2 = f * (2 - f);
  const ep2 = e2 / (1 - e2);
  const phi = (lat * Math.PI) / 180;
  const lam = (lng * Math.PI) / 180;
  const lam0 = (((zone - 1) * 6 - 180 + 3) * Math.PI) / 180;
  const sin = Math.sin(phi);
  const cos = Math.cos(phi);
  const tan = Math.tan(phi);
  const N = a / Math.sqrt(1 - e2 * sin * sin);
  const T = tan * tan;
  const C = ep2 * cos * cos;
  const A = cos * (lam - lam0);
  const M =
    a *
    ((1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 ** 3) / 256) * phi -
      ((3 * e2) / 8 + (3 * e2 * e2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * phi) +
      ((15 * e2 * e2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * phi) -
      ((35 * e2 ** 3) / 3072) * Math.sin(6 * phi));
  const easting = k0 * N * (A + ((1 - T + C) * A ** 3) / 6 + ((5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5) / 120) + 500000;
  let northing = k0 * (M + N * tan * ((A * A) / 2 + ((5 - T + 9 * C + 4 * C * C) * A ** 4) / 24 + ((61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6) / 720));
  if (lat < 0) northing += 10000000;
  return { zone, hemisphere: lat >= 0 ? "N" : "S", easting: Math.round(easting), northing: Math.round(northing) };
};

/** One point in the chosen format. */
export const formatCoord = (lat: number, lng: number, f: CoordFormat) => {
  switch (f) {
    case "dms":
      return `${dmsPart(lat, "N", "S")} ${dmsPart(lng, "E", "W")}`;
    case "link":
      return `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
    case "utm": {
      const u = toUtm(lat, lng);
      return `${u.zone}${u.hemisphere} ${u.easting} E ${u.northing} N`;
    }
    default:
      return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  }
};

/** The corner points of a license area, in order (the ring's closing repeat left out). */
export const cornersOf = (b: LicenseBoundary | null | undefined): { label: string; lat: number; lng: number }[] => {
  if (!b) return [];
  const polygons = (b.type === "Polygon" ? [b.coordinates] : b.coordinates) as LngLat[][][];
  const out: { label: string; lat: number; lng: number }[] = [];
  polygons.forEach((poly, pi) => {
    const ring = poly[0] ?? [];
    const pts = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring;
    pts.forEach(([lng, lat], i) => out.push({ label: polygons.length > 1 ? `${pi + 1}·P${i + 1}` : `P${i + 1}`, lat, lng }));
  });
  return out;
};

/** Copy text; falls back to a hidden text box where the clipboard API isn't allowed. */
export const copyText = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const t = document.createElement("textarea");
      t.value = text;
      t.setAttribute("readonly", "");
      t.style.position = "fixed";
      t.style.opacity = "0";
      document.body.appendChild(t);
      t.select();
      const ok = document.execCommand("copy");
      t.remove();
      return ok;
    } catch {
      return false;
    }
  }
};

/* ---------- Typing in a license area (the same conversion as the server: utils/geodesy.js) ---------- */

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const CLARKE_1880 = { a: 6378249.145, rf: 293.465 };
const WGS84 = { a: 6378137, rf: 298.257223563 };
const toEcef = (lat: number, lng: number, { a, rf }: { a: number; rf: number }) => {
  const f = 1 / rf;
  const e2 = f * (2 - f);
  const p = rad(lat);
  const l = rad(lng);
  const N = a / Math.sqrt(1 - e2 * Math.sin(p) ** 2);
  return [N * Math.cos(p) * Math.cos(l), N * Math.cos(p) * Math.sin(l), N * (1 - e2) * Math.sin(p)];
};
const fromEcef = ([x, y, z]: number[], { a, rf }: { a: number; rf: number }) => {
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
/** [lat, lng] on Adindan (the license certificates) → [lat, lng] on WGS 84 (phones, maps). */
export const adindanToWgs84 = (lat: number, lng: number) => {
  const [x, y, z] = toEcef(lat, lng, CLARKE_1880);
  return fromEcef([x - 165, y - 11, z + 206], WGS84);
};
export const inEthiopia = (lat: number, lng: number) => lat > 3.2 && lat < 15.1 && lng > 32.9 && lng < 48.1;

/**
 * Points pasted from Excel or a document, one per line. A line with 2 numbers is decimal
 * (latitude, longitude); 6 numbers are degrees-minutes-seconds (lat d m s, lng d m s); 4 numbers
 * are degrees-minutes. Other text on the line (N, E, °, ′, ″, point numbers before a tab) is ignored
 * when the count fits. A blank line starts a new part.
 */
export const parsePointLines = (text: string): { parts: { lat: number; lng: number }[][]; bad: number[] } => {
  const parts: { lat: number; lng: number }[][] = [[]];
  const bad: number[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) {
      if (parts[parts.length - 1].length) parts.push([]);
      return;
    }
    let n = (line.match(/-?\d+(?:[.,]\d+)?/g) || []).map((x) => Number(x.replace(",", ".")));
    // a leading point number ("1", "P1") before the coordinates
    if (n.length === 3 || n.length === 5 || n.length === 7) n = n.slice(1);
    let lat: number | null = null;
    let lng: number | null = null;
    if (n.length === 2) [lat, lng] = n;
    else if (n.length === 4) [lat, lng] = [n[0] + n[1] / 60, n[2] + n[3] / 60];
    else if (n.length === 6) [lat, lng] = [n[0] + n[1] / 60 + n[2] / 3600, n[3] + n[4] / 60 + n[5] / 3600];
    if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) bad.push(i + 1);
    else parts[parts.length - 1].push({ lat, lng });
  });
  return { parts: parts.filter((p) => p.length), bad };
};
