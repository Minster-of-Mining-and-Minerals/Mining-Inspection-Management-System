"use strict";
/**
 * One administrator per sector, like the central admin (seeders/20251108201545-demo-users.js):
 *
 *   mom-admin@gmail.com    Ministry of Mines
 *   gie-admin@gmail.com    GIE
 *   midi-admin@gmail.com   MIDI
 *
 * Each gets the global "sector_admin" role (everything inside its sector, nothing ministry-wide),
 * the internal user type, and becomes its sector's head if the sector has none yet.
 *
 * Password: "password", to be changed at the first login (is_first_logged_in).
 *   - On a server (NODE_ENV=production) an account is only created when missing; an existing one
 *     is never changed again (password, sector, active state stay as people set them).
 *   - In development (or with SEED_DEV_PASSWORDS=true) the password is reset to "password" and the
 *     sector and role are put back on every run, like the other demo accounts.
 *
 * Runs after the sectors and roles seeders, and before the GIE / MIDI sample data, which uses
 * these accounts as its sector admins.
 */
const { v4: uuidv4 } = require("uuid");
const bcrypt = require("bcrypt");
const { MOM_SECTOR_ID, GIE_SECTOR_ID, MIDI_SECTOR_ID } = require("../utils/sectorConstants");
const { devAccountsAllowed } = require("../utils/seedMode");

const ADMINS = [
  { email: "mom-admin@gmail.com", full_name: "Ministry of Mines Administrator", sector: MOM_SECTOR_ID, phone: "251911000011" },
  { email: "gie-admin@gmail.com", full_name: "GIE Administrator", sector: GIE_SECTOR_ID, phone: "251911000012" },
  { email: "midi-admin@gmail.com", full_name: "MIDI Administrator", sector: MIDI_SECTOR_ID, phone: "251911000013" },
];

module.exports = {
  async up(queryInterface, Sequelize) {
    const { QueryTypes } = Sequelize;
    const transaction = await queryInterface.sequelize.transaction();
    const q = (sql, replacements) => queryInterface.sequelize.query(sql, { replacements, type: QueryTypes.SELECT, transaction });
    const now = new Date();
    try {
      const [role] = await q(`SELECT role_id FROM roles WHERE name = 'sector_admin' AND sector_node_id IS NULL`);
      if (!role) throw new Error('The "sector_admin" role is missing: run the roles seeder first.');
      const [type] = await q(`SELECT user_type_id FROM user_types WHERE name = 'internal'`);
      if (!type) throw new Error('The "internal" user type is missing: run the user types seeder first.');
      const password = await bcrypt.hash("password", 10);
      const dev = devAccountsAllowed();

      for (const a of ADMINS) {
        const [sector] = await q(`SELECT sector_node_id, name, head_id FROM sector_nodes WHERE sector_node_id = :id AND deleted_at IS NULL`, { id: a.sector });
        if (!sector) {
          console.log(`Sector for ${a.email} not found; skipped.`);
          continue;
        }

        const [existing] = await q(`SELECT user_id, sector_node_id FROM users WHERE email = :email`, { email: a.email });
        let userId = existing?.user_id;
        if (!existing) {
          userId = uuidv4();
          await queryInterface.bulkInsert(
            "users",
            [
              {
                user_id: userId,
                full_name: a.full_name,
                email: a.email,
                password,
                phone_number: a.phone,
                user_type_id: type.user_type_id,
                sector_node_id: a.sector,
                is_first_logged_in: true,
                is_active: true,
                created_at: now,
                updated_at: now,
              },
            ],
            { transaction },
          );
          console.log(`${sector.name}: ${a.email} created (password "password", to change at first login)`);
        } else if (dev) {
          await queryInterface.bulkUpdate(
            "users",
            { password, sector_node_id: a.sector, is_first_logged_in: true, is_active: true, updated_at: now },
            { user_id: userId },
            { transaction },
          );
          console.log(`${sector.name}: ${a.email} already exists — password reset to "password" (development)`);
        } else {
          console.log(`${sector.name}: ${a.email} already exists — left unchanged`);
          // On a server, don't hand a role to an account that has since been moved to another sector
          if (existing.sector_node_id !== a.sector) continue;
        }

        // The sector_admin role (re-activated if it was switched off)
        const [link] = await q(`SELECT user_role_id, is_active FROM user_roles WHERE user_id = :user AND role_id = :role`, { user: userId, role: role.role_id });
        if (!link) {
          await queryInterface.bulkInsert(
            "user_roles",
            [{ user_role_id: uuidv4(), user_id: userId, role_id: role.role_id, assigned_by: null, assigned_at: now, is_active: true, created_at: now, updated_at: now }],
            { transaction },
          );
        } else if (!link.is_active && dev) {
          await queryInterface.bulkUpdate("user_roles", { is_active: true, updated_at: now }, { user_role_id: link.user_role_id }, { transaction });
        }

        // Head of the sector, unless someone already is
        if (!sector.head_id) {
          await queryInterface.bulkUpdate("sector_nodes", { head_id: userId, updated_at: now }, { sector_node_id: a.sector }, { transaction });
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
      const emails = ADMINS.map((a) => a.email);
      const users = await queryInterface.sequelize.query(`SELECT user_id FROM users WHERE email IN (:emails)`, {
        replacements: { emails },
        type: Sequelize.QueryTypes.SELECT,
        transaction,
      });
      const ids = users.map((u) => u.user_id);
      if (ids.length) {
        await queryInterface.bulkUpdate("sector_nodes", { head_id: null }, { head_id: ids }, { transaction });
        await queryInterface.bulkDelete("user_roles", { user_id: ids }, { transaction });
        await queryInterface.bulkDelete("notifications", { recipient_id: ids }, { transaction });
        await queryInterface.bulkDelete("users", { user_id: ids }, { transaction });
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
