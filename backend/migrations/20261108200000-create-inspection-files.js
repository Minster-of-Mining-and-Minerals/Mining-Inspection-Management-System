"use strict";

/**
 * Files attached to an inspection's answers: photos / documents / videos of a file question
 * or of a status question's evidence, and signatures. Stored by services/fileStorage.js;
 * `storage_key` is where (relative to the upload folder).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("inspection_files", {
      file_id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      inspection_id: { type: Sequelize.UUID, allowNull: false, references: { model: "inspections", key: "inspection_id" }, onDelete: "CASCADE" },
      field_key: { type: Sequelize.STRING(60), allowNull: false },
      kind: { type: Sequelize.STRING(12), allowNull: false }, // image | document | video | signature
      original_name: { type: Sequelize.STRING(255), allowNull: false },
      mime_type: { type: Sequelize.STRING(120), allowNull: false },
      size_bytes: { type: Sequelize.BIGINT, allowNull: false },
      storage_key: { type: Sequelize.STRING(400), allowNull: false },
      uploaded_by: { type: Sequelize.UUID, allowNull: true, references: { model: "users", key: "user_id" }, onDelete: "SET NULL" },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
    });
    await queryInterface.addIndex("inspection_files", ["inspection_id", "field_key"]);
    await queryInterface.sequelize.query(
      `ALTER TABLE inspection_files ADD CONSTRAINT inspection_files_kind_check CHECK (kind IN ('image','document','video','signature'))`,
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable("inspection_files");
  },
};
