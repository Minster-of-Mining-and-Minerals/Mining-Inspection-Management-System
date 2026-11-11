/**
 * Where inspections were submitted: the GPS point the inspector's phone gave on Submit.
 *
 *   GET /api/dashboard/submission-map?from=&to=&team_id=&submitted_by=&form_id=&schedule_id=
 *        &company_id=&license_type=&region_id=&late=true|false&score_min=&score_max=&max_accuracy=
 *       -> { points: [...], counts: { submitted, on_map, no_location, low_accuracy } }
 *   GET /api/dashboard/submission-map/options  -> teams, inspectors, forms, schedules, companies, regions
 *
 * Only submitted inspections; `max_accuracy` (metres) hides imprecise points (default 500, 0 = all).
 */
const { QueryTypes } = require("sequelize");
const { validate: isUuid } = require("uuid");
const { sequelize } = require("../../models");
const { placeOf } = require("../../services/placeService");
const { scopeSql } = require("../../services/sectorScope");

const fail = (res, status, message) => res.status(status).json({ success: false, message });
const q = (sql, replacements) => sequelize.query(sql, { replacements, type: QueryTypes.SELECT });
const MAX_POINTS = 10000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** WHERE clause for the filters (everything except the location itself), within the request's sector. */
const filtersOf = (query, req) => {
  const where = ["i.status = 'submitted'", scopeSql(req, "i")];
  const r = {};
  // dates are Ethiopian calendar days of submission (local time)
  if (DATE.test(query.from || "")) {
    where.push(`(i.submitted_at AT TIME ZONE 'Africa/Addis_Ababa')::date >= :from`);
    r.from = query.from;
  }
  if (DATE.test(query.to || "")) {
    where.push(`(i.submitted_at AT TIME ZONE 'Africa/Addis_Ababa')::date <= :to`);
    r.to = query.to;
  }
  for (const [param, column] of [
    ["team_id", "i.team_id"],
    ["submitted_by", "i.submitted_by"],
    ["form_id", "i.form_id"],
    ["schedule_id", "i.schedule_id"],
    ["company_id", "i.company_id"],
  ]) {
    if (query[param] && isUuid(query[param])) {
      where.push(`${column} = :${param}`);
      r[param] = query[param];
    }
  }
  if (["exploration", "mining"].includes(query.license_type)) {
    where.push("l.license_type = :license_type");
    r.license_type = query.license_type;
  }
  if (query.region_id && isUuid(query.region_id)) {
    // the license's woreda / zone / region lies in this region
    where.push(`EXISTS (
      SELECT 1 FROM license_areas la
        JOIN admin_areas a ON a.area_id = la.area_id
        LEFT JOIN admin_areas p ON p.area_id = a.parent_id
        LEFT JOIN admin_areas g ON g.area_id = p.parent_id
       WHERE la.license_id = i.license_id AND :region_id IN (a.area_id, p.area_id, g.area_id))`);
    r.region_id = query.region_id;
  }
  if (query.late === "true" || query.late === "false") {
    where.push("i.is_late = :late");
    r.late = query.late === "true";
  }
  const smin = Number(query.score_min);
  const smax = Number(query.score_max);
  if (query.score_min !== undefined && query.score_min !== "" && Number.isFinite(smin)) {
    where.push("i.score >= :score_min");
    r.score_min = smin / 100;
  }
  if (query.score_max !== undefined && query.score_max !== "" && Number.isFinite(smax)) {
    where.push("i.score <= :score_max");
    r.score_max = smax / 100;
  }
  return { sql: where.join(" AND "), r };
};

const HAS_POINT = `(i.submit_location->>'lat') IS NOT NULL AND (i.submit_location->>'lng') IS NOT NULL`;

