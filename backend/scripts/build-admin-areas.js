#!/usr/bin/env node
/**
 * Builds backend/data/admin-areas/eth-admin-areas.json.gz from the official
 * Ethiopia COD-AB boundaries (OCHA / HDX, source: CSA + Regional BoFED,
 * licence CC BY-IGO): https://data.humdata.org/dataset/cod-ab-eth
 *
 * Usage:
 *   node scripts/build-admin-areas.js <folder with eth_admin1/2/3.geojson>
 *
 * The output holds regions, zones and woredas with their P-codes, alternative
 * names and simplified boundaries (Douglas–Peucker, ~50 m), small enough to
 * commit and seed. Re-run it when a new COD-AB version is published.
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const TOLERANCE_DEG = 0.0005; // ≈ 55 m at Ethiopian latitudes
const COORD_DECIMALS = 5; // ≈ 1 m

const srcDir = process.argv[2];
if (!srcDir) {
  console.error("Usage: node scripts/build-admin-areas.js <folder with eth_admin1/2/3.geojson>");
  process.exit(1);
}

// ---------- geometry helpers ----------
const perpDistSq = ([px, py], [ax, ay], [bx, by]) => {
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) return (px - ax) ** 2 + (py - ay) ** 2;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return (px - (ax + t * dx)) ** 2 + (py - (ay + t * dy)) ** 2;
};

// Iterative Douglas–Peucker (recursion overflows on long rings)
const simplifyLine = (points, tol) => {
  if (points.length <= 2) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  const tolSq = tol * tol;
  while (stack.length) {
    const [first, last] = stack.pop();
    let maxD = 0;
    let idx = -1;
    for (let i = first + 1; i < last; i++) {
      const d = perpDistSq(points[i], points[first], points[last]);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (idx !== -1 && maxD > tolSq) {
      keep[idx] = 1;
      stack.push([first, idx], [idx, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
};

const round = (n) => Number(n.toFixed(COORD_DECIMALS));

const simplifyRing = (ring) => {
  // Closed ring: simplify the open path, then close it again
  const open = ring.slice(0, -1);
  let out = simplifyLine(open, TOLERANCE_DEG);
  if (out.length < 3) out = open.length >= 3 ? [open[0], open[Math.floor(open.length / 3)], open[Math.floor((2 * open.length) / 3)]] : open;
  out = out.map(([x, y]) => [round(x), round(y)]);
  out.push(out[0]);
  return out;
};

const simplifyGeometry = (geom) => {
  if (!geom) return null;
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.type === "MultiPolygon" ? geom.coordinates : [];
  const simplified = polys
    .map((poly) => poly.map(simplifyRing).filter((ring) => ring.length >= 4))
    .filter((poly) => poly.length > 0);
  if (!simplified.length) return null;
  return simplified.length === 1
    ? { type: "Polygon", coordinates: simplified[0] }
    : { type: "MultiPolygon", coordinates: simplified };
};

const bboxOf = (geom) => {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  for (const poly of polys)
    for (const ring of poly)
      for (const [lng, lat] of ring) {
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
  return [round(minLng), round(minLat), round(maxLng), round(maxLat)];
};

// A point guaranteed to lie inside the area (for map labels / "go to"):
// on the horizontal line through the middle of the largest polygon, the
// midpoint of the widest stretch that is inside the outer ring.
const ringArea = (ring) => {
  let s = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) s += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  return Math.abs(s / 2);
};

const interiorPoint = (geom) => {
  if (!geom) return null;
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  // Largest polygon, with its holes (e.g. a town that is its own woreda inside it)
  const rings = polys.slice().sort((a, b) => ringArea(b[0]) - ringArea(a[0]))[0];
  const outer = rings[0];
  let minLat = Infinity, maxLat = -Infinity;
  for (const [, lat] of outer) {
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  let best = null;
  // Try a few lines around the middle; keep the widest inside stretch
  for (const f of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8]) {
    const y = minLat + (maxLat - minLat) * f;
    const xs = [];
    for (const ring of rings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [x1, y1] = ring[j];
        const [x2, y2] = ring[i];
        if (y1 > y !== y2 > y) xs.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const width = xs[k + 1] - xs[k];
      if (!best || width > best.width) best = { width, lng: (xs[k] + xs[k + 1]) / 2, lat: y };
    }
  }
  return best ? [round(best.lng), round(best.lat)] : null;
};

const countPoints = (geom) => {
  if (!geom) return 0;
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  return polys.reduce((s, p) => s + p.reduce((t, r) => t + r.length, 0), 0);
};

// "Kilbati /Zone 2" -> ["Kilbati", "Zone 2"]; plus the dataset's alt names
const altNamesOf = (name, altField) => {
  const alts = new Set();
  if (name.includes("/")) name.split("/").map((s) => s.trim()).filter(Boolean).forEach((s) => alts.add(s));
  if (altField) String(altField).split(/[;,|]/).map((s) => s.trim()).filter(Boolean).forEach((s) => alts.add(s));
  alts.delete(name);
  return [...alts];
};

// ---------- build ----------
const read = (lvl) => JSON.parse(fs.readFileSync(path.join(srcDir, `eth_admin${lvl}.geojson`), "utf8"));
const LEVELS = { 1: "region", 2: "zone", 3: "woreda" };

let rawPoints = 0;
let keptPoints = 0;
const areas = [];
let version = null;
let validOn = null;

for (const lvl of [1, 2, 3]) {
  for (const f of read(lvl).features) {
    const p = f.properties;
    const name = String(p[`adm${lvl}_name`]).trim();
    const boundary = simplifyGeometry(f.geometry);
    rawPoints += countPoints(f.geometry);
    keptPoints += countPoints(boundary);
    version = version || p.version;
    validOn = validOn || p.valid_on;
    areas.push({
      pcode: p[`adm${lvl}_pcode`],
      parent_pcode: lvl === 1 ? null : p[`adm${lvl - 1}_pcode`],
      level: LEVELS[lvl],
      name,
      alt_names: altNamesOf(name, p[`adm${lvl}_alt_name`]),
      center: p.center_lat != null ? [round(p.center_lon), round(p.center_lat)] : interiorPoint(boundary),
      area_sqkm: p.area_sqkm != null ? Math.round(p.area_sqkm * 100) / 100 : null,
      bbox: boundary ? bboxOf(boundary) : null,
      boundary,
    });
  }
}

const out = {
  source: "OCHA COD-AB Ethiopia (CSA + Regional BoFED), https://data.humdata.org/dataset/cod-ab-eth",
  licence: "CC BY-IGO",
  version,
  valid_on: validOn,
  simplify_tolerance_deg: TOLERANCE_DEG,
  built_at: new Date().toISOString(),
  areas,
};

const outDir = path.join(__dirname, "..", "data", "admin-areas");
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, "eth-admin-areas.json.gz");
fs.writeFileSync(outFile, zlib.gzipSync(JSON.stringify(out), { level: 9 }));

const counts = areas.reduce((c, a) => ((c[a.level] = (c[a.level] || 0) + 1), c), {});
console.log(`COD-AB ${version} (valid on ${validOn}):`, counts);
console.log(`Boundary points: ${rawPoints.toLocaleString()} -> ${keptPoints.toLocaleString()}`);
console.log(`Wrote ${outFile} (${(fs.statSync(outFile).size / 1024 / 1024).toFixed(2)} MB)`);
