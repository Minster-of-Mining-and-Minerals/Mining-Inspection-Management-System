"use strict";

/**
 * License areas and travel information.
 *
 *   boundary         the surveyed license area as GeoJSON MultiPolygon, [lng, lat] in WGS 84
 *                    (the GPS system), converted from the Ministry's coordinate list (Adindan)
 *   center_lat/lng   a point inside / at the middle of the area, for the map and directions
 *   location_source  where the license's woreda/zone/region links come from:
 *                    'coordinates' (from the boundary) or 'list' (names typed in the license list)
 *   travel_mode      how the team gets there: 'car' or 'plane' (license list "Traveling By")
 *   airport          the airport used when flying (license list "Airport")
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.addColumn("company_licenses", "boundary", { type: Sequelize.JSONB, allowNull: true }, { transaction });
      await queryInterface.addColumn("company_licenses", "center_lat", { type: Sequelize.DOUBLE, allowNull: true }, { transaction });
      await queryInterface.addColumn("company_licenses", "center_lng", { type: Sequelize.DOUBLE, allowNull: true }, { transaction });
      await queryInterface.addColumn("company_licenses", "location_source", { type: Sequelize.STRING(20), allowNull: true }, { transaction });
      await queryInterface.addColumn("company_licenses", "travel_mode", { type: Sequelize.STRING(10), allowNull: true }, { transaction });
      await queryInterface.addColumn("company_licenses", "airport", { type: Sequelize.STRING(60), allowNull: true }, { transaction });
      await queryInterface.sequelize.query(
        `ALTER TABLE company_licenses
           ADD CONSTRAINT company_licenses_location_source_check CHECK (location_source IN ('coordinates', 'list')),
           ADD CONSTRAINT company_licenses_travel_mode_check CHECK (travel_mode IN ('car', 'plane'))`,
        { transaction },
      );
      // Licenses linked to places so far came from the list's names
      await queryInterface.sequelize.query(
        `UPDATE company_licenses l SET location_source = 'list' WHERE EXISTS (SELECT 1 FROM license_areas la WHERE la.license_id = l.license_id)`,
        { transaction },
      );
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `ALTER TABLE company_licenses DROP CONSTRAINT IF EXISTS company_licenses_location_source_check, DROP CONSTRAINT IF EXISTS company_licenses_travel_mode_check`,
        { transaction },
      );
      for (const column of ["airport", "travel_mode", "location_source", "center_lng", "center_lat", "boundary"]) {
        await queryInterface.removeColumn("company_licenses", column, { transaction });
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
