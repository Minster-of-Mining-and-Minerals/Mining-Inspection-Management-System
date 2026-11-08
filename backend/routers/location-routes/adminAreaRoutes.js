"use strict";
const express = require("express");
const router = express.Router();

const {
  getAdminAreas,
  getAdminAreaById,
  createAdminArea,
  updateAdminArea,
  addAreaAlias,
  deleteAreaAlias,
  locatePoint,
  getAdminAreaStats,
} = require("../../controllers/location-controllers/adminAreaController");
const { authorize } = require("../../middlewares/authMiddleware");
const {
  validateCreateArea,
  validateUpdateArea,
  validateAreaAlias,
} = require("../../validators/location-validators/adminAreaValidator");

/**
 * Region → Zone → Woreda reference list.
 *   GET    /api/admin-areas?level=&parent_id=&search=&page=&limit=
 *   GET    /api/admin-areas/stats
 *   GET    /api/admin-areas/locate?lat=&lng=     which woreda contains a GPS point
 *   GET    /api/admin-areas/:id[?include_boundary=true]
 *   POST   /api/admin-areas                      add an area by hand
 *   PUT    /api/admin-areas/:id                  name / Amharic name / active
 *   POST   /api/admin-areas/:id/aliases          save another spelling
 *   DELETE /api/admin-areas/aliases/:aliasId
 */
router.get("/", authorize("admin_areas", "read"), getAdminAreas);
router.get("/stats", authorize("admin_areas", "read"), getAdminAreaStats);
router.get("/locate", authorize("admin_areas", "read"), locatePoint);
router.get("/:id", authorize("admin_areas", "read"), getAdminAreaById);
router.post("/", authorize("admin_areas", "create"), validateCreateArea, createAdminArea);
router.put("/:id", authorize("admin_areas", "update"), validateUpdateArea, updateAdminArea);
router.post("/:id/aliases", authorize("admin_areas", "update"), validateAreaAlias, addAreaAlias);
router.delete("/aliases/:aliasId", authorize("admin_areas", "update"), deleteAreaAlias);

module.exports = router;
