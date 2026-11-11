"use strict";
/**
 * Who may manage which users and hand out which roles (no privilege escalation).
 *
 *   - Sector users manage users of their own sector only (see services/sectorScope.js).
 *   - A role can be given to a user only if it is global or belongs to the user's sector.
 *   - A sector user can only give roles whose permissions they hold themselves, so they can never
 *     hand out central permissions (sector:create, …) or the central_admin role.
 *   - A sector user cannot manage a user who holds permissions they don't have
 *     (e.g. a colleague the central admin gave sector:create).
 * Central users (root sector) may do all of it.
 */
const { Role, RolePermission, Permission } = require("../models");
const { loadUserAuthContext } = require("./permissionService");
const { sectorForCreate, httpError } = require("./sectorScope");
const { ROOT_SECTOR_ID } = require("../utils/sectorConstants");

/** Active permission keys ("resource:action") of the given roles, keyed by role id. */
const permissionsOfRoles = async (roleIds, transaction) => {
  const links = await RolePermission.findAll({
    where: { role_id: roleIds, is_active: true },
    include: [{ model: Permission, as: "permission", where: { is_active: true }, attributes: ["resource", "action"] }],
    attributes: ["role_id"],
    transaction,
  });
  const byRole = new Map(roleIds.map((id) => [id, new Set()]));
  for (const l of links) byRole.get(l.role_id)?.add(`${l.permission.resource}:${l.permission.action}`);
  return byRole;
};

/** Permissions in `wanted` that the signed-in user does not hold. */
const missingPermissions = (req, wanted) => {
  const mine = new Set(req.user.permissions || []);
  return [...wanted].filter((p) => !mine.has(p)).sort();
};

/**
 * Check that the roles may be given to a user of `targetSectorId` by this request.
 * @returns {Promise<Role[]>}
 * @throws {status, message}
 */
const assertAssignableRoles = async (req, roleIds, targetSectorId, transaction) => {
  const ids = [...new Set(roleIds || [])];
  if (!ids.length) return [];
  const roles = await Role.findAll({ where: { role_id: ids }, transaction });
  if (roles.length !== ids.length) throw httpError(400, "One or more provided role IDs are invalid.");

  const foreign = roles.find((r) => r.sector_node_id && r.sector_node_id !== targetSectorId);
  if (foreign) throw httpError(400, `The role "${foreign.name}" belongs to another sector.`);

  if (!req.scope.isCentral) {
    const byRole = await permissionsOfRoles(ids, transaction);
    const wanted = new Set([...byRole.values()].flatMap((s) => [...s]));
    const missing = missingPermissions(req, wanted);
    if (missing.length) {
      throw httpError(403, `You can only give roles with permissions you have yourself. Missing: ${missing.join(", ")}.`);
    }
  }
  return roles;
};

/** Throw 403 if a sector user tries to manage someone with more permissions than they have. */
const assertCanManageUser = async (req, targetUserId) => {
  if (req.scope.isCentral || targetUserId === req.user.user_id) return;
  const { permissions } = await loadUserAuthContext(targetUserId);
  if (missingPermissions(req, permissions).length) {
    throw httpError(403, "This user has permissions you don't have. Ask the central administrator to change this account.");
  }
};

/**
 * The sector a new (or moved) user goes into.
 * Sector users: their own sector. Central users: the sector they choose, which may be the
 * root sector itself (another central user).
 */
const userSectorFor = async (req, requested, transaction) => {
  if (!req.scope.isCentral) return req.scope.userSectorId;
  if (requested === ROOT_SECTOR_ID) return ROOT_SECTOR_ID;
  return sectorForCreate(req, requested || undefined, transaction);
};

module.exports = { assertAssignableRoles, assertCanManageUser, userSectorFor, permissionsOfRoles, missingPermissions };
