"use strict";
const { v4: uuidv4 } = require("uuid");

/**
 * Default roles for the Mining Inspection Management System.
 * The "admin" role (all permissions) is created by the demo-users seeder.
 * Safe to re-run: existing roles are kept, missing permission links are added.
 */
const ROLES = {
  supervisor: {
    description: "Plans inspection rounds, assigns teams and reviews submitted inspections",
    permissions: [
      "dashboard:view",
      "users:read",
      "sector:read",
      "admin_areas:read",
      "companies:read", "companies:update",
      "teams:create", "teams:read", "teams:update", "teams:manage_members",
      "forms:read", "forms:assign",
      "rounds:create", "rounds:read", "rounds:update",
      "inspections:assign", "inspections:read_all", "inspections:review",
      "findings:read", "findings:update", "findings:close",
      "integrity:read",
      "data:export",
    ],
  },
  team_leader: {
    description: "Leads an inspection team; conducts and submits inspections for the team",
    permissions: [
      "dashboard:view",
      "companies:read",
      "teams:read",
      "forms:read",
      "rounds:read",
      "inspections:read_own", "inspections:conduct",
      "findings:read", "findings:update",
    ],
  },
  inspector: {
    description: "Field inspector; fills inspection checklists for assigned companies",
    permissions: [
      "companies:read",
      "forms:read",
      "inspections:read_own", "inspections:conduct",
      "findings:read",
    ],
  },
  viewer: {
    description: "Read-only access to dashboards and inspection results",
    permissions: [
      "dashboard:view",
      "companies:read",
      "teams:read",
      "rounds:read",
      "inspections:read_all",
      "findings:read",
    ],
  },
};

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    const now = new Date();
    try {
      const perms = await queryInterface.sequelize.query(
        "SELECT permission_id, resource, action FROM permissions",
        { type: Sequelize.QueryTypes.SELECT, transaction },
      );
      const permId = new Map(perms.map((p) => [`${p.resource}:${p.action}`, p.permission_id]));

      for (const [name, { description, permissions }] of Object.entries(ROLES)) {
        let roleId = await queryInterface.rawSelect("roles", { where: { name }, transaction }, ["role_id"]);
        if (!roleId) {
          roleId = uuidv4();
          await queryInterface.bulkInsert(
            "roles",
            [{ role_id: roleId, name, description, is_active: true, created_at: now, updated_at: now }],
            { transaction },
          );
        }

        for (const key of permissions) {
          const permission_id = permId.get(key);
          if (!permission_id) throw new Error(`Unknown permission ${key} for role ${name}`);
          const exists = await queryInterface.rawSelect(
            "role_permissions",
            { where: { role_id: roleId, permission_id }, transaction },
            ["role_permission_id"],
          );
          if (!exists) {
            await queryInterface.bulkInsert(
              "role_permissions",
              [{ role_permission_id: uuidv4(), role_id: roleId, permission_id, is_active: true, created_at: now, updated_at: now }],
              { transaction },
            );
          }
        }
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      const roles = await queryInterface.sequelize.query(
        "SELECT role_id FROM roles WHERE name IN (:names)",
        { replacements: { names: Object.keys(ROLES) }, type: Sequelize.QueryTypes.SELECT, transaction },
      );
      const ids = roles.map((r) => r.role_id);
      if (ids.length) {
        await queryInterface.bulkDelete("role_permissions", { role_id: ids }, { transaction });
        await queryInterface.bulkDelete("user_roles", { role_id: ids }, { transaction });
        await queryInterface.bulkDelete("roles", { role_id: ids }, { transaction });
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
