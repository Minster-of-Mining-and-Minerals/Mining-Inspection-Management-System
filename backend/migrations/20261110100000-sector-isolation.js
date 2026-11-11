"use strict";

/**
 * Sector isolation.
 *
 * Sectors are flat: one root ("Central Admin") with the sectors (Ministry of Mines, GIE, MIDI …)
 * directly under it. Users in the root sector are central staff and see every sector; everyone
 * else sees only the data of their own sector.
 *
 *  - companies, company_licenses, teams, forms, inspection_schedules, inspections get a
 *    required sector_node_id. Existing rows go to Ministry of Mines. Licenses carry it too, so
 *    a license number can be unique per sector.
 *  - users.sector_node_id becomes required: users holding the old "admin" role go to the root,
 *    everyone else to Ministry of Mines. (No more "no sector = global admin".)
 *  - roles.sector_node_id: NULL = global template every sector can use; set = a sector's own
 *    copy. roles.copied_from_role_id records which role it was copied from.
 *  - The "admin" role becomes "central_admin".
 *  - Names and codes that were unique system-wide become unique per sector.
 */

const ROOT_ID = "c991de46-1e0c-4027-8152-deadc08abd2d";
const MOM_ID = "2c5ede6b-142b-4db7-847a-77d34a89c0ef";

const DATA_TABLES = ["companies", "company_licenses", "teams", "forms", "inspection_schedules", "inspections"];

// [table, old unique constraint, columns, new index name]
const PER_SECTOR_UNIQUE = [
  ["companies", "companies_name_normalized_key", "name_normalized", "companies_sector_name_unique"],
  ["companies", "companies_tin_key", "tin", "companies_sector_tin_unique"],
  ["company_licenses", "company_licenses_license_number_key", "license_number", "company_licenses_sector_number_unique"],
  ["teams", "teams_name_key", "name", "teams_sector_name_unique"],
  ["teams", "teams_code_key", "code", "teams_sector_code_unique"],
  ["forms", "forms_code_key", "code", "forms_sector_code_unique"],
];

module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    const q = (sql, replacements) => queryInterface.sequelize.query(sql, { transaction, replacements });
    try {
      // The root and Ministry of Mines must exist before rows can point at them
      // (the sector seeder fills in the rest, and Amharic names).
      await q(
        `INSERT INTO sector_nodes (sector_node_id, parent_id, name, level, is_active, created_at, updated_at)
         VALUES (:root, NULL, 'Central Admin', 1, true, NOW(), NOW()),
                (:mom, :root, 'Ministry of Mines', 1, true, NOW(), NOW())
         ON CONFLICT (sector_node_id) DO NOTHING`,
        { root: ROOT_ID, mom: MOM_ID },
      );
      // Exactly one root
      await q(`CREATE UNIQUE INDEX sector_nodes_single_root ON sector_nodes ((true)) WHERE parent_id IS NULL AND deleted_at IS NULL`);

      /* ---------- data tables ---------- */
      for (const table of DATA_TABLES) {
        await q(`ALTER TABLE ${table} ADD COLUMN sector_node_id UUID REFERENCES sector_nodes (sector_node_id) ON UPDATE CASCADE ON DELETE RESTRICT`);
      }
      await q(`UPDATE companies SET sector_node_id = :mom`, { mom: MOM_ID });
      await q(`UPDATE company_licenses l SET sector_node_id = c.sector_node_id FROM companies c WHERE c.company_id = l.company_id`);
      await q(`UPDATE teams SET sector_node_id = :mom`, { mom: MOM_ID });
      await q(`UPDATE forms SET sector_node_id = :mom`, { mom: MOM_ID });
      await q(`UPDATE inspection_schedules s SET sector_node_id = f.sector_node_id FROM forms f WHERE f.form_id = s.form_id`);
      await q(`UPDATE inspections i SET sector_node_id = c.sector_node_id FROM companies c WHERE c.company_id = i.company_id`);
      for (const table of DATA_TABLES) {
        await q(`ALTER TABLE ${table} ALTER COLUMN sector_node_id SET NOT NULL`);
        await q(`CREATE INDEX ${table}_sector_node_id ON ${table} (sector_node_id)`);
      }

      for (const [table, oldName, column, newName] of PER_SECTOR_UNIQUE) {
        await q(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${oldName}`);
        await q(`CREATE UNIQUE INDEX ${newName} ON ${table} (sector_node_id, ${column})`);
      }

      /* ---------- roles ---------- */
      await q(
        `UPDATE roles SET name = 'central_admin', description = 'Central administrator: manages every sector and has all permissions'
         WHERE name = 'admin' AND NOT EXISTS (SELECT 1 FROM roles WHERE name = 'central_admin')`,
      );
      await q(`ALTER TABLE roles ADD COLUMN sector_node_id UUID REFERENCES sector_nodes (sector_node_id) ON UPDATE CASCADE ON DELETE RESTRICT`);
      await q(`ALTER TABLE roles ADD COLUMN copied_from_role_id UUID REFERENCES roles (role_id) ON UPDATE CASCADE ON DELETE SET NULL`);
      await q(`ALTER TABLE roles DROP CONSTRAINT IF EXISTS roles_name_key`);
      await q(`CREATE UNIQUE INDEX roles_global_name_unique ON roles (name) WHERE sector_node_id IS NULL`);
      await q(`CREATE UNIQUE INDEX roles_sector_name_unique ON roles (sector_node_id, name) WHERE sector_node_id IS NOT NULL`);

      /* ---------- users ---------- */
      await q(
        `UPDATE users u SET sector_node_id = :root
         WHERE u.sector_node_id IS NULL
           AND EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.role_id = ur.role_id
                       WHERE ur.user_id = u.user_id AND r.name = 'central_admin')`,
        { root: ROOT_ID },
      );
      await q(`UPDATE users SET sector_node_id = :mom WHERE sector_node_id IS NULL`, { mom: MOM_ID });
      await q(`ALTER TABLE users ALTER COLUMN sector_node_id SET NOT NULL`);

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    try {
      await q(`ALTER TABLE users ALTER COLUMN sector_node_id DROP NOT NULL`);

      // Sector copies of roles cannot survive a single global name space
      await q(`DELETE FROM user_roles WHERE role_id IN (SELECT role_id FROM roles WHERE sector_node_id IS NOT NULL)`);
      await q(`DELETE FROM role_permissions WHERE role_id IN (SELECT role_id FROM roles WHERE sector_node_id IS NOT NULL)`);
      await q(`DELETE FROM roles WHERE sector_node_id IS NOT NULL`);
      await q(`DROP INDEX IF EXISTS roles_global_name_unique`);
      await q(`DROP INDEX IF EXISTS roles_sector_name_unique`);
      await q(`ALTER TABLE roles DROP COLUMN copied_from_role_id`);
      await q(`ALTER TABLE roles DROP COLUMN sector_node_id`);
      await q(`ALTER TABLE roles ADD CONSTRAINT roles_name_key UNIQUE (name)`);
      await q(`UPDATE roles SET name = 'admin' WHERE name = 'central_admin'`);

      // Fails if two sectors now share a name/code — resolve those rows first
      for (const [table, oldName, column, newName] of PER_SECTOR_UNIQUE) {
        await q(`DROP INDEX IF EXISTS ${newName}`);
        await q(`ALTER TABLE ${table} ADD CONSTRAINT ${oldName} UNIQUE (${column})`);
      }
      for (const table of DATA_TABLES) {
        await q(`ALTER TABLE ${table} DROP COLUMN sector_node_id`);
      }
      await q(`DROP INDEX IF EXISTS sector_nodes_single_root`);

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
