"use strict";
const { v4: uuidv4 } = require("uuid");
const bcrypt = require("bcrypt");

const { ROOT_SECTOR_ID } = require("../utils/sectorConstants");
const { devAccountsAllowed } = require("../utils/seedMode");

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    const now = new Date();

    try {
      // Step 1: Find or create the Central Admin role (global: sector_node_id NULL)
      console.log("Creating Central Admin role...");
      const adminRoleId = uuidv4();

      const existingRole = await queryInterface.rawSelect(
        "roles",
        {
          where: { name: "central_admin", sector_node_id: null },
          transaction,
        },
        ["role_id"],
      );

      let roleId;
      if (existingRole) {
        roleId = existingRole;
        console.log("Admin role already exists");
      } else {
        roleId = adminRoleId;
        await queryInterface.bulkInsert(
          "roles",
          [
            {
              role_id: roleId,
              name: "central_admin",
              description: "Central administrator: manages every sector and has all permissions",
              is_active: true,
              created_at: now,
              updated_at: now,
            },
          ],
          { transaction },
        );
        console.log("Admin role created");
      }

      // Step 2: Get all permissions from the database
      console.log("Fetching all permissions...");
      const permissions = await queryInterface.sequelize.query(
        "SELECT permission_id FROM permissions WHERE is_active = true",
        { type: Sequelize.QueryTypes.SELECT, transaction },
      );

      console.log(`Found ${permissions.length} permissions`);

      // Step 3: Assign all permissions to admin role
      console.log("Assigning permissions to admin role...");
      const rolePermissions = permissions.map((permission) => ({
        role_permission_id: uuidv4(),
        role_id: roleId,
        permission_id: permission.permission_id,
        is_active: true,
        created_at: now,
        updated_at: now,
      }));

      if (rolePermissions.length > 0) {
        await queryInterface.bulkInsert("role_permissions", rolePermissions, {
          transaction,
          ignoreDuplicates: true,
        });
        console.log(
          `Assigned ${rolePermissions.length} permissions to admin role`,
        );
      }

      // Step 4: Create Admin User
      console.log("Creating admin user...");

      // First, try to get the user_type_id
      let userTypeId;
      const userTypes = await queryInterface.sequelize.query(
        `SELECT user_type_id FROM user_types WHERE name = 'internal' LIMIT 1`,
        {
          type: Sequelize.QueryTypes.SELECT,
          transaction,
          plain: true, // Returns a single object instead of array
        },
      );

      if (userTypes) {
        userTypeId = userTypes.user_type_id;
        console.log(`Found user_type_id: ${userTypeId}`);
      } else {
        // If not found, try to find it without transaction (committed data)
        console.log(
          "User type not found in transaction, trying without transaction...",
        );
        const userTypesWithoutTransaction =
          await queryInterface.sequelize.query(
            `SELECT user_type_id FROM user_types WHERE name = 'internal' LIMIT 1`,
            {
              type: Sequelize.QueryTypes.SELECT,
              plain: true,
            },
          );

        if (userTypesWithoutTransaction) {
          userTypeId = userTypesWithoutTransaction.user_type_id;
          console.log(`Found user_type_id without transaction: ${userTypeId}`);
        } else {
          // Last resort: Create the user_type if it doesn't exist
          console.log("Creating internal type...");
          const newUserTypeId = uuidv4();
          await queryInterface.bulkInsert(
            "user_types",
            [
              {
                user_type_id: newUserTypeId,
                name: "internal",
                description:
                  "Internal staff or employees within the organization",
                created_at: now,
                updated_at: now,
              },
            ],
            { transaction },
          );
          userTypeId = newUserTypeId;
          console.log(`Created new user_type_id: ${userTypeId}`);
        }
      }

      const adminUserId = uuidv4();
      const hashedPassword = await bcrypt.hash("password", 10);

      const existingUser = await queryInterface.rawSelect(
        "users",
        {
          where: { email: "admin@gmail.com" },
          transaction,
        },
        ["user_id"],
      );

      let userId;
      if (existingUser && !devAccountsAllowed()) {
        // Production: the central admin exists; never reset its password or status on a restart
        userId = existingUser;
        console.log("Central admin already exists - left unchanged");
      } else if (existingUser) {
        userId = existingUser;
        await queryInterface.bulkUpdate(
          "users",
          {
            password: hashedPassword,
            sector_node_id: ROOT_SECTOR_ID,
            is_first_logged_in: true,
            is_active: true,
            updated_at: now,
          },
          { user_id: userId },
          { transaction },
        );
        console.log("Admin user already exists - password updated to 'password'");
      } else {
        userId = adminUserId;
        await queryInterface.bulkInsert(
          "users",
          [
            {
              user_id: userId,
              full_name: "Central Administrator",
              email: "admin@gmail.com",
              password: hashedPassword,
              user_type_id: userTypeId,
              sector_node_id: ROOT_SECTOR_ID,
              phone_number: "251911000001",
              profile_image: null,
              is_first_logged_in: true,
              last_login_at: null,
              password_changed_at: null,
              is_active: true,
              created_at: now,
              updated_at: now,
            },
          ],
          { transaction },
        );
        console.log("Admin user created");
      }

      // Step 5: Assign Admin Role to Admin User
      console.log("Assigning admin role to user...");

      // Check if user already has the role
      const existingUserRole = await queryInterface.rawSelect(
        "user_roles",
        {
          where: {
            user_id: userId,
            role_id: roleId,
          },
          transaction,
        },
        ["user_role_id"],
      );

      if (!existingUserRole) {
        // For self-assigned admin role, use the admin user's ID as assigned_by
        await queryInterface.bulkInsert(
          "user_roles",
          [
            {
              user_role_id: uuidv4(),
              user_id: userId,
              role_id: roleId,
              assigned_by: userId, // Admin user assigns to themselves
              assigned_at: now, // Explicitly set assigned_at
              is_active: true,
              created_at: now,
              updated_at: now,
            },
          ],
          { transaction },
        );
        console.log("Admin role assigned to user");
      } else {
        console.log("User already has admin role");
      }

      await transaction.commit();
      console.log("Admin setup completed successfully!");
    } catch (error) {
      await transaction.rollback();
      console.error("Error in admin seed:", error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // Find admin user
      const adminUser = await queryInterface.sequelize.query(
        "SELECT user_id FROM users WHERE email = 'admin@gmail.com'",
        { type: Sequelize.QueryTypes.SELECT, transaction },
      );

      if (adminUser && adminUser.length > 0) {
        const userId = adminUser[0].user_id;

        // Remove user roles
        await queryInterface.bulkDelete(
          "user_roles",
          { user_id: userId },
          { transaction },
        );

        // Remove admin user
        await queryInterface.bulkDelete(
          "users",
          { user_id: userId },
          { transaction },
        );
      }

      // Find admin role
      const adminRole = await queryInterface.sequelize.query(
        "SELECT role_id FROM roles WHERE name = 'admin'",
        { type: Sequelize.QueryTypes.SELECT, transaction },
      );

      if (adminRole && adminRole.length > 0) {
        const roleId = adminRole[0].role_id;

        // Remove role permissions
        await queryInterface.bulkDelete(
          "role_permissions",
          { role_id: roleId },
          { transaction },
        );

        // Remove admin role
        await queryInterface.bulkDelete(
          "roles",
          { role_id: roleId },
          { transaction },
        );
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
