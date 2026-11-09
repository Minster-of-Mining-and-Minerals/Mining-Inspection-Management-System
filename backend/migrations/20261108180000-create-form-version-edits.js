"use strict";

/**
 * History of direct ("live") edits to a published form version: who changed it,
 * when, and a summary of what changed. Drafts don't need this; they become a new
 * version with its own change note.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("form_version_edits", {
      edit_id: { type: Sequelize.UUID, primaryKey: true, allowNull: false, defaultValue: Sequelize.UUIDV4 },
      version_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "form_versions", key: "version_id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      edited_by: { type: Sequelize.UUID, allowNull: true },
      // e.g. "2 reworded, 1 question added"
      summary: { type: Sequelize.STRING(500), allowNull: false },
      // Full comparison result (added / reworded / changed / …)
      details: { type: Sequelize.JSONB, allowNull: true },
      note: { type: Sequelize.TEXT, allowNull: true },
      // The definition before this edit, so it can be looked at or restored
      previous_definition: { type: Sequelize.JSONB, allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex("form_version_edits", ["version_id", "created_at"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("form_version_edits");
  },
};
