const express = require("express");
const router = express.Router();

const upload = require("../../middlewares/uploadMiddleware");
const {
  uploadFiles,
  getAllAttachments,
  deleteAttachment,
} = require("../../controllers/attachment-controller/attachmentController");
const { authenticateToken } = require("../../middlewares/authMiddleware");

router.post("/", authenticateToken, upload.array("files", 10), uploadFiles);

router.get("/", authenticateToken, getAllAttachments);

router.delete("/:attachment_id", authenticateToken, deleteAttachment);

module.exports = router;
