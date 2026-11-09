"use strict";

const { QueryTypes } = require("sequelize");
const { validate: isUuid } = require("uuid");
const { sequelize } = require("../models");

/**
 * Service for Plan Management System (PMS) read-only analytics.
 * Reuses identical aggregation rules, date boundaries, and region mapping
 * as the core inspection dashboard to ensure 100% statistical consistency.
 */

const LOCAL_DAY = (col) => `(${col} AT TIME ZONE 'Africa/Addis_Ababa')::date`;

/** The license's region name (from woreda -> zone -> region). */
const REGION_OF = `(SELECT CASE a.level WHEN 'region' THEN a.name WHEN 'zone' THEN p.name ELSE g.name END
                      FROM license_areas la JOIN admin_areas a ON a.area_id = la.area_id
                      LEFT JOIN admin_areas p ON p.area_id = a.parent_id
                      LEFT JOIN admin_areas g ON g.area_id = p.parent_id
                     WHERE la.license_id = i.license_id
                     ORDER BY a.level = 'woreda' DESC, a.level = 'zone' DESC LIMIT 1)`;

/** ...and its area_id. */
const REGION_ID_OF = REGION_OF.replace(
  "CASE a.level WHEN 'region' THEN a.name WHEN 'zone' THEN p.name ELSE g.name END",
  "CASE a.level WHEN 'region' THEN a.area_id WHEN 'zone' THEN p.area_id ELSE g.area_id END"
);

const FROM_INSPECTIONS = "FROM inspections i JOIN company_licenses l ON l.license_id = i.license_id";

/**
 * Safely calculate a rate/percentage with zero denominator protection.
 * @param {number} numerator
 * @param {number} denominator
 * @param {number} decimals
 * @returns {number}
 */
const safeRate = (numerator, denominator, decimals = 2) => {
  if (!denominator || denominator <= 0) return 0;
  if (!numerator || numerator <= 0) return 0;
  return Number(((numerator / denominator) * 100).toFixed(decimals));
};

/**
 * Builds SQL where clauses and replacements for integration analytics.
 */
const buildFilters = ({ from, to, license_type, region_id, team_id, form_id, scoped_region_id }) => {
  const where = [];
  const replacements = {};

  if (from) {
    where.push("i.occurrence_date >= :from");
    replacements.from = from;
  }
  if (to) {
    where.push("i.occurrence_date <= :to");
    replacements.to = to;
  }
  if (license_type && ["exploration", "mining"].includes(license_type)) {
    where.push("l.license_type = :license_type");
    replacements.license_type = license_type;
  }
  if (team_id && isUuid(team_id)) {
    where.push("i.team_id = :team_id");
    replacements.team_id = team_id;
  }
  if (form_id && isUuid(form_id)) {
    where.push("i.form_id = :form_id");
    replacements.form_id = form_id;
  }

  // Region filtering (user requested or organizationally scoped)
  const effectiveRegionId = scoped_region_id || region_id;
  if (effectiveRegionId && isUuid(effectiveRegionId)) {
    where.push(`EXISTS (
      SELECT 1 FROM license_areas la
      JOIN admin_areas a ON a.area_id = la.area_id
      LEFT JOIN admin_areas p ON p.area_id = a.parent_id
      LEFT JOIN admin_areas g ON g.area_id = p.parent_id
      WHERE la.license_id = i.license_id AND :effective_region_id IN (a.area_id, p.area_id, g.area_id)
    )`);
    replacements.effective_region_id = effectiveRegionId;
  }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  return { whereClause, replacements };
};

/**
 * Fetches the high-level summary statistical metrics.
 */
const getSummaryStats = async (filters) => {
  const { whereClause, replacements } = buildFilters(filters);

  const query = `
    SELECT
      COUNT(*)::int AS total_due,
      COUNT(*) FILTER (WHERE i.status = 'submitted')::int AS completed,
      COUNT(*) FILTER (WHERE i.status = 'in_progress')::int AS in_progress,
      COUNT(*) FILTER (WHERE i.status = 'todo')::int AS pending,
      COUNT(*) FILTER (WHERE i.status <> 'submitted' AND i.due_at < NOW())::int AS overdue,
      COUNT(*) FILTER (WHERE i.status <> 'submitted' AND i.due_at >= NOW())::int AS open,
      COUNT(*) FILTER (WHERE i.status = 'submitted' AND NOT i.is_late)::int AS on_time,
      COUNT(*) FILTER (WHERE i.status = 'submitted' AND i.is_late)::int AS late,
      COUNT(*) FILTER (WHERE i.return_count > 0)::int AS returned_for_revision,
      COUNT(DISTINCT i.company_id) FILTER (WHERE i.status = 'submitted')::int AS companies_inspected,
      COUNT(DISTINCT i.license_id) FILTER (WHERE i.status = 'submitted')::int AS licenses_inspected,
      ROUND(AVG(i.score) FILTER (WHERE i.status = 'submitted')::numeric, 4)::float AS average_score
    ${FROM_INSPECTIONS}
    ${whereClause}
  `;

  const [row] = await sequelize.query(query, {
    replacements,
    type: QueryTypes.SELECT,
  });

  const totalDue = row?.total_due || 0;
  const completed = row?.completed || 0;
  const overdue = row?.overdue || 0;
  const onTime = row?.on_time || 0;

  return {
    total_due: totalDue,
    completed,
    in_progress: row?.in_progress || 0,
    pending: row?.pending || 0,
    overdue,
    open: row?.open || 0,
    on_time: onTime,
    late: row?.late || 0,
    returned_for_revision: row?.returned_for_revision || 0,
    companies_inspected: row?.companies_inspected || 0,
    licenses_inspected: row?.licenses_inspected || 0,
    average_score: row?.average_score != null ? row.average_score : null,
    completion_rate: safeRate(completed, totalDue),
    on_time_rate: safeRate(onTime, completed),
    overdue_rate: safeRate(overdue, totalDue),
  };
};

