const express = require("express");
const router = express.Router();
const {
  createUser,
  getUsers,
  getUserById,
  updateUser,
  deleteUser,
  toggleUserActiveStatus,
  resetUserPassword,
  getUserSessions,
  signOutUserEverywhere,
  getProfile,
  getUserTypes,
  getUserPositions,
} = require("../../controllers/user-controllers/userController");
const { authenticateToken, authorize } = require("../../middlewares/authMiddleware");
const { validateCreateUser, validateUpdateUser } = require("../../validators/user-validators/userValidator");

// Middleware for authentication if needed (example)
// const { authenticate } = require("../middlewares/authMiddleware");

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: User management and retrieval
 */

/**
 * @swagger
 * /users/types:
 *   get:
 *     summary: Get all user types
 *     tags: [Users]
 *     responses:
 *       200:
 *         description: List of user types
 */
router.get("/types", authenticateToken, getUserTypes);

/**
 * @swagger
 * /users/positions:
 *   get:
 *     summary: Get all user positions
 *     tags: [Users]
 *     responses:
 *       200:
 *         description: List of user positions
 */
router.get("/positions", authenticateToken, getUserPositions);

/**
 * @swagger
 * /users:
 *   get:
 *     summary: Get all users
 *     tags: [Users]
 *     parameters:
 *       - in: query
 *         name: user_type_id
 *         schema:
 *           type: string
 *         description: Filter by user type
 *       - in: query
 *         name: is_active
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name, email, or phone number
 *     responses:
 *       200:
 *         description: List of users
 */
router.get("/", authorize("users", "read"), getUsers);

/**
 * @swagger
 * /users/{id}:
 *   get:
 *     summary: Get a user by ID
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: User details
 */
router.get("/:id", authorize("users", "read"), getUserById);

/**
 * @swagger
 * /users/profile:
 *   get:
 *     summary: Get current logged in user's profile
 *     tags: [Users]
 *     responses:
 *       200:
 *         description: User profile
 */
router.get("/profile/me", authenticateToken, getProfile);

/**
 * @swagger
 * /users:
 *   post:
 *     summary: Create a new user
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - full_name
 *               - email
 *               - user_type_id
 *             properties:
 *               full_name:
 *                 type: string
 *               email:
 *                 type: string
 *               phone_number:
 *                 type: string
 *               user_type_id:
 *                 type: string
 *               role_ids:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: User created
 */
router.post("/", authorize("users", "create"), validateCreateUser, createUser);

/**
 * @swagger
 * /users/{id}:
 *   put:
 *     summary: Update a user
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               full_name:
 *                 type: string
 *               email:
 *                 type: string
 *               phone_number:
 *                 type: string
 *               user_type_id:
 *                 type: string
 *               role_ids:
 *                 type: array
 *                 items:
 *                   type: string
 *               is_active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: User updated
 */
router.put("/:id", authorize("users", "update"), validateUpdateUser, updateUser);

/**
 * @swagger
 * /users/{id}:
 *   delete:
 *     summary: Deactivate a user
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User deactivated
 */
router.delete("/:id", authorize("users", "delete"), deleteUser);

/**
 * @swagger
 * /users/{id}/toggle-status:
 *   patch:
 *     summary: Toggle user active status
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               is_active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Status updated
 */
router.patch("/:id/toggle-status", authorize("users", "update"), toggleUserActiveStatus);

/**
 * @swagger
 * /users/{id}/reset-password:
 *   post:
 *     summary: Reset user password
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Password reset successfully
 */
router.post("/:id/reset-password", authorize("users", "update"), resetUserPassword);

// A user's sessions (devices) and signing them out everywhere
router.get("/:id/sessions", authorize("users", "read"), getUserSessions);
router.post("/:id/sessions/sign-out", authorize("users", "update"), signOutUserEverywhere);

module.exports = router;
