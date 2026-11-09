"use strict";
const { v4: uuidv4 } = require("uuid");

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    const now = new Date();

    try {
      // 1. Insert permission: inspection_analytics:read if it does not exist
      let permission = await queryInterface.rawSelect(
        "permissions",
        {
          where: { resource: "inspection_analytics", action: "read" },
          transaction,
        },
        ["permission_id"],
      );

      if (!permission) {
        const permId = uuidv4();
        await queryInterface.bulkInsert(
          "permissions",
          [
            {
              permission_id: permId,
              resource: "inspection_analytics",
              action: "read",
              created_at: now,
              updated_at: now,
            },
          ],
          { transaction },
        );
        permission = permId;
      }

      // 2. Assign to admin role
      const adminRole = await queryInterface.rawSelect(
        "roles",
        {
          where: { name: "admin" },
          transaction,
        },
        ["role_id"],
      );

      if (adminRole && permission) {
        const hasAdminLink = await queryInterface.rawSelect(
          "role_permissions",
          {
            where: { role_id: adminRole, permission_id: permission },
            transaction,
          },
          ["role_permission_id"],
        );

        if (!hasAdminLink) {
          await queryInterface.bulkInsert(
            "role_permissions",
            [
              {
                role_permission_id: uuidv4(),
                role_id: adminRole,
                permission_id: permission,
                is_active: true,
                created_at: now,
                updated_at: now,
              },
            ],
            { transaction },
          );
        }
      }

      // 3. Create or find integration_client role
      let integrationRole = await queryInterface.rawSelect(
        "roles",
        {
          where: { name: "integration_client" },
          transaction,
        },
        ["role_id"],
      );

      if (!integrationRole) {
        const roleId = uuidv4();
        await queryInterface.bulkInsert(
          "roles",
          [
            {
              role_id: roleId,
              name: "integration_client",
              description: "External system integration client with read-only analytics access",
              is_active: true,
              created_at: now,
              updated_at: now,
            },
          ],
          { transaction },
        );
        integrationRole = roleId;
      }

      if (integrationRole && permission) {
        const hasLink = await queryInterface.rawSelect(
          "role_permissions",
          {
            where: { role_id: integrationRole, permission_id: permission },
            transaction,
          },
          ["role_permission_id"],
        );

        if (!hasLink) {
          await queryInterface.bulkInsert(
            "role_permissions",
            [
              {
                role_permission_id: uuidv4(),
                role_id: integrationRole,
                permission_id: permission,
                is_active: true,
                created_at: now,
                updated_at: now,
              },
            ],
            { transaction },
          );
        }
      }

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      const permission = await queryInterface.rawSelect(
        "permissions",
        {
          where: { resource: "inspection_analytics", action: "read" },
          transaction,
        },
        ["permission_id"],
      );

      if (permission) {
        await queryInterface.bulkDelete("role_permissions", { permission_id: permission }, { transaction });
        await queryInterface.bulkDelete("permissions", { permission_id: permission }, { transaction });
      }

      await queryInterface.bulkDelete("roles", { name: "integration_client" }, { transaction });

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },
};

