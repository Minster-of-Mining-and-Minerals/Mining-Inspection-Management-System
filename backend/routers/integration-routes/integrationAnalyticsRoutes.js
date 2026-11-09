const express = require("express");
const router = express.Router();
const controller = require("../../controllers/integration-controllers/inspectionAnalyticsController");
const { authenticateIntegrationClient } = require("../../middlewares/integrationAuthMiddleware");
const { integrationRateLimiter } = require("../../middlewares/integrationRateLimiter");

// Apply rate limiter and authentication to all integration routes
router.use(integrationRateLimiter);
router.use(authenticateIntegrationClient);

/**
 * @openapi
 * tags:
 *   name: Integration - Inspection Analytics
 *   description: Read-only aggregated analytics API for Plan Management System (PMS) dashboard integration
 */

/**
 * @openapi
 * components:
 *   securitySchemes:
 *     ApiKeyAuth:
 *       type: apiKey
 *       in: header
 *       name: X-API-Key
 *       description: Pre-shared integration key for Plan Management System
 *     BearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *       description: JWT token with inspection_analytics:read permission
 *   schemas:
 *     AnalyticsSummary:
 *       type: object
 *       properties:
 *         total_inspections:
 *           type: integer
 *           example: 124
 *         completed_inspections:
 *           type: integer
 *           example: 98
 *         pending_inspections:
 *           type: integer
 *           example: 18
 *         in_progress_inspections:
 *           type: integer
 *           example: 8
 *         overdue_inspections:
 *           type: integer
 *           example: 5
 *         on_time_inspections:
 *           type: integer
 *           example: 92
 *         late_inspections:
 *           type: integer
 *           example: 6
 *         returned_count:
 *           type: integer
 *           example: 3
 *         completion_rate:
 *           type: number
 *           format: float
 *           example: 79.03
 *         overdue_rate:
 *           type: number
 *           format: float
 *           example: 4.03
 *         average_compliance_score:
 *           type: number
 *           format: float
 *           example: 84.5
 *         active_companies_inspected:
 *           type: integer
 *           example: 42
 *         distinct_licenses_inspected:
 *           type: integer
 *           example: 56
 *     StatusBreakdownItem:
 *       type: object
 *       properties:
 *         status:
 *           type: string
 *           enum: [todo, in_progress, submitted]
 *           example: submitted
 *         count:
 *           type: integer
 *           example: 98
 *         percentage:
 *           type: number
 *           format: float
 *           example: 79.03
 *     CategoryBreakdownItem:
 *       type: object
 *       properties:
 *         license_type:
 *           type: string
 *           example: Mining
 *         total:
 *           type: integer
 *           example: 75
 *         completed:
 *           type: integer
 *           example: 60
 *         in_progress:
 *           type: integer
 *           example: 10
 *         pending:
 *           type: integer
 *           example: 5
 *         overdue:
 *           type: integer
 *           example: 3
 *         completion_rate:
 *           type: number
 *           format: float
 *           example: 80.0
 *     RegionBreakdownItem:
 *       type: object
 *       properties:
 *         region_id:
 *           type: string
 *           example: "uuid-or-code"
 *         region_name:
 *           type: string
 *           example: "Oromia"
 *         total:
 *           type: integer
 *           example: 45
 *         completed:
 *           type: integer
 *           example: 38
 *         in_progress:
 *           type: integer
 *           example: 4
 *         pending:
 *           type: integer
 *           example: 3
 *         overdue:
 *           type: integer
 *           example: 2
 *         completion_rate:
 *           type: number
 *           format: float
 *           example: 84.44
 *     TeamBreakdownItem:
 *       type: object
 *       properties:
 *         team_id:
 *           type: string
 *           example: "uuid"
 *         team_name:
 *           type: string
 *           example: "Oromia Regional Team A"
 *         team_code:
 *           type: string
 *           example: "ORT-A"
 *         total:
 *           type: integer
 *           example: 22
 *         completed:
 *           type: integer
 *           example: 19
 *         in_progress:
 *           type: integer
 *           example: 2
 *         pending:
 *           type: integer
 *           example: 1
 *         overdue:
 *           type: integer
 *           example: 0
 *         completion_rate:
 *           type: number
 *           format: float
 *           example: 86.36
 *     TrendItem:
 *       type: object
 *       properties:
 *         period:
 *           type: string
 *           example: "2026-03"
 *         total:
 *           type: integer
 *           example: 25
 *         completed:
 *           type: integer
 *           example: 20
 *         in_progress:
 *           type: integer
 *           example: 3
 *         pending:
 *           type: integer
 *           example: 2
 *         overdue:
 *           type: integer
 *           example: 1
 *         completion_rate:
 *           type: number
 *           format: float
 *           example: 80.0
 *     StandardResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         data:
 *           type: object
 *         metadata:
 *           type: object
 *           properties:
 *             generated_at:
 *               type: string
 *               format: date-time
 *             filters_applied:
 *               type: object
 *             disclaimer:
 *               type: string
 */

