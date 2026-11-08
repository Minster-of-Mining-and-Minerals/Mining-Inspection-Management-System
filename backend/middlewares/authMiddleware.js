const jwt = require("jsonwebtoken");
const db = require("../models");
const { loadUserAuthContext } = require("../services/permissionService");

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // Bearer <token>

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Access token required",
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await db.User.findByPk(decoded.user_id, {
      attributes: { exclude: ["password"] },
    });

    if (!user || !user.is_active) {
      return res.status(403).json({
        success: false,
        message: "User not found or inactive",
      });
    }

    const authContext = await loadUserAuthContext(user.user_id);

    req.user = {
      user_id: user.user_id,
      email: user.email,
      full_name: user.full_name,
      permissions: authContext.permissions,
      roles: authContext.roles,
    };

    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(403).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};

// Permission middleware
const checkPermission = (resource, action) => {
  return (req, res, next) => {
    const requiredPermission = `${resource}:${action}`;

    if (!req.user || !req.user.permissions) {
      return res.status(403).json({
        success: false,
        message: "Access denied: No permissions found",
      });
    }

    if (!req.user.permissions.includes(requiredPermission)) {
      return res.status(403).json({
        success: false,
        message: `Access denied: Required permission ${requiredPermission}`,
      });
    }

    next();
  };
};

const checkAnyPermission = (permissionPairs) => {
  return (req, res, next) => {
    if (!req.user?.permissions?.length) {
      return res.status(403).json({
        success: false,
        message: "Access denied: No permissions found",
      });
    }

    const allowed = permissionPairs.some(([resource, action]) =>
      req.user.permissions.includes(`${resource}:${action}`),
    );

    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: "Access denied: Insufficient permissions",
      });
    }

    next();
  };
};

// Role checking middleware
const requireRole = (roleName) => {
  return (req, res, next) => {
    if (!req.user || !req.user.roles) {
      return res.status(403).json({
        success: false,
        message: "Access denied: No roles found",
      });
    }

    if (!req.user.roles.includes(roleName)) {
      return res.status(403).json({
        success: false,
        message: `Access denied: Required role ${roleName}`,
      });
    }

    next();
  };
};

// Check if user has any of the specified roles
const requireAnyRole = (roleNames) => {
  return (req, res, next) => {
    if (!req.user || !req.user.roles) {
      return res.status(403).json({
        success: false,
        message: "Access denied: No roles found",
      });
    }

    const hasRole = roleNames.some((roleName) =>
      req.user.roles.includes(roleName)
    );

    if (!hasRole) {
      return res.status(403).json({
        success: false,
        message: `Access denied: Required one of roles: ${roleNames.join(
          ", "
        )}`,
      });
    }

    next();
  };
};

/**
 * Login + permission in one step, for use directly on a route:
 *   router.post("/", authorize("users", "create"), createUser)
 */
const authorize = (resource, action) => [authenticateToken, checkPermission(resource, action)];

/** Login + at least one of the given [resource, action] permissions. */
const authorizeAny = (permissionPairs) => [authenticateToken, checkAnyPermission(permissionPairs)];

module.exports = {
  authenticateToken,
  authorize,
  authorizeAny,
  checkPermission,
  checkAnyPermission,
  requireRole,
  requireAnyRole,
};
