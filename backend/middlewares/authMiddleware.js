const jwt = require("jsonwebtoken");
const db = require("../models");
const { loadUserAuthContext } = require("../services/permissionService");
const { resolveScope } = require("../services/sectorScope");
const { checkSession } = require("../services/sessionService");

/** Why a session can't be used any more (shown on the sign-in page). */
const SESSION_ENDED_MESSAGE = {
  no_session: "Please sign in again.",
  signed_out: "You were signed out. Please sign in again.",
  signed_out_by_user: "This device was signed out from another device. Please sign in again.",
  signed_out_by_admin: "An administrator signed you out. Please sign in again.",
  inactive: "You were signed out after a long time without activity. Please sign in again.",
  expired: "Your sign-in has expired. Please sign in again.",
  password_changed: "Your password was changed. Please sign in with the new password.",
  deactivated: "Your account was deactivated.",
};

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

    // The session of this sign-in must still be open (services/sessionService.js).
    // Sign-ins from before sessions existed (no "sid" in the token) keep working until the token
    // expires (at most JWT_EXPIRES_IN, 7 days), so nobody has to sign in again after the update.
    // Deactivated accounts are still refused above.
    if (decoded.sid) {
      const check = await checkSession(decoded.sid, user.user_id);
      if (!check.ok) {
        return res.status(401).json({ success: false, code: "SESSION_ENDED", reason: check.reason, message: SESSION_ENDED_MESSAGE[check.reason] || SESSION_ENDED_MESSAGE.signed_out });
      }
      req.session_id = decoded.sid;
    }

    const authContext = await loadUserAuthContext(user.user_id);

    req.user = {
      user_id: user.user_id,
      email: user.email,
      full_name: user.full_name,
      sector_node_id: user.sector_node_id,
      permissions: authContext.permissions,
      roles: authContext.roles,
    };

    // Which sector's data this request may see (see services/sectorScope.js)
    try {
      req.scope = await resolveScope(user.sector_node_id, req.headers["x-sector-id"]);
    } catch (error) {
      return res.status(error.status || 500).json({ success: false, message: error.message });
    }

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
