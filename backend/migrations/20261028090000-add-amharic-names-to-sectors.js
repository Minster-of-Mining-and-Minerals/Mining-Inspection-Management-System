"use strict";

/**
 * Bilingual names for the organization (sector) tree.
 * Existing `name` / `description` stay as the English values; the new `*_am`
 * columns hold the Amharic text and are optional (the app falls back to English).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      for (const table of ["sector_nodes"]) {
        await queryInterface.addColumn(
          table,
          "name_am",
          { type: Sequelize.STRING(255), allowNull: true },
          { transaction },
        );
        await queryInterface.addColumn(
          table,
          "description_am",
          { type: Sequelize.TEXT, allowNull: true },
          { transaction },
        );
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      for (const table of ["sector_nodes"]) {
        await queryInterface.removeColumn(table, "description_am", { transaction });
        await queryInterface.removeColumn(table, "name_am", { transaction });
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