/**
 * @openapi
 * /api/v1/integration/inspection-analytics:
 *   get:
 *     summary: Comprehensive Inspection Analytics
 *     description: Retrieve all high-level inspection statistics including summary, status, category, region, and team breakdowns.
 *     tags: [Integration - Inspection Analytics]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date filter (ISO format YYYY-MM-DD)
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date
 *         description: End date filter (ISO format YYYY-MM-DD)
 *       - in: query
 *         name: license_type
 *         schema:
 *           type: string
 *         description: Filter by license category/type (e.g. Mining, Exploration)
 *       - in: query
 *         name: region_id
 *         schema:
 *           type: string
 *         description: Filter by administrative region ID
 *       - in: query
 *         name: team_id
 *         schema:
 *           type: string
 *         description: Filter by operational team ID
 *     responses:
 *       200:
 *         description: Analytics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *       400:
 *         description: Invalid query parameters or date bounds
 *       401:
 *         description: Unauthorized - missing or invalid API key / token
 *       403:
 *         description: Forbidden - insufficient permissions
 *       429:
 *         description: Rate limit exceeded
 */
router.get("/", controller.getComprehensiveAnalytics);

/**
 * @openapi
 * /api/v1/integration/inspection-analytics/summary:
 *   get:
 *     summary: KPI Summary Statistics
 *     description: Retrieve top-level KPI metrics (totals, completion rates, compliance score averages).
 *     tags: [Integration - Inspection Analytics]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: license_type
 *         schema:
 *           type: string
 *       - in: query
 *         name: region_id
 *         schema:
 *           type: string
 *       - in: query
 *         name: team_id
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: KPI summary retrieved
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.get("/summary", controller.getSummary);

/**
 * @openapi
 * /api/v1/integration/inspection-analytics/by-status:
 *   get:
 *     summary: Inspection Breakdown by Status
 *     description: Counts and percentages across operational inspection statuses (todo, in_progress, submitted).
 *     tags: [Integration - Inspection Analytics]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Status breakdown retrieved
 */
router.get("/by-status", controller.getStatusBreakdown);

/**
 * @openapi
 * /api/v1/integration/inspection-analytics/by-category:
 *   get:
 *     summary: Inspection Breakdown by License Category
 *     description: Aggregated counts and rates grouped by license category (Mining vs Exploration).
 *     tags: [Integration - Inspection Analytics]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Category breakdown retrieved
 */
router.get("/by-category", controller.getCategoryBreakdown);

/**
 * @openapi
 * /api/v1/integration/inspection-analytics/by-region:
 *   get:
 *     summary: Inspection Breakdown by Geographic Region
 *     description: Aggregated counts and rates grouped by administrative region.
 *     tags: [Integration - Inspection Analytics]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Regional breakdown retrieved
 */
router.get("/by-region", controller.getRegionBreakdown);

/**
 * @openapi
 * /api/v1/integration/inspection-analytics/by-team:
 *   get:
 *     summary: Inspection Breakdown by Team
 *     description: Aggregated counts and rates grouped by operational team.
 *     tags: [Integration - Inspection Analytics]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Team breakdown retrieved
 */
router.get("/by-team", controller.getTeamBreakdown);

/**
 * @openapi
 * /api/v1/integration/inspection-analytics/trends:
 *   get:
 *     summary: Time-Series Inspection Trends
 *     description: Periodic inspection trends aggregated by day, week, or month.
 *     tags: [Integration - Inspection Analytics]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: interval
 *         schema:
 *           type: string
 *           enum: [day, week, month]
 *           default: month
 *         description: Aggregation grouping interval
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Trends retrieved
 */
router.get("/trends", controller.getTrends);

module.exports = router;

