"use strict";

/**
 * Mineral categories become an editable list instead of fixed values.
 * Creates mineral_categories with the 8 starting categories, points every
 * mineral at its category (minerals.category_id) and drops the old text column.
 */
const { v4: uuidv4 } = require("uuid");

const START = [
  { code: "precious_metal", name: "Precious metals" },
  { code: "base_metal", name: "Base & ferrous metals" },
  { code: "battery_metal", name: "Battery & critical metals" },
  { code: "energy", name: "Energy minerals" },
  { code: "industrial", name: "Industrial minerals" },
  { code: "construction", name: "Construction & dimension stone" },
  { code: "gemstone", name: "Gemstones" },
  { code: "other", name: "Other" },
];

module.exports = {
  START,

  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    const q = (sql, replacements) => queryInterface.sequelize.query(sql, { replacements, transaction });
    try {
      await queryInterface.createTable(
        "mineral_categories",
        {
          category_id: { type: Sequelize.UUID, primaryKey: true, allowNull: false, defaultValue: Sequelize.UUIDV4 },
          // Stable key used by seeders and imports; not shown to users
          code: { type: Sequelize.STRING(50), allowNull: false, unique: true },
          name: { type: Sequelize.STRING(120), allowNull: false, unique: true },
          name_am: { type: Sequelize.STRING(120), allowNull: true },
          sort_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
          is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
          created_at: { type: Sequelize.DATE, allowNull: false },
          updated_at: { type: Sequelize.DATE, allowNull: false },
        },
        { transaction },
      );

      const now = new Date();
      for (const [i, c] of START.entries()) {
        await q(
          `INSERT INTO mineral_categories (category_id, code, name, sort_order, is_active, created_at, updated_at)
           VALUES (:id, :code, :name, :sort, true, :now, :now)`,
          { id: uuidv4(), code: c.code, name: c.name, sort: (i + 1) * 10, now },
        );
      }

      await queryInterface.addColumn(
        "minerals",
        "category_id",
        {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: "mineral_categories", key: "category_id" },
          onUpdate: "CASCADE",
          onDelete: "RESTRICT",
        },
        { transaction },
      );

      // Existing minerals keep their category; anything unknown goes to "Other"
      await q(`
        UPDATE minerals m SET category_id = c.category_id
        FROM mineral_categories c WHERE c.code = m.category`);
      await q(`
        UPDATE minerals SET category_id = (SELECT category_id FROM mineral_categories WHERE code = 'other')
        WHERE category_id IS NULL`);

      await queryInterface.changeColumn(
        "minerals",
        "category_id",
        {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: "mineral_categories", key: "category_id" },
          onUpdate: "CASCADE",
          onDelete: "RESTRICT",
        },
        { transaction },
      );
      await queryInterface.addIndex("minerals", ["category_id"], { transaction });
      await queryInterface.removeColumn("minerals", "category", { transaction });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.addColumn(
        "minerals",
        "category",
        { type: Sequelize.STRING(30), allowNull: false, defaultValue: "other" },
        { transaction },
      );
      await queryInterface.sequelize.query(
        `UPDATE minerals m SET category = c.code FROM mineral_categories c WHERE c.category_id = m.category_id`,
        { transaction },
      );
      await queryInterface.removeColumn("minerals", "category_id", { transaction });
      await queryInterface.dropTable("mineral_categories", { transaction });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
