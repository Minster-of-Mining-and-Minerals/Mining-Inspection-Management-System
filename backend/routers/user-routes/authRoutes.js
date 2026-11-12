const express = require("express");
const router = express.Router();
const authController = require("../../controllers/user-controllers/authController");
const { authenticateToken } = require("../../middlewares/authMiddleware");
const {
  validateLogin,
} = require("../../validators/user-validators/authValidator");
/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Authentication endpoints
 */

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login a user and get JWT token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 example: yourpassword
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 */
router.post("/login", validateLogin, authController.login);

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Logout user
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Logout successful
 */
router.post("/logout", authController.logout);

// The signed-in person's sessions (devices): list, sign out one, sign out all the others
router.get("/sessions", authenticateToken, authController.getMySessions);
router.post("/sessions/sign-out-others", authenticateToken, authController.endMyOtherSessions);
router.delete("/sessions/:id", authenticateToken, authController.endMySession);

/**
 * @swagger
 * /api/auth/me/permissions:
 *   get:
 *     summary: Get permissions for the currently logged in user
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved user permissions
 */
router.get("/me/permissions", authenticateToken, authController.getMePermissions);

module.exports = router;