/**
 * Fetches statistics grouped by actual inspection lifecycle statuses.
 */
const getStatusBreakdown = async (filters) => {
  const summary = await getSummaryStats(filters);
  const total = summary.total_due;

  return [
    {
      status: "submitted",
      label: "Completed",
      count: summary.completed,
      percentage: safeRate(summary.completed, total),
      description: "Inspection checklist completed and submitted by inspection team",
    },
    {
      status: "in_progress",
      label: "In Progress",
      count: summary.in_progress,
      percentage: safeRate(summary.in_progress, total),
      description: "Inspection checklist started with draft answers saved in field",
    },
    {
      status: "todo",
      label: "Pending",
      count: summary.pending,
      percentage: safeRate(summary.pending, total),
      description: "Scheduled inspection task opened and awaiting inspector response",
    },
    {
      status: "overdue",
      label: "Overdue",
      count: summary.overdue,
      percentage: safeRate(summary.overdue, total),
      description: "Inspection task past due date without submission (sub-metric of unsubmitted tasks)",
    },
  ];
};

/**
 * Fetches statistics grouped by license category (mining vs exploration).
 */
const getCategoryBreakdown = async (filters) => {
  const { whereClause, replacements } = buildFilters(filters);

  const query = `
    SELECT
      l.license_type AS category,
      COUNT(*)::int AS total_due,
      COUNT(*) FILTER (WHERE i.status = 'submitted')::int AS completed,
      COUNT(*) FILTER (WHERE i.status = 'in_progress')::int AS in_progress,
      COUNT(*) FILTER (WHERE i.status = 'todo')::int AS pending,
      COUNT(*) FILTER (WHERE i.status <> 'submitted' AND i.due_at < NOW())::int AS overdue,
      ROUND(AVG(i.score) FILTER (WHERE i.status = 'submitted')::numeric, 4)::float AS average_score
    ${FROM_INSPECTIONS}
    ${whereClause}
    GROUP BY l.license_type
    ORDER BY total_due DESC
  `;

  const rows = await sequelize.query(query, {
    replacements,
    type: QueryTypes.SELECT,
  });

  return rows.map((r) => ({
    category: r.category || "unknown",
    category_label: r.category === "mining" ? "Mining Licenses" : r.category === "exploration" ? "Exploration Licenses" : "Other",
    total_due: r.total_due,
    completed: r.completed,
    in_progress: r.in_progress,
    pending: r.pending,
    overdue: r.overdue,
    completion_rate: safeRate(r.completed, r.total_due),
    average_score: r.average_score != null ? r.average_score : null,
  }));
};

/**
 * Fetches statistics grouped by Regional Administrative Organization.
 */
const getRegionBreakdown = async (filters) => {
  const { whereClause, replacements } = buildFilters(filters);

  const query = `
    SELECT
      COALESCE(${REGION_OF}, 'Unspecified Region') AS region_name,
      ${REGION_ID_OF} AS region_id,
      COUNT(*)::int AS total_due,
      COUNT(*) FILTER (WHERE i.status = 'submitted')::int AS completed,
      COUNT(*) FILTER (WHERE i.status = 'in_progress')::int AS in_progress,
      COUNT(*) FILTER (WHERE i.status = 'todo')::int AS pending,
      COUNT(*) FILTER (WHERE i.status <> 'submitted' AND i.due_at < NOW())::int AS overdue,
      ROUND(AVG(i.score) FILTER (WHERE i.status = 'submitted')::numeric, 4)::float AS average_score
    ${FROM_INSPECTIONS}
    ${whereClause}
    GROUP BY 1, 2
    ORDER BY total_due DESC
  `;

  const rows = await sequelize.query(query, {
    replacements,
    type: QueryTypes.SELECT,
  });

  return rows.map((r) => ({
    region_id: r.region_id || null,
    region_name: r.region_name,
    total_due: r.total_due,
    completed: r.completed,
    in_progress: r.in_progress,
    pending: r.pending,
    overdue: r.overdue,
    completion_rate: safeRate(r.completed, r.total_due),
    average_score: r.average_score != null ? r.average_score : null,
  }));
};

