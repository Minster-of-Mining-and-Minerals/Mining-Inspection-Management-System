"use strict";

/**
 * Reference data: organization (sector) hierarchy, in English + Amharic.
 *
 * Snapshot of the configured data on 2026-10-28 (IDs kept, so anything that
 * references them stays valid). Safe to re-run:
 *   - missing rows are inserted;
 *   - existing rows keep their values — only an EMPTY Amharic name/description
 *     is filled in, so edits made in the app are never overwritten.
 */

// Parents must come before their children
const SECTORS = [
  {
    sector_node_id: "c991de46-1e0c-4027-8152-deadc08abd2d",
    parent_id: null,
    name: "Central Admin",
    name_am: "ማዕከላዊ አስተዳደር",
    level: 1,
  },
  {
    sector_node_id: "2c5ede6b-142b-4db7-847a-77d34a89c0ef",
    parent_id: "c991de46-1e0c-4027-8152-deadc08abd2d",
    name: "Ministry of Mines",
    name_am: "የማዕድን ሚኒስቴር",
    level: 1,
  },
  {
    sector_node_id: "c1934d0d-b316-406f-a599-e6282b08ad4b",
    parent_id: "c991de46-1e0c-4027-8152-deadc08abd2d",
    name: "GIE",
    // Geological Institute of Ethiopia
    name_am: "የኢትዮጵያ ጂኦሎጂ ኢንስቲትዩት (GIE)",
    level: 1,
  },
  {
    sector_node_id: "d222bb63-c832-4889-89ae-cdf8a09b5cdb",
    parent_id: "c991de46-1e0c-4027-8152-deadc08abd2d",
    name: "MIDI",
    // Mining Industry Development Institute
    name_am: "የማዕድን ኢንዱስትሪ ልማት ኢንስቲትዩት (MIDI)",
    level: 1,
  },
];

module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    const now = new Date();

    try {
      for (const s of SECTORS) {
        await queryInterface.sequelize.query(
          `INSERT INTO sector_nodes
             (sector_node_id, parent_id, name, name_am, description, description_am, level, is_active, created_at, updated_at)
           VALUES (:sector_node_id, :parent_id, :name, :name_am, :description, :description_am, :level, true, :now, :now)
           ON CONFLICT (sector_node_id) DO UPDATE SET
             name_am = COALESCE(NULLIF(sector_nodes.name_am, ''), EXCLUDED.name_am),
             description_am = COALESCE(NULLIF(sector_nodes.description_am, ''), EXCLUDED.description_am)`,
          {
            replacements: {
              description: null,
              description_am: null,
              ...s,
              now,
            },
            transaction,
          },
        );
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface) {
    // Children first.
    const transaction = await queryInterface.sequelize.transaction();
    try {
      for (const s of [...SECTORS].reverse()) {
        await queryInterface.bulkDelete("sector_nodes", { sector_node_id: s.sector_node_id }, { transaction });
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
