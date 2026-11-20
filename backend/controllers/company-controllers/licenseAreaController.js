"use strict";
/**
 * A license's surveyed area (its corner points), entered in the system instead of the coordinate list.
 *
 *   GET /api/licenses/:licenseId/area   the area (WGS 84 GeoJSON), its centre and where it lies
 *   PUT /api/licenses/:licenseId/area   { datum: "adindan" | "wgs84", parts: [[{ lat, lng }, …], …] }
 *                                       or { clear: true } to remove the area
 *
 * Works like the coordinate-list import (services/licenseCoordinatesService.js): Adindan points are
 * converted to WGS 84, each part becomes a closed polygon, the centre and the woredas (and so the
 * zone and region) come from the area. Only this license's area changes: never its team or tasks.
 */
const { validate: isUuid } = require("uuid");
const db = require("../../models");
const { findInScope } = require("../../services/sectorScope");
const { WoredaIndex } = require("../../services/licenseCoordinatesService");
const { adindanToWgs84, inEthiopia, centerOf } = require("../../utils/geodesy");

const fail = (res, status, message, extra) => res.status(status).json({ success: false, message, ...extra });
const MAX_PARTS = 20;
const MAX_POINTS = 500;

const areaOf = (license) => ({
  license_id: license.license_id,
  license_number: license.license_number,
  boundary: license.boundary ?? null,
  center_lat: license.center_lat,
  center_lng: license.center_lng,
  location_source: license.location_source,
  areas: (license.areas || []).map((a) => ({ area_id: a.area_id, name: a.name, level: a.level })),
});

const load = (id, req, transaction) =>
  findInScope(db.CompanyLicense.scope("withBoundary"), id, req, {
    include: [{ model: db.AdminArea, as: "areas", attributes: ["area_id", "name", "level"], through: { attributes: [] } }],
    transaction,
  });

const getLicenseArea = async (req, res) => {
  try {
    if (!isUuid(req.params.licenseId)) return fail(res, 400, "Invalid license id.");
    const license = await load(req.params.licenseId, req);
    if (!license) return fail(res, 404, "License not found.");
    return res.status(200).json({ success: true, data: areaOf(license) });
  } catch (error) {
    console.error("getLicenseArea", error);
    return fail(res, 500, "Failed to load the license area.");
  }
};

/** The typed points as a WGS 84 MultiPolygon, or the problems found (nothing is guessed). */
const buildGeometry = (parts, datum) => {
  const problems = [];
  if (!Array.isArray(parts) || !parts.length) return { problems: ["Add at least one part with 3 or more points."] };
  if (parts.length > MAX_PARTS) return { problems: [`At most ${MAX_PARTS} parts.`] };
  const total = parts.reduce((n, p) => n + (Array.isArray(p) ? p.length : 0), 0);
  if (total > MAX_POINTS) return { problems: [`At most ${MAX_POINTS} points in all.`] };
  const polygons = [];
  parts.forEach((points, pi) => {
    const name = `Part ${pi + 1}`;
    if (!Array.isArray(points) || points.length < 3) return problems.push(`${name}: needs at least 3 points.`);
    const ring = [];
    points.forEach((p, i) => {
      const lat = Number(p?.lat);
      const lng = Number(p?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return problems.push(`${name}, point ${i + 1}: not a number.`);
      if (!inEthiopia(lat, lng)) return problems.push(`${name}, point ${i + 1}: ${lat.toFixed(5)}, ${lng.toFixed(5)} is outside Ethiopia. Check it.`);
      const [wla, wln] = datum === "adindan" ? adindanToWgs84(lat, lng) : [lat, lng];
      ring.push([Number(wln.toFixed(7)), Number(wla.toFixed(7))]);
    });
    if (ring.length >= 3) {
      const [f, l] = [ring[0], ring[ring.length - 1]];
      if (f[0] !== l[0] || f[1] !== l[1]) ring.push([...f]); // GeoJSON rings are closed
      polygons.push([ring]);
    }
  });
  if (problems.length) return { problems };
  return { geometry: { type: "MultiPolygon", coordinates: polygons }, problems };
};

const setLicenseArea = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    if (!isUuid(req.params.licenseId)) {
      await t.rollback();
      return fail(res, 400, "Invalid license id.");
    }
    const license = await load(req.params.licenseId, req, t);
    if (!license) {
      await t.rollback();
      return fail(res, 404, "License not found.");
    }

    if (req.body?.clear === true) {
      await license.update({ boundary: null, center_lat: null, center_lng: null }, { transaction: t });
      await t.commit();
      return res.status(200).json({ success: true, message: "The license area was removed.", data: areaOf(await load(license.license_id, req)) });
    }

    const datum = req.body?.datum === "wgs84" ? "wgs84" : "adindan";
    const { geometry, problems } = buildGeometry(req.body?.parts, datum);
    if (!geometry) {
      await t.rollback();
      return fail(res, 400, problems[0], { problems });
    }
    const center = centerOf(geometry);
    // The woredas the area lies in give the license its woreda, zone and region
    const woredas = await WoredaIndex.load(db, t);
    const ids = woredas.forGeometry(geometry).map((w) => w.area_id);
    await license.update(
      { boundary: geometry, center_lat: center.lat, center_lng: center.lng, ...(ids.length && { location_source: "coordinates" }) },
      { transaction: t },
    );
    if (ids.length) await license.setAreas(ids, { transaction: t });
    await t.commit();
    return res.status(200).json({
      success: true,
      message: ids.length ? "License area saved." : "License area saved. It isn't inside a known woreda, so the location wasn't changed.",
      data: areaOf(await load(license.license_id, req)),
    });
  } catch (error) {
    await t.rollback().catch(() => {});
    console.error("setLicenseArea", error);
    return fail(res, 500, "Failed to save the license area.");
  }
};

module.exports = { getLicenseArea, setLicenseArea, buildGeometry };
