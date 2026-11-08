"use strict";
const { Model } = require("sequelize");

/** One direct edit of a published form version (who, when, what changed, and the text before). */
module.exports = (sequelize, DataTypes) => {
  class FormVersionEdit extends Model {
    static associate(models) {
      FormVersionEdit.belongsTo(models.FormVersion, { foreignKey: "version_id", as: "version" });
      FormVersionEdit.belongsTo(models.User, { foreignKey: "edited_by", as: "editor", constraints: false });
    }
  }

  FormVersionEdit.init(
    {
      edit_id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      version_id: { type: DataTypes.UUID, allowNull: false },
      edited_by: { type: DataTypes.UUID, allowNull: true },
      summary: { type: DataTypes.STRING(500), allowNull: false },
      details: { type: DataTypes.JSONB, allowNull: true },
      note: { type: DataTypes.TEXT, allowNull: true },
      previous_definition: { type: DataTypes.JSONB, allowNull: false },
    },
    {
      sequelize,
      modelName: "FormVersionEdit",
      tableName: "form_version_edits",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: false,
    },
  );

  return FormVersionEdit;
};
