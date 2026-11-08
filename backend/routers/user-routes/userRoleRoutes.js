const express = require("express");
const router = express.Router();
const {
  assignRolesToUser,
  removeRoleFromUser,
} = require("../../controllers/user-controllers/userRolesController");
const { authorize } = require("../../middlewares/authMiddleware");

/**
 * @swagger
 * tags:
 *   name: UserRoles
 *   description: Assign and remove roles for users
 */

/**
 * @swagger
 * /user-roles/assign:
 *   post:
 *     summary: Assign roles to a user
 *     tags: [UserRoles]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - user_id
 *               - role_ids
 *             properties:
 *               user_id:
 *                 type: string
 *                 description: ID of the user
 *               role_ids:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of role IDs to assign
 *     responses:
 *       200:
 *         description: Roles assigned successfully
 */
router.post("/assign", authorize("users", "assign_role"), assignRolesToUser);

/**
 * @swagger
 * /user-roles/remove:
 *   post:
 *     summary: Remove a role from a user
 *     tags: [UserRoles]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - user_id
 *               - role_id
 *             properties:
 *               user_id:
 *                 type: string
 *                 description: ID of the user
 *               role_id:
 *                 type: string
 *                 description: Role ID to remove
 *     responses:
 *       200:
 *         description: Role removed successfully
 */
router.post("/remove", authorize("users", "assign_role"), removeRoleFromUser);

module.exports = router;
