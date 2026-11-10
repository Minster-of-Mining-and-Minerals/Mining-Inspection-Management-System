"use strict";

const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const db = require("../models");
const { loadUserAuthContext } = require("../services/permissionService");

/**
 * Timing-safe string comparison to prevent timing attacks on API keys.
 */
const safeCompare = (a, b) => {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Prevent timing difference in length comparison
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
};

/**
 * Authentication and authorization middleware specifically for external integration clients.
 * Supports:
 *   1. Pre-shared integration secret: X-API-Key header OR Authorization: ApiKey <key> OR Authorization: Bearer <key>
 *   2. JWT Bearer Token: Authorization: Bearer <jwt> where user/service account has 'inspection_analytics:read' permission
 */
const authenticateIntegrationClient = async (req, res, next) => {
  const configuredKey = process.env.PMS_INTEGRATION_KEY || process.env.INTEGRATION_API_KEY;
  const apiKeyHeader = req.headers["x-api-key"] || req.headers["x-integration-key"];

  const authHeader = req.headers["authorization"];
  let bearerToken = null;
  let customAuthKey = null;

  if (authHeader) {
    const parts = authHeader.split(" ");
    if (parts[0].toLowerCase() === "bearer" && parts[1]) {
      bearerToken = parts[1].trim();
    } else if (parts[0].toLowerCase() === "apikey" && parts[1]) {
      customAuthKey = parts[1].trim();
    }
  }

  const incomingKey = apiKeyHeader || customAuthKey;

  // 1. Validate Pre-Shared Integration Key if provided
  if (incomingKey) {
    if (!configuredKey) {
      console.warn("[IntegrationAuth] Inbound API key provided but PMS_INTEGRATION_KEY not configured on server.");
      return res.status(401).json({
        success: false,
        message: "Integration authentication is not configured on this server.",
      });
    }

    if (safeCompare(incomingKey, configuredKey)) {
      req.integrationClient = {
        type: "api_key",
        client_id: "plan-management-system",
        client_name: "Plan Management System",
        permissions: ["inspection_analytics:read"],
        scoped_region_id: null,
      };
      return next();
    }

    return res.status(401).json({
      success: false,
      message: "Invalid integration API key.",
    });
  }

  // 2. Validate Bearer Token (can be either API Key or JWT)
  if (bearerToken) {
    // Check if bearer token matches pre-shared key
    if (configuredKey && safeCompare(bearerToken, configuredKey)) {
      req.integrationClient = {
        type: "api_key",
        client_id: "plan-management-system",
        client_name: "Plan Management System",
        permissions: ["inspection_analytics:read"],
        scoped_region_id: null,
      };
      return next();
    }

    // Otherwise, attempt JWT verification
    try {
      const decoded = jwt.verify(bearerToken, process.env.JWT_SECRET);
      const userId = decoded.user_id || decoded.id;

      // Allow service tokens that include explicit permissions in payload
      if (Array.isArray(decoded.permissions)) {
        if (decoded.permissions.includes("inspection_analytics:read")) {
          req.integrationClient = {
            type: "jwt_service",
            client_id: userId || decoded.sub || "service_account",
            client_name: decoded.name || decoded.email || "Service Account",
            permissions: decoded.permissions,
            scoped_sector_id: decoded.sector_node_id || null,
            scoped_region_id: decoded.region_id || null,
          };
          return next();
        } else {
          return res.status(403).json({
            success: false,
            message: "Access denied: Missing required permission 'inspection_analytics:read'.",
          });
        }
      }

      // If user ID is present and db is available, look up user and permissions from database
      if (userId && db.User) {
        const user = await db.User.findByPk(userId, {
          attributes: ["user_id", "email", "full_name", "is_active", "sector_node_id"],
        });

        if (!user || !user.is_active) {
          return res.status(403).json({
            success: false,
            message: "User or service account not found or inactive.",
          });
        }

        const authContext = await loadUserAuthContext(user.user_id);
        const hasAnalyticsPermission =
          authContext.permissions.includes("inspection_analytics:read") ||
          authContext.roles.includes("admin") ||
          authContext.roles.includes("integration_client");

        if (!hasAnalyticsPermission) {
          return res.status(403).json({
            success: false,
            message: "Access denied: Missing required permission 'inspection_analytics:read'.",
          });
        }

        req.integrationClient = {
          type: "jwt",
          client_id: user.user_id,
          client_name: user.full_name || user.email,
          permissions: authContext.permissions,
          scoped_sector_id: user.sector_node_id || null,
          scoped_region_id: null,
        };

        return next();
      }

      return res.status(403).json({
        success: false,
        message: "Access denied: Missing required permission 'inspection_analytics:read'.",
      });
    } catch (jwtErr) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired integration token.",
      });
    }
  }

  // 3. No credentials provided
  return res.status(401).json({
    success: false,
    message: "Authentication required: Provide a valid X-API-Key or Bearer token.",
  });
};

const validateIntegrationKey = (key) => {
  const configuredKey = process.env.PMS_INTEGRATION_KEY || process.env.INTEGRATION_API_KEY;
  if (!configuredKey || typeof key !== "string" || !key) return false;
  return safeCompare(key, configuredKey);
};

module.exports = {
  authenticateIntegrationClient,
  safeCompare,
  validateIntegrationKey,
};