/**
 * Fetches statistics grouped by Inspection Teams.
 */
const getTeamBreakdown = async (filters) => {
  const { whereClause, replacements } = buildFilters(filters);

  const query = `
    SELECT
      i.team_id,
      COALESCE(t.name, 'Unassigned Team') AS team_name,
      COUNT(*)::int AS total_due,
      COUNT(*) FILTER (WHERE i.status = 'submitted')::int AS completed,
      COUNT(*) FILTER (WHERE i.status = 'in_progress')::int AS in_progress,
      COUNT(*) FILTER (WHERE i.status = 'todo')::int AS pending,
      COUNT(*) FILTER (WHERE i.status <> 'submitted' AND i.due_at < NOW())::int AS overdue,
      ROUND(AVG(i.score) FILTER (WHERE i.status = 'submitted')::numeric, 4)::float AS average_score
    ${FROM_INSPECTIONS}
    LEFT JOIN teams t ON t.team_id = i.team_id
    ${whereClause}
    GROUP BY i.team_id, t.name
    ORDER BY total_due DESC
  `;

  const rows = await sequelize.query(query, {
    replacements,
    type: QueryTypes.SELECT,
  });

  return rows.map((r) => ({
    team_id: r.team_id || null,
    team_name: r.team_name,
    total_due: r.total_due,
    completed: r.completed,
    in_progress: r.in_progress,
    pending: r.pending,
    overdue: r.overdue,
    completion_rate: safeRate(r.completed, r.total_due),
    average_score: r.average_score != null ? r.average_score : null,
  }));
};

/**
 * Fetches time-series trends grouped by interval ('week', 'month', 'day').
 */
const getTrends = async (filters) => {
  const { whereClause, replacements } = buildFilters(filters);
  const interval = ["month", "day"].includes(filters.interval) ? filters.interval : "week";

  const query = `
    SELECT
      to_char(date_trunc('${interval}', i.occurrence_date), 'YYYY-MM-DD') AS period,
      COUNT(*)::int AS total_due,
      COUNT(*) FILTER (WHERE i.status = 'submitted')::int AS completed,
      COUNT(*) FILTER (WHERE i.status = 'submitted' AND NOT i.is_late)::int AS on_time,
      COUNT(*) FILTER (WHERE i.status = 'submitted' AND i.is_late)::int AS late,
      COUNT(*) FILTER (WHERE i.status <> 'submitted' AND i.due_at < NOW())::int AS overdue,
      ROUND(AVG(i.score) FILTER (WHERE i.status = 'submitted')::numeric, 4)::float AS average_score
    ${FROM_INSPECTIONS}
    ${whereClause}
    GROUP BY 1
    ORDER BY 1 ASC
  `;

  const rows = await sequelize.query(query, {
    replacements,
    type: QueryTypes.SELECT,
  });

  return rows.map((r) => ({
    period: r.period,
    interval,
    total_due: r.total_due,
    completed: r.completed,
    on_time: r.on_time,
    late: r.late,
    overdue: r.overdue,
    completion_rate: safeRate(r.completed, r.total_due),
    average_score: r.average_score != null ? r.average_score : null,
  }));
};

/**
 * Combined comprehensive analytics report matching the full contract.
 */
const getComprehensiveAnalytics = async (filters) => {
  const start = Date.now();

  const [summary, byStatus, byCategory, byRegion, byTeam, trend] = await Promise.all([
    getSummaryStats(filters),
    getStatusBreakdown(filters),
    getCategoryBreakdown(filters),
    getRegionBreakdown(filters),
    getTeamBreakdown(filters),
    getTrends(filters),
  ]);

  const durationMs = Date.now() - start;

  return {
    period: {
      from: filters.from || null,
      to: filters.to || null,
      inclusive: true,
      boundary_rule: "occurrence_date >= from AND occurrence_date <= to",
    },
    filters: {
      license_type: filters.license_type || null,
      region_id: filters.scoped_region_id || filters.region_id || null,
      team_id: filters.team_id || null,
      form_id: filters.form_id || null,
      interval: filters.interval || "week",
    },
    summary,
    by_status: byStatus,
    by_category: byCategory,
    by_region: byRegion,
    by_team: byTeam,
    trend,
    metadata: {
      api_version: "v1",
      generated_at: new Date().toISOString(),
      timezone: "Africa/Addis_Ababa",
      data_freshness: "live",
      execution_ms: durationMs,
    },
  };
};

module.exports = {
  getSummaryStats,
  getStatusBreakdown,
  getCategoryBreakdown,
  getRegionBreakdown,
  getTeamBreakdown,
  getTrends,
  getComprehensiveAnalytics,
  safeRate,
};