const getSubmissionMap = async (req, res) => {
  try {
    const { sql, r } = filtersOf(req.query, req);
    const maxAccuracy = req.query.max_accuracy === undefined ? 500 : Math.max(0, Number(req.query.max_accuracy) || 0);
    const accuracyOk = maxAccuracy ? `COALESCE((i.submit_location->>'accuracy')::float, 0) <= :max_accuracy` : "TRUE";
    const base = `FROM inspections i JOIN company_licenses l ON l.license_id = i.license_id WHERE ${sql}`;

    const [counts] = await q(
      `SELECT COUNT(*)::int AS submitted,
              COUNT(*) FILTER (WHERE ${HAS_POINT} AND ${accuracyOk})::int AS on_map,
              COUNT(*) FILTER (WHERE NOT (${HAS_POINT}))::int AS no_location,
              COUNT(*) FILTER (WHERE ${HAS_POINT} AND NOT (${accuracyOk}))::int AS low_accuracy
         ${base}`,
      { ...r, max_accuracy: maxAccuracy },
    );
    const points = await q(
      `SELECT i.inspection_id,
              (i.submit_location->>'lat')::float AS lat,
              (i.submit_location->>'lng')::float AS lng,
              (i.submit_location->>'accuracy')::float AS accuracy,
              i.submitted_at, i.is_late, i.score::float AS score,
              c.name AS company_name, l.license_number, l.license_type,
              t.name AS team_name, u.full_name AS submitted_by_name, f.name AS form_name,
              i.submit_location->'place' AS place,
              i.submit_location->'site' AS site,
              i.submit_device->>'user_agent' AS user_agent, i.submit_device->>'platform' AS platform, i.submit_device->>'device_id' AS device_id
         FROM inspections i
         JOIN company_licenses l ON l.license_id = i.license_id
         JOIN companies c ON c.company_id = i.company_id
         JOIN forms f ON f.form_id = i.form_id
         LEFT JOIN teams t ON t.team_id = i.team_id
         LEFT JOIN users u ON u.user_id = i.submitted_by
        WHERE ${sql} AND ${HAS_POINT} AND ${accuracyOk}
        ORDER BY i.submitted_at DESC
        LIMIT ${MAX_POINTS}`,
      { ...r, max_accuracy: maxAccuracy },
    );
    // Name the place of submissions made before place names were stored (a few at a time)
    const unnamed = points.filter((p) => !p.place).slice(0, 100);
    for (const p of unnamed) {
      p.place = await placeOf(p.lat, p.lng).catch(() => null);
      if (p.place)
        await sequelize.query("UPDATE inspections SET submit_location = jsonb_set(submit_location, '{place}', CAST(:place AS jsonb)) WHERE inspection_id = :id", {
          replacements: { place: JSON.stringify(p.place), id: p.inspection_id },
        });
    }
    return res.status(200).json({ success: true, data: { points, counts: { ...counts, limited: points.length >= MAX_POINTS } } });
  } catch (error) {
    console.error("getSubmissionMap", error);
    return fail(res, 500, "Failed to load the map.");
  }
};

/** What the filters can choose from (only things that have submitted inspections, plus all regions). */
const getSubmissionMapOptions = async (req, res) => {
  try {
    const s = scopeSql(req, "i");
    const [teams, inspectors, forms, schedules, companies, regions] = await Promise.all([
      q(`SELECT DISTINCT t.team_id AS id, t.name FROM inspections i JOIN teams t ON t.team_id = i.team_id WHERE i.status = 'submitted' AND ${s} ORDER BY t.name`),
      q(`SELECT DISTINCT u.user_id AS id, u.full_name AS name FROM inspections i JOIN users u ON u.user_id = i.submitted_by WHERE i.status = 'submitted' AND ${s} ORDER BY u.full_name`),
      q(`SELECT DISTINCT f.form_id AS id, f.name FROM inspections i JOIN forms f ON f.form_id = i.form_id WHERE i.status = 'submitted' AND ${s} ORDER BY f.name`),
      q(`SELECT DISTINCT sc.schedule_id AS id, sc.name FROM inspections i JOIN inspection_schedules sc ON sc.schedule_id = i.schedule_id WHERE i.status = 'submitted' AND ${s} ORDER BY sc.name`),
      q(`SELECT DISTINCT c.company_id AS id, c.name FROM inspections i JOIN companies c ON c.company_id = i.company_id WHERE i.status = 'submitted' AND ${s} ORDER BY c.name`),
      q(`SELECT area_id AS id, name FROM admin_areas WHERE level = 'region' AND is_active ORDER BY name`),
    ]);
    return res.status(200).json({ success: true, data: { teams, inspectors, forms, schedules, companies, regions } });
  } catch (error) {
    console.error("getSubmissionMapOptions", error);
    return fail(res, 500, "Failed to load the filters.");
  }
};

module.exports = { getSubmissionMap, getSubmissionMapOptions };
