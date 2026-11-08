"use strict";

/**
 * Seeders are re-run by `npm run seed`, and nothing stopped them from inserting
 * the same permission or role-permission link again. This removes any duplicates
 * already in the database and adds unique rules so it cannot happen again:
 *   permissions       (resource, action)
 *   role_permissions  (role_id, permission_id)
 *   user_roles        (user_id, role_id)
 */
module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    try {
      // 1. Point every role-permission link at one surviving permission per (resource, action)
      await q(`
        WITH keep AS (
          SELECT DISTINCT ON (resource, action) permission_id AS keep_id, resource, action
          FROM permissions
          ORDER BY resource, action, created_at, permission_id
        )
        UPDATE role_permissions rp
        SET permission_id = keep.keep_id
        FROM permissions p
        JOIN keep ON keep.resource = p.resource AND keep.action = p.action
        WHERE rp.permission_id = p.permission_id AND p.permission_id <> keep.keep_id`);

      // 2. Remove the duplicate permissions themselves
      await q(`
        DELETE FROM permissions p
        USING permissions k
        WHERE p.resource = k.resource AND p.action = k.action
          AND (k.created_at, k.permission_id) < (p.created_at, p.permission_id)`);

      // 3. One link per (role, permission); keep an active one if there is one
      await q(`
        DELETE FROM role_permissions rp
        WHERE rp.role_permission_id NOT IN (
          SELECT DISTINCT ON (role_id, permission_id) role_permission_id
          FROM role_permissions
          ORDER BY role_id, permission_id, is_active DESC, created_at, role_permission_id
        )`);

      // 4. One assignment per (user, role); keep an active one if there is one
      await q(`
        DELETE FROM user_roles ur
        WHERE ur.user_role_id NOT IN (
          SELECT DISTINCT ON (user_id, role_id) user_role_id
          FROM user_roles
          ORDER BY user_id, role_id, is_active DESC, created_at, user_role_id
        )`);

      await queryInterface.addIndex("permissions", ["resource", "action"], {
        unique: true,
        name: "permissions_resource_action_unique",
        transaction,
      });
      await queryInterface.addIndex("role_permissions", ["role_id", "permission_id"], {
        unique: true,
        name: "role_permissions_role_permission_unique",
        transaction,
      });
      await queryInterface.addIndex("user_roles", ["user_id", "role_id"], {
        unique: true,
        name: "user_roles_user_role_unique",
        transaction,
      });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("user_roles", "user_roles_user_role_unique");
    await queryInterface.removeIndex("role_permissions", "role_permissions_role_permission_unique");
    await queryInterface.removeIndex("permissions", "permissions_resource_action_unique");
  },
};
