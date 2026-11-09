"use strict";
const { v4: uuidv4 } = require("uuid");

/**
 * Default roles for the Mining Inspection Management System.
 * The "admin" role (all permissions) is created by the demo-users seeder.
 * Safe to re-run: existing roles are kept, missing permission links are added, and links listed
 * under "revoke" (permissions a role used to have) are removed.
 */
const ROLES = {
  supervisor: {
    description: "Plans inspection rounds, assigns teams and reviews submitted inspections",
    permissions: [
      "dashboard:view",
      "users:read",
      "sector:read",
      "admin_areas:read",
      "minerals:read",
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
  // Field teams see only their own team, companies, tasks and progress (My team / My companies /
  // My tasks / My progress), never the full registry, the form builder or the dashboard.
  team_leader: {
    description: "Leads an inspection team; conducts and submits inspections for the team",
    permissions: [
      "inspections:read_own", "inspections:conduct",
      "findings:read",
    ],
    revoke: ["dashboard:view", "companies:read", "teams:read", "forms:read", "rounds:read", "findings:update"],
  },
  inspector: {
    description: "Field inspector; fills inspection checklists for assigned companies",
    permissions: [
      "inspections:read_own", "inspections:conduct",
      "findings:read",
    ],
    revoke: ["companies:read", "forms:read"],
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

      for (const [name, { description, permissions, revoke = [] }] of Object.entries(ROLES)) {
        let roleId = await queryInterface.rawSelect("roles", { where: { name }, transaction }, ["role_id"]);
        if (!roleId) {
          roleId = uuidv4();
          await queryInterface.bulkInsert(
            "roles",
            [{ role_id: roleId, name, description, is_active: true, created_at: now, updated_at: now }],
            { transaction },
          );
        }

        const revokeIds = revoke.map((k) => permId.get(k)).filter(Boolean);
        if (revokeIds.length) await queryInterface.bulkDelete("role_permissions", { role_id: roleId, permission_id: revokeIds }, { transaction });

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

      // Seed standard demo users for the inspection roles
      const bcrypt = require("bcrypt");
      const hashedPassword = await bcrypt.hash("password", 10);
      const userType = await queryInterface.rawSelect("user_types", { where: { name: "internal" }, transaction }, ["user_type_id"]);

      const DEMO_USERS = [
        { email: "supervisor@gmail.com", full_name: "Field Inspection Supervisor", role: "supervisor", phone: "251911000002" },
        { email: "teamleader@gmail.com", full_name: "Inspection Team Leader", role: "team_leader", phone: "251911000003" },
        { email: "inspector@gmail.com", full_name: "Field Inspector", role: "inspector", phone: "251911000004" },
        { email: "viewer@gmail.com", full_name: "Compliance Viewer", role: "viewer", phone: "251911000005" },
      ];

      for (const du of DEMO_USERS) {
        let userId = await queryInterface.rawSelect("users", { where: { email: du.email }, transaction }, ["user_id"]);
        if (!userId) {
          userId = uuidv4();
          await queryInterface.bulkInsert(
            "users",
            [{
              user_id: userId,
              full_name: du.full_name,
              email: du.email,
              password: hashedPassword,
              user_type_id: userType,
              phone_number: du.phone,
              is_first_logged_in: false,
              is_active: true,
              created_at: now,
              updated_at: now,
            }],
            { transaction }
          );
        } else {
          await queryInterface.bulkUpdate(
            "users",
            { password: hashedPassword, is_active: true, updated_at: now },
            { user_id: userId },
            { transaction }
          );
        }

        const roleId = await queryInterface.rawSelect("roles", { where: { name: du.role }, transaction }, ["role_id"]);
        if (roleId) {
          const hasRole = await queryInterface.rawSelect(
            "user_roles",
            { where: { user_id: userId, role_id: roleId }, transaction },
            ["user_role_id"]
          );
          if (!hasRole) {
            await queryInterface.bulkInsert(
              "user_roles",
              [{
                user_role_id: uuidv4(),
                user_id: userId,
                role_id: roleId,
                assigned_by: userId,
                assigned_at: now,
                is_active: true,
                created_at: now,
                updated_at: now,
              }],
              { transaction }
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
