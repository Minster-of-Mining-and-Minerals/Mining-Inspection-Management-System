#!/usr/bin/env node
/**
 * Builds Ethiopia's outline for the maps (everything outside it is greyed out):
 * frontend/public/maps/ethiopia-outline.json, from the region boundaries in
 * data/admin-areas/eth-admin-areas.json.gz (OCHA COD-AB, CC BY-IGO).
 *
 * The regions are merged into one shape, inner gaps are dropped, and the border is simplified
 * (about 500 m), which is plenty for a mask on a country-wide map.
 *
 * Needs the polygon-clipping package, which the app itself does not use:
 *   npm i --no-save polygon-clipping && node scripts/build-country-outline.js
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const polygonClipping = require("polygon-clipping");

const SRC = path.join(__dirname, "..", "data", "admin-areas", "eth-admin-areas.json.gz");
const OUT = path.join(__dirname, "..", "..", "frontend", "public", "maps", "ethiopia-outline.json");
const TOLERANCE = 0.005; // degrees, about 500 m

/** Douglas–Peucker on a ring of [lng, lat]. */
const simplify = (points, tol) => {
  if (points.length < 4) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = points[a];
    const [bx, by] = points[b];
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy) || 1e-12;
    let best = -1, at = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * points[i][0] - dx * points[i][1] + bx * ay - by * ax) / len;
      if (d > best) [best, at] = [d, i];
    }
    if (best > tol) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
};

/** A closed ring starts and ends on the same point: split it at the point farthest from the start. */
const simplifyRing = (ring, tol) => {
  const open = ring.slice(0, -1);
  let far = 0;
  for (let i = 1; i < open.length; i++) {
    if (Math.hypot(open[i][0] - open[0][0], open[i][1] - open[0][1]) > Math.hypot(open[far][0] - open[0][0], open[far][1] - open[0][1])) far = i;
  }
  const first = simplify(open.slice(0, far + 1), tol);
  const second = simplify([...open.slice(far), open[0]], tol);
  return [...first, ...second.slice(1)]; // ends on the start point again: closed
};

const data = JSON.parse(zlib.gunzipSync(fs.readFileSync(SRC)));
const regions = data.areas.filter((a) => a.level === "region" && a.boundary);
const polys = regions.map((r) => (r.boundary.type === "Polygon" ? [r.boundary.coordinates] : r.boundary.coordinates));
const merged = polygonClipping.union(...polys);

// Outer rings only (the merge leaves slivers between neighbouring regions as holes); drop specks
const area = (ring) => Math.abs(ring.reduce((s, [x, y], i) => s + x * ring[(i + 1) % ring.length][1] - ring[(i + 1) % ring.length][0] * y, 0) / 2);
const rings = merged
  .map((p) => p[0])
  .filter((ring) => area(ring) > 0.01)
  .map((ring) => simplifyRing(ring, TOLERANCE).map(([x, y]) => [Number(x.toFixed(4)), Number(y.toFixed(4))]));

const xs = rings.flat().map((p) => p[0]);
const ys = rings.flat().map((p) => p[1]);
const out = {
  name: "Ethiopia",
  source: `${data.source} (${data.version}), regions merged and simplified`,
  licence: data.licence,
  bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
  outline: { type: "MultiPolygon", coordinates: rings.map((r) => [r]) },
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`${regions.length} regions → ${rings.length} outline part(s), ${rings.reduce((s, r) => s + r.length, 0)} points, ${(fs.statSync(OUT).size / 1024).toFixed(1)} KB → ${OUT}`);
