"use strict";
const { v4: uuidv4 } = require("uuid");

module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();

    const permissions = [
      // Dashboard Access
      { resource: "dashboard", action: "view" },

      // User Management
      { resource: "users", action: "create" },
      { resource: "users", action: "read" },
      { resource: "users", action: "update" },
      { resource: "users", action: "delete" },
      { resource: "users", action: "assign_role" },

      // Permission Management
      { resource: "permissions", action: "read" },
      { resource: "permissions", action: "update" },

      // Role Management
      { resource: "roles", action: "create" },
      { resource: "roles", action: "read" },
      { resource: "roles", action: "update" },
      { resource: "roles", action: "delete" },
      { resource: "roles", action: "assign_permission" },

      // Organization Management
      { resource: "sector", action: "create" },
      { resource: "sector", action: "read" },
      { resource: "sector", action: "update" },
      { resource: "sector", action: "delete" },

      { resource: "sector_head", action: "relegate" },
      { resource: "sector_head", action: "delegate" },
      { resource: "sector_head", action: "update" },

      // Administrative areas (Region / Zone / Woreda)
      { resource: "admin_areas", action: "create" },
      { resource: "admin_areas", action: "read" },
      { resource: "admin_areas", action: "update" },
      { resource: "admin_areas", action: "delete" },

      // Companies & licenses
      { resource: "companies", action: "create" },
      { resource: "companies", action: "read" },
      { resource: "companies", action: "update" },
      { resource: "companies", action: "delete" },
      { resource: "companies", action: "import" },

      // Standard minerals list
      { resource: "minerals", action: "create" },
      { resource: "minerals", action: "read" },
      { resource: "minerals", action: "update" },

      // Inspection teams
      { resource: "teams", action: "create" },
      { resource: "teams", action: "read" },
      { resource: "teams", action: "update" },
      { resource: "teams", action: "delete" },
      { resource: "teams", action: "manage_members" },

      // Forms (checklists)
      { resource: "forms", action: "create" },
      { resource: "forms", action: "read" },
      { resource: "forms", action: "update" },
      { resource: "forms", action: "delete" },
      { resource: "forms", action: "publish" },
      { resource: "forms", action: "assign" },

      // Inspection rounds & planning
      { resource: "rounds", action: "create" },
      { resource: "rounds", action: "read" },
      { resource: "rounds", action: "update" },
      { resource: "rounds", action: "delete" },

      // Inspections
      { resource: "inspections", action: "assign" },
      { resource: "inspections", action: "read_own" },
      { resource: "inspections", action: "read_all" },
      { resource: "inspections", action: "conduct" },
      { resource: "inspections", action: "review" },
      { resource: "inspections", action: "delete" },

      // Findings / corrective actions
      { resource: "findings", action: "read" },
      { resource: "findings", action: "update" },
      { resource: "findings", action: "close" },

      // Location & device integrity
      { resource: "integrity", action: "read" },
      { resource: "devices", action: "manage" },

      // Data Export
      { resource: "data", action: "export" },

    ];

    for (const perm of permissions) {
      try {
        await queryInterface.bulkInsert(
          "permissions",
          [
            {
              permission_id: uuidv4(),
              resource: perm.resource,
              action: perm.action,
              created_at: now,
              updated_at: now,
            },
          ],
          { ignoreDuplicates: true },
        );
      } catch (error) {
        if (error.name === "SequelizeUniqueConstraintError") {
          // console.log(
          //   `Permission ${perm.resource}:${perm.action} already exists, skipping...`,
          // );
          continue;
        }
        throw error;
      }
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete("permissions", null, {});
  },
};
