const { User, Role, RolePermission, Permission } = require("../models");

/**
 * Load permission keys (resource:action) and role names for a user.
 * Only active role assignments, active roles, active role-permission links
 * and active permissions count.
 */
const loadUserAuthContext = async (userId) => {
  const user = await User.findByPk(userId, {
    attributes: { exclude: ["password"] },
    include: [
      {
        model: Role,
        as: "roles",
        where: { is_active: true },
        required: false,
        through: { attributes: [], where: { is_active: true } },
        include: [
          {
            model: RolePermission,
            as: "rolePermissions",
            where: { is_active: true },
            required: false,
            include: [
              {
                model: Permission,
                as: "permission",
                where: { is_active: true },
                required: false,
                attributes: ["resource", "action"],
              },
            ],
          },
        ],
      },
    ],
  });

  if (!user) {
    return { permissions: [], roles: [] };
  }

  const permissions = new Set();
  const roles = new Set();

  for (const role of user.roles || []) {
    roles.add(role.name);
    for (const rp of role.rolePermissions || []) {
      if (rp.permission?.resource && rp.permission?.action) {
        permissions.add(`${rp.permission.resource}:${rp.permission.action}`);
      }
    }
  }

  return {
    permissions: [...permissions],
    roles: [...roles],
  };
};

const hasPermission = (permissions, resource, action) =>
  permissions.includes(`${resource}:${action}`);

const hasAnyPermission = (permissions, pairs) =>
  pairs.some(([resource, action]) => hasPermission(permissions, resource, action));

module.exports = {
  loadUserAuthContext,
  hasPermission,
  hasAnyPermission,
};
