"use strict";
/**
 * The Ministry's license coordinate list (.xlsx): the corner points of every license area.
 *
 * Layout (first sheet, two header rows; the license's first row carries its number):
 *   A No | B Company Name | C Code (license number) | D Spatial Reference | E Part Name | F Order
 *   G–I Latitude degrees / minutes / seconds | J–L Longitude degrees / minutes / seconds
 * A license may have several parts ("Part 1", "Part 2" …), each a separate polygon.
 *
 * Coordinates are on the Adindan datum and are converted to WGS 84 (what phones use).
 * Points outside Ethiopia are typing errors: they are left out and reported, never guessed.
 */
const ExcelJS = require("exceljs");
const { dmsToDecimal, adindanToWgs84, inEthiopia, centerOf, samplePoints } = require("../utils/geodesy");
const { pointInGeometry } = require("./geoService");

const COL = { company: 2, code: 3, datum: 4, part: 5, order: 6, lat: [7, 8, 9], lng: [10, 11, 12] };

/** The same license number however it is written: spaces, / or \, a stray "." or quote at the end. */
const licenseKey = (number) =>
  String(number ?? "")
    .trim()
    .replace(/\//g, "\\")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[."'”]+$/, "");

const value = (row, col) => {
  const v = row.getCell(col).value;
  if (v == null) return "";
  if (typeof v === "object" && "result" in v) return v.result ?? "";
  if (typeof v === "object" && v.richText) return v.richText.map((t) => t.text).join("");
  return v;
};
const text = (row, col) => String(value(row, col)).replace(/\s+/g, " ").trim();

/**
 * @returns {Promise<{ licenses: Map<string, { number, company, geometry, center, points, row }>, problems: object[] }>}
 *   licenses keyed by licenseKey(number); geometry: GeoJSON MultiPolygon in WGS 84
 */
async function readLicenseCoordinates(file) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.worksheets[0];
  const problems = [];
  const note = (row, license, issue, detail) => problems.push({ row, company: "", license, issue, detail });

  const raw = new Map(); // key -> { number, company, datum, row, parts: Map(partName -> [[lat,lng]]) }
  let current = null;
  let part = null;
  for (let r = 3; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const code = text(row, COL.code);
    if (code) {
      const key = licenseKey(code);
      current = raw.get(key) || { number: code, company: text(row, COL.company), datum: text(row, COL.datum), row: r, parts: new Map() };
      raw.set(key, current);
      part = null;
    }
    if (!current) continue;
    if (text(row, COL.part)) part = text(row, COL.part);
    const lat = dmsToDecimal(...COL.lat.map((c) => value(row, c)));
    const lng = dmsToDecimal(...COL.lng.map((c) => value(row, c)));
    if (lat == null || lng == null) continue;
    if (!inEthiopia(lat, lng)) {
      note(r, current.number, "Point outside Ethiopia", `${part || "Part 1"}, point ${text(row, COL.order) || "?"}: ${lat.toFixed(5)}, ${lng.toFixed(5)} — left out; correct it in the coordinate list.`);
      continue;
    }
    const key = part || "Part 1";
    if (!current.parts.has(key)) current.parts.set(key, []);
    current.parts.get(key).push([lat, lng]);
  }

  const licenses = new Map();
  for (const [key, lic] of raw) {
    if (lic.datum && !/adindan/i.test(lic.datum)) {
      note(lic.row, lic.number, "Unknown coordinate system", `"${lic.datum}": converted as Adindan like the rest; check it.`);
    } else if (!lic.datum) {
      note(lic.row, lic.number, "No coordinate system given", "Converted as Adindan like the rest.");
    }
    const polygons = [];
    let points = 0;
    for (const [partName, pts] of lic.parts) {
      if (pts.length < 3) {
        note(lic.row, lic.number, "Part with too few points", `${partName}: ${pts.length} point(s); left out.`);
        continue;
      }
      const ring = pts.map(([la, ln]) => {
        const [wla, wln] = adindanToWgs84(la, ln);
        return [Number(wln.toFixed(7)), Number(wla.toFixed(7))];
      });
      const [f, l] = [ring[0], ring[ring.length - 1]];
      if (f[0] !== l[0] || f[1] !== l[1]) ring.push([...f]); // GeoJSON rings are closed
      polygons.push([ring]);
      points += pts.length;
    }
    if (!polygons.length) {
      note(lic.row, lic.number, "No usable coordinates", "The license has no part with 3 or more points.");
      continue;
    }
    const geometry = { type: "MultiPolygon", coordinates: polygons };
    licenses.set(key, { number: lic.number, company: lic.company, geometry, center: centerOf(geometry), points, row: lic.row });
  }
  return { licenses, problems };
}

/**
 * All woreda boundaries in memory, to find the woredas a license area lies in without a
 * database query per point.
 */
class WoredaIndex {
  constructor(woredas) {
    this.woredas = woredas.filter((w) => w.boundary);
  }

  static async load(db, transaction) {
    const rows = await db.AdminArea.scope("withBoundary").findAll({
      where: { level: "woreda", is_active: true },
      attributes: ["area_id", "parent_id", "name", "boundary", "min_lat", "max_lat", "min_lng", "max_lng"],
      raw: true,
      transaction,
    });
    return new WoredaIndex(rows);
  }

  at(lng, lat) {
    return this.woredas.filter((w) => w.min_lat <= lat && lat <= w.max_lat && w.min_lng <= lng && lng <= w.max_lng && pointInGeometry(lng, lat, w.boundary));
  }

  /** Woredas the area covers, the one holding most of it first. */
  forGeometry(geometry) {
    const hits = new Map();
    for (const [lng, lat] of samplePoints(geometry)) {
      for (const w of this.at(lng, lat)) hits.set(w.area_id, { area: w, n: (hits.get(w.area_id)?.n || 0) + 1 });
    }
    return [...hits.values()].sort((a, b) => b.n - a.n).map((h) => h.area);
  }
}

module.exports = { readLicenseCoordinates, licenseKey, WoredaIndex };
