"use strict";
const express = require("express");
const router = express.Router();

const {
  createSectorNode,
  getSectorNodes,
  getSectorNodeById,
  updateSectorNode,
  deleteSectorNode,
  toggleSectorNodeActiveStatus,
  getSectorNodeUsers,
  getSectorNodeChildrenUsers,
  getSectorsWithFlatChildren,
} = require("../../controllers/sector-controllers/sectorController");

const { authenticateToken } = require("../../middlewares/authMiddleware");

const {
  validateCreateSectorNode,
  validateUpdateSectorNode,
} = require("../../validators/sector-validators/sectorValidator");

/**
 * @swagger
 * tags:
 *   name: SectorNodes
 *   description: Sector management
 */

/**
 * @swagger
 * /sector-nodes:
 *   get:
 *     summary: Get all sector nodes
 *     tags: [SectorNodes]
 *     parameters:
 *       - in: query
 *         name: is_active
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search nodes by name
 *     responses:
 *       200:
 *         description: List of sector nodes
 */
router.get("/", getSectorNodes);

/**
 * @swagger
 * /sector-nodes:
 *   get:
 *     summary: Get all sector nodes with flat children
 *     tags: [SectorNodes]
 *     parameters:
 *       - in: query
 *         name: is_active
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search nodes by name
 *     responses:
 *       200:
 *         description: List of sector nodes with flat children 
 */
router.get("/flat", getSectorsWithFlatChildren);

/**
 * @swagger
 * /sector-nodes/children-users/:id
 *   get:
 *     summary: Get all users under a sector node (including descendants)
 *     tags: [SectorNodes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Sector node ID
 *     responses:
 *       200:
 *         description: List of users under the sector node
 */
router.get("/children-users/:id", getSectorNodeChildrenUsers);

/**
 * @swagger
 * /sector-nodes/users/:id
 *   get:
 *     summary: Get all users directly under a sector node (no descendants)
 *     tags: [SectorNodes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Sector node ID
 *     responses:
 *       200:
 *         description: List of users directly under the sector node
 */
router.get("/users/:id", getSectorNodeUsers);

/**
 * @swagger
 * /sector-nodes/{id}:
 *   get:
 *     summary: Get sector node by ID
 *     tags: [SectorNodes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Sector node ID
 *     responses:
 *       200:
 *         description: Sector node details
 */
router.get("/:id", getSectorNodeById);

/**
 * @swagger
 * /sector-nodes:
 *   post:
 *     summary: Create a new sector node
 *     tags: [SectorNodes]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               parent_id:
 *                 type: string
 *               level:
 *                 type: number
 *     responses:
 *       201:
 *         description: Sector node created successfully
 */
router.post("/", validateCreateSectorNode, createSectorNode);

/**
 * @swagger
 * /sector-nodes/{id}:
 *   put:
 *     summary: Update a sector node
 *     tags: [SectorNodes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Sector node ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               parent_id:
 *                 type: string
 *               level:
 *                 type: number
 *               is_active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Sector node updated successfully
 */
router.put("/:id", validateUpdateSectorNode, updateSectorNode);

/**
 * @swagger
 * /sector-nodes/{id}:
 *   delete:
 *     summary: Deactivate a sector node
 *     tags: [SectorNodes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Sector node ID
 *     responses:
 *       200:
 *         description: Sector node deactivated successfully
 */
router.delete("/:id", deleteSectorNode);

/**
 * @swagger
 * /sector-nodes/{id}/toggle-status:
 *   patch:
 *     summary: Toggle sector node active status
 *     tags: [SectorNodes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Sector node ID
 *     responses:
 *       200:
 *         description: Sector node status updated
 */
router.patch("/:id/toggle-status", toggleSectorNodeActiveStatus);

module.exports = router;
