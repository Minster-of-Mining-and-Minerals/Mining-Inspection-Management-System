const express = require("express");
const { authorize } = require("../../middlewares/authMiddleware");
const audit = require("../../controllers/audit-controllers/auditController");

/** Audit log, read only (audit:read). Nothing can be changed or deleted through the API. */
const router = express.Router();
router.get("/", authorize("audit", "read"), audit.getAuditLogs);
router.get("/:id", authorize("audit", "read"), audit.getAuditLog);
module.exports = router;
