"use strict";

const { validate: isUuid } = require("uuid");
const service = require("../../services/integrationAnalyticsService");

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validates request query parameters.
 * Returns { valid: true, filters } or { valid: false, error, status }.
 */
const validateFilters = (query, integrationClient) => {
  const { from, to, license_type, region_id, team_id, form_id, interval } = query;

  if (from && (!DATE_REGEX.test(from) || isNaN(Date.parse(from)))) {
    return { valid: false, status: 400, error: "Invalid 'from' date format. Expected YYYY-MM-DD." };
  }
  if (to && (!DATE_REGEX.test(to) || isNaN(Date.parse(to)))) {
    return { valid: false, status: 400, error: "Invalid 'to' date format. Expected YYYY-MM-DD." };
  }
  if (from && to && from > to) {
    return { valid: false, status: 400, error: "Invalid date range: 'from' must be earlier than or equal to 'to'." };
  }

  if (license_type && !["exploration", "mining"].includes(license_type)) {
    return { valid: false, status: 400, error: "Invalid 'license_type'. Allowed values: 'exploration', 'mining'." };
  }

  if (region_id && !isUuid(region_id)) {
    return { valid: false, status: 400, error: "Invalid 'region_id' format. Expected UUID." };
  }

  if (team_id && !isUuid(team_id)) {
    return { valid: false, status: 400, error: "Invalid 'team_id' format. Expected UUID." };
  }

  if (form_id && !isUuid(form_id)) {
    return { valid: false, status: 400, error: "Invalid 'form_id' format. Expected UUID." };
  }

  if (interval && !["week", "month", "day"].includes(interval)) {
    return { valid: false, status: 400, error: "Invalid 'interval'. Allowed values: 'week', 'month', 'day'." };
  }

  // Enforce organizational scope if restricted
  if (integrationClient?.scoped_region_id) {
    if (region_id && region_id !== integrationClient.scoped_region_id) {
      return {
        valid: false,
        status: 403,
        error: "Access denied: Requested region is outside your authorized organizational scope.",
      };
    }
  }

  return {
    valid: true,
    filters: {
      from: from || null,
      to: to || null,
      license_type: license_type || null,
      region_id: region_id || null,
      team_id: team_id || null,
      form_id: form_id || null,
      interval: interval || "week",
      scoped_region_id: integrationClient?.scoped_region_id || null,
    },
  };
};

/**
 * Log integration access without logging any sensitive data.
 */
const logIntegrationAccess = (req, endpoint, statusCode, durationMs) => {
  const client = req.integrationClient?.client_name || req.integrationClient?.client_id || "anonymous";
  console.log(
    `[PMS-Integration] ${req.method} ${endpoint} | client="${client}" | status=${statusCode} | duration=${durationMs}ms`
  );
};

/**
 * GET /api/v1/integration/inspection-analytics
 * Full comprehensive statistics for the Plan Management System dashboard.
 */
const getComprehensiveAnalytics = async (req, res) => {
  const start = Date.now();
  try {
    const check = validateFilters(req.query, req.integrationClient);
    if (!check.valid) {
      logIntegrationAccess(req, req.originalUrl, check.status, Date.now() - start);
      return res.status(check.status).json({ success: false, message: check.error });
    }

    const data = await service.getComprehensiveAnalytics(check.filters);
    logIntegrationAccess(req, req.originalUrl, 200, Date.now() - start);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("[PMS-Integration] Error generating comprehensive analytics:", error);
    logIntegrationAccess(req, req.originalUrl, 500, Date.now() - start);
    return res.status(500).json({
      success: false,
      message: "An error occurred while compiling inspection analytics.",
    });
  }
};

/**
 * GET /api/v1/integration/inspection-analytics/summary
 * Summary metrics (total due, completed, in-progress, pending, overdue, completion rate, avg score).
 */
const getSummary = async (req, res) => {
  const start = Date.now();
  try {
    const check = validateFilters(req.query, req.integrationClient);
    if (!check.valid) {
      logIntegrationAccess(req, req.originalUrl, check.status, Date.now() - start);
      return res.status(check.status).json({ success: false, message: check.error });
    }

    const summary = await service.getSummaryStats(check.filters);
    logIntegrationAccess(req, req.originalUrl, 200, Date.now() - start);

    return res.status(200).json({
      success: true,
      data: {
        period: { from: check.filters.from, to: check.filters.to, inclusive: true },
        summary,
        metadata: {
          api_version: "v1",
          generated_at: new Date().toISOString(),
          timezone: "Africa/Addis_Ababa",
        },
      },
    });
  } catch (error) {
    console.error("[PMS-Integration] Error fetching summary analytics:", error);
    logIntegrationAccess(req, req.originalUrl, 500, Date.now() - start);
    return res.status(500).json({
      success: false,
      message: "An error occurred while compiling summary statistics.",
    });
  }
};

/**
 * GET /api/v1/integration/inspection-analytics/by-status
 */
