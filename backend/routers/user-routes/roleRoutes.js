const express = require("express");
const router = express.Router();

const {
  validateCreateRole,
  validateUpdateRole,
  validateCopyRole,
} = require("../../validators/user-validators/roleValidator");

const { authorize } = require("../../middlewares/authMiddleware");

// Setting a role's permissions (permission_ids in the body) also needs roles:assign_permission
const requirePermissionChangeRight = (req, res, next) => {
  if (req.body?.permission_ids === undefined) return next();
  if (req.user?.permissions?.includes("roles:assign_permission")) return next();
  return res.status(403).json({
    success: false,
    message: "Access denied: Required permission roles:assign_permission",
  });
};

const {
  createRole,
  copyRole,
  getRoles,
  getRoleById,
  updateRole,
  deleteRole,
} = require("../../controllers/user-controllers/roleController");

router.post("/", authorize("roles", "create"), requirePermissionChangeRight, validateCreateRole, createRole);
router.get("/", authorize("roles", "read"), getRoles);
router.get("/:id", authorize("roles", "read"), getRoleById);
// Copy a (global) role into a sector to change it there: { name?, description?, sector_node_id? (central) }
router.post("/:id/copy", authorize("roles", "create"), validateCopyRole, copyRole);
router.put("/:id", authorize("roles", "update"), requirePermissionChangeRight, validateUpdateRole, updateRole);
router.delete("/:id", authorize("roles", "delete"), deleteRole);

/**
 * @swagger
 * tags:
 *   name: Roles
 *   description: Manage system roles and their permissions
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     PermissionRef:
 *       type: object
 *       properties:
 *         permission_id:
 *           type: string
 *         resource:
 *           type: string
 *         action:
 *           type: string
 *
 *     Role:
 *       type: object
 *       properties:
 *         role_id:
 *           type: string
 *         name:
 *           type: string
 *         description:
 *           type: string
 *         is_active:
 *           type: boolean
 *         rolePermissions:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               role_permission_id:
 *                 type: string
 *               permission:
 *                 $ref: '#/components/schemas/PermissionRef'
 *
 *     CreateRoleRequest:
 *       type: object
 *       required:
 *         - name
 *       properties:
 *         name:
 *           type: string
 *         description:
 *           type: string
 *         permission_ids:
 *           type: array
 *           items:
 *             type: string
 *
 *     UpdateRoleRequest:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *         description:
 *           type: string
 *         permission_ids:
 *           type: array
 *           items:
 *             type: string
 */

/**
 * @swagger
 * /api/roles:
 *   post:
 *     summary: Create a new role with permissions
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateRoleRequest'
 *     responses:
 *       201:
 *         description: Role created successfully
 *       400:
 *         description: Invalid payload or role already exists
 *
 *   get:
 *     summary: Get all roles
 *     tags: [Roles]
 *     parameters:
 *       - in: query
 *         name: is_active
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: List of roles
 */

/**
 * @swagger
 * /api/roles/{id}:
 *   get:
 *     summary: Get a specific role by ID
 *     tags: [Roles]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Role found
 *       404:
 *         description: Role not found
 *
 *   put:
 *     summary: Update a role (including its permissions)
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateRoleRequest'
 *     responses:
 *       200:
 *         description: Updated successfully
 *
 *   delete:
 *     summary: Soft delete a role
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Deleted successfully
 *       400:
 *         description: Cannot delete — role in use
 */

module.exports = router;
