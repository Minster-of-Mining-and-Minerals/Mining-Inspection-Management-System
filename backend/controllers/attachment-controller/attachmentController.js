const { Attachment } = require("../../models");
const path = require("path");
const fs = require("fs");

// ================================
// UPLOAD FILES (no issue linked)
// ================================
const uploadFiles = async (req, res) => {
  try {
    // Check if files exist
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No files uploaded",
      });
    }

    // Create upload directory if it doesn't exist
    const uploadDir = path.join("uploads", "attachments");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const uploadedFiles = [];

    for (const file of req.files) {
      const newPath = path.join(uploadDir, file.filename);
      fs.copyFileSync(file.path, newPath);
      fs.unlinkSync(file.path);

      // Build the record data
      const recordData = {
        file_name: file.filename,
        file_path: newPath,
        created_at: new Date(),
      };

      // Only add uploaded_by if req.user exists
      if (req.user && req.user.user_id) {
        recordData.uploaded_by = req.user.user_id;
      }

      // Save entry in Attachment table
      const record = await Attachment.create(recordData);

      uploadedFiles.push({
        attachment_id: record.attachment_id,
        file_name: record.file_name,
        file_path: record.file_path,
      });
    }

    return res.status(201).json({
      success: true,
      message: "Files uploaded successfully",
      attachments: uploadedFiles,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return res.status(500).json({
      success: false,
      message: "Error uploading files",
      error: error.message,
    });
  }
};

// ================================
// DELETE FILE BY ATTACHMENT ID
// ================================
const deleteAttachment = async (req, res) => {
  try {
    const { attachment_id } = req.params;

    // Own uploads only (central users: any)
    const file = await Attachment.findOne({
      where: { attachment_id, ...(req.scope?.isCentral ? {} : { uploaded_by: req.user.user_id }) },
    });
    if (!file) {
      return res.status(404).json({
        success: false,
        message: "Attachment not found",
      });
    }

    if (fs.existsSync(file.file_path)) {
      fs.unlinkSync(file.file_path);
    }

    await file.destroy();

    return res.status(200).json({
      success: true,
      message: "Attachment deleted",
      deleted_attachment: {
        attachment_id,
        file_name: file.file_name,
      },
    });
  } catch (error) {
    console.error("Delete error:", error);
    return res.status(500).json({
      success: false,
      message: "Error deleting attachment",
      error: error.message,
    });
  }
};

// ================================
// GET ATTACHMENT LIST
// ================================
const getAllAttachments = async (req, res) => {
  try {
    // Own uploads only (central users: all)
    const attachments = await Attachment.findAll({
      where: req.scope?.isCentral ? {} : { uploaded_by: req.user.user_id },
      order: [["created_at", "DESC"]],
      attributes: [
        "attachment_id",
        "file_name",
        "file_path",
        "uploaded_by",
        "created_at",
      ],
    });

    return res.status(200).json({
      success: true,
      count: attachments.length,
      attachments,
    });
  } catch (error) {
    console.error("Fetch error:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching attachments",
      error: error.message,
    });
  }
};

module.exports = {
  uploadFiles,
  deleteAttachment,
  getAllAttachments,
};