const getStatusBreakdown = async (req, res) => {
  const start = Date.now();
  try {
    const check = validateFilters(req.query, req.integrationClient);
    if (!check.valid) {
      logIntegrationAccess(req, req.originalUrl, check.status, Date.now() - start);
      return res.status(check.status).json({ success: false, message: check.error });
    }

    const by_status = await service.getStatusBreakdown(check.filters);
    logIntegrationAccess(req, req.originalUrl, 200, Date.now() - start);

    return res.status(200).json({
      success: true,
      data: {
        period: { from: check.filters.from, to: check.filters.to, inclusive: true },
        by_status,
        metadata: { api_version: "v1", generated_at: new Date().toISOString() },
      },
    });
  } catch (error) {
    console.error("[PMS-Integration] Error fetching status breakdown:", error);
    logIntegrationAccess(req, req.originalUrl, 500, Date.now() - start);
    return res.status(500).json({
      success: false,
      message: "An error occurred while compiling status breakdown.",
    });
  }
};

/**
 * GET /api/v1/integration/inspection-analytics/by-category
 */
const getCategoryBreakdown = async (req, res) => {
  const start = Date.now();
  try {
    const check = validateFilters(req.query, req.integrationClient);
    if (!check.valid) {
      logIntegrationAccess(req, req.originalUrl, check.status, Date.now() - start);
      return res.status(check.status).json({ success: false, message: check.error });
    }

    const by_category = await service.getCategoryBreakdown(check.filters);
    logIntegrationAccess(req, req.originalUrl, 200, Date.now() - start);

    return res.status(200).json({
      success: true,
      data: {
        period: { from: check.filters.from, to: check.filters.to, inclusive: true },
        by_category,
        metadata: { api_version: "v1", generated_at: new Date().toISOString() },
      },
    });
  } catch (error) {
    console.error("[PMS-Integration] Error fetching category breakdown:", error);
    logIntegrationAccess(req, req.originalUrl, 500, Date.now() - start);
    return res.status(500).json({
      success: false,
      message: "An error occurred while compiling category breakdown.",
    });
  }
};

/**
 * GET /api/v1/integration/inspection-analytics/by-region
 */
const getRegionBreakdown = async (req, res) => {
  const start = Date.now();
  try {
    const check = validateFilters(req.query, req.integrationClient);
    if (!check.valid) {
      logIntegrationAccess(req, req.originalUrl, check.status, Date.now() - start);
      return res.status(check.status).json({ success: false, message: check.error });
    }

    const by_region = await service.getRegionBreakdown(check.filters);
    logIntegrationAccess(req, req.originalUrl, 200, Date.now() - start);

    return res.status(200).json({
      success: true,
      data: {
        period: { from: check.filters.from, to: check.filters.to, inclusive: true },
        by_region,
        metadata: { api_version: "v1", generated_at: new Date().toISOString() },
      },
    });
  } catch (error) {
    console.error("[PMS-Integration] Error fetching region breakdown:", error);
    logIntegrationAccess(req, req.originalUrl, 500, Date.now() - start);
    return res.status(500).json({
      success: false,
      message: "An error occurred while compiling regional breakdown.",
    });
  }
};

/**
 * GET /api/v1/integration/inspection-analytics/by-team
 */
const getTeamBreakdown = async (req, res) => {
  const start = Date.now();
  try {
    const check = validateFilters(req.query, req.integrationClient);
    if (!check.valid) {
      logIntegrationAccess(req, req.originalUrl, check.status, Date.now() - start);
      return res.status(check.status).json({ success: false, message: check.error });
    }

    const by_team = await service.getTeamBreakdown(check.filters);
    logIntegrationAccess(req, req.originalUrl, 200, Date.now() - start);

    return res.status(200).json({
      success: true,
      data: {
        period: { from: check.filters.from, to: check.filters.to, inclusive: true },
        by_team,
        metadata: { api_version: "v1", generated_at: new Date().toISOString() },
      },
    });
  } catch (error) {
    console.error("[PMS-Integration] Error fetching team breakdown:", error);
    logIntegrationAccess(req, req.originalUrl, 500, Date.now() - start);
    return res.status(500).json({
      success: false,
      message: "An error occurred while compiling team breakdown.",
    });
  }
};

/**
 * GET /api/v1/integration/inspection-analytics/trends
 */
const getTrends = async (req, res) => {
  const start = Date.now();
  try {
    const check = validateFilters(req.query, req.integrationClient);
    if (!check.valid) {
      logIntegrationAccess(req, req.originalUrl, check.status, Date.now() - start);
      return res.status(check.status).json({ success: false, message: check.error });
    }

    const trend = await service.getTrends(check.filters);
    logIntegrationAccess(req, req.originalUrl, 200, Date.now() - start);

    return res.status(200).json({
      success: true,
      data: {
        period: { from: check.filters.from, to: check.filters.to, inclusive: true },
        interval: check.filters.interval,
        trend,
        metadata: { api_version: "v1", generated_at: new Date().toISOString() },
      },
    });
  } catch (error) {
    console.error("[PMS-Integration] Error fetching trends:", error);
    logIntegrationAccess(req, req.originalUrl, 500, Date.now() - start);
    return res.status(500).json({
      success: false,
      message: "An error occurred while compiling time-series trends.",
    });
  }
};

module.exports = {
  getComprehensiveAnalytics,
  getSummary,
  getStatusBreakdown,
  getCategoryBreakdown,
  getRegionBreakdown,
  getTeamBreakdown,
  getTrends,
  validateFilters,
};

