"use strict";
const express = require("express");
const { authenticateToken, checkPermission } = require("../../middlewares/authMiddleware");
const map = require("../../controllers/dashboard-controllers/submissionMapController");
const analytics = require("../../controllers/dashboard-controllers/analyticsController");

/**
 * /api/dashboard   (staff dashboard: dashboard:view and inspections:read_all)
 *   GET /analytics                totals, trends and breakdowns for the director's dashboard
 *   GET /submission-map           GPS points of submitted inspections, with filters
 *   GET /submission-map/options   values for the filters
 */
const router = express.Router();
const staff = [authenticateToken, checkPermission("dashboard", "view"), checkPermission("inspections", "read_all")];

router.get("/analytics", ...staff, analytics.getAnalytics);
router.get("/submission-map", ...staff, map.getSubmissionMap);
router.get("/submission-map/options", ...staff, map.getSubmissionMapOptions);

module.exports = router;
