"use strict";

/**
 * Region → Zone → Woreda reference list (official COD-AB P-codes + boundaries)
 * and the alternative spellings that map onto it.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.createTable(
        "admin_areas",
        {
          area_id: {
            type: Sequelize.UUID,
            allowNull: false,
            primaryKey: true,
            defaultValue: Sequelize.UUIDV4,
          },
          parent_id: {
            type: Sequelize.UUID,
            allowNull: true,
            references: { model: "admin_areas", key: "area_id" },
            onUpdate: "CASCADE",
            onDelete: "RESTRICT",
          },
          level: {
            // region | zone | woreda
            type: Sequelize.STRING(10),
            allowNull: false,
          },
          // Official P-code (e.g. ET0602 = Metekel zone); null for areas added by hand
          pcode: { type: Sequelize.STRING(20), allowNull: true, unique: true },
          name: { type: Sequelize.STRING(255), allowNull: false },
          name_am: { type: Sequelize.STRING(255), allowNull: true },
          // official = from COD-AB, manual = added in the app
          source: { type: Sequelize.STRING(10), allowNull: false, defaultValue: "official" },
          center_lat: { type: Sequelize.DOUBLE, allowNull: true },
          center_lng: { type: Sequelize.DOUBLE, allowNull: true },
          // Bounding box, for a fast "could this point be inside?" check
          min_lat: { type: Sequelize.DOUBLE, allowNull: true },
          min_lng: { type: Sequelize.DOUBLE, allowNull: true },
          max_lat: { type: Sequelize.DOUBLE, allowNull: true },
          max_lng: { type: Sequelize.DOUBLE, allowNull: true },
          area_sqkm: { type: Sequelize.DOUBLE, allowNull: true },
          // Simplified GeoJSON Polygon / MultiPolygon (lng, lat)
          boundary: { type: Sequelize.JSONB, allowNull: true },
          data_version: { type: Sequelize.STRING(20), allowNull: true },
          is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
          created_at: { type: Sequelize.DATE, allowNull: false },
          updated_at: { type: Sequelize.DATE, allowNull: false },
        },
        { transaction },
      );
      await queryInterface.addIndex("admin_areas", ["parent_id"], { transaction });
      await queryInterface.addIndex("admin_areas", ["level"], { transaction });
      await queryInterface.addIndex("admin_areas", ["min_lat", "max_lat", "min_lng", "max_lng"], {
        name: "admin_areas_bbox_idx",
        transaction,
      });

      await queryInterface.createTable(
        "area_aliases",
        {
          alias_id: {
            type: Sequelize.UUID,
            allowNull: false,
            primaryKey: true,
            defaultValue: Sequelize.UUIDV4,
          },
          area_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: "admin_areas", key: "area_id" },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
          },
          // The spelling as written, e.g. "Asossa"
          alias: { type: Sequelize.STRING(255), allowNull: false },
          // Normalized form used for matching, e.g. "asossa"
          alias_normalized: { type: Sequelize.STRING(255), allowNull: false },
          // Same level + parent as the area, so "Zone 2" in Afar and "Zone 2" in Gambela stay apart
          level: { type: Sequelize.STRING(10), allowNull: false },
          scope_parent_id: { type: Sequelize.UUID, allowNull: true },
          // official = alt name from COD-AB, confirmed = confirmed by a user during import/edit
          source: { type: Sequelize.STRING(10), allowNull: false, defaultValue: "confirmed" },
          created_by: { type: Sequelize.UUID, allowNull: true },
          created_at: { type: Sequelize.DATE, allowNull: false },
          updated_at: { type: Sequelize.DATE, allowNull: false },
        },
        { transaction },
      );
      // One meaning per spelling within the same level and parent
      await queryInterface.sequelize.query(
        `CREATE UNIQUE INDEX area_aliases_scope_unique
           ON area_aliases (level, COALESCE(scope_parent_id, '00000000-0000-0000-0000-000000000000'), alias_normalized)`,
        { transaction },
      );
      await queryInterface.addIndex("area_aliases", ["area_id"], { transaction });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable("area_aliases");
    await queryInterface.dropTable("admin_areas");
  },
};
