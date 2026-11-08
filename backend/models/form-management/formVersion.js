"use strict";
const { Model } = require("sequelize");

/**
 * One version of a form's questions. draft (editable) → published (current, frozen)
 * → retired (replaced by a newer published version, still shown on old inspections).
 */
module.exports = (sequelize, DataTypes) => {
  class FormVersion extends Model {
    static associate(models) {
      FormVersion.belongsTo(models.Form, { foreignKey: "form_id", as: "form" });
    }
  }

  FormVersion.STATUSES = ["draft", "published", "retired"];

  FormVersion.init(
    {
      version_id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      form_id: { type: DataTypes.UUID, allowNull: false },
      version_number: { type: DataTypes.INTEGER, allowNull: false },
      status: { type: DataTypes.STRING(10), allowNull: false, defaultValue: "draft", validate: { isIn: [FormVersion.STATUSES] } },
      definition: { type: DataTypes.JSONB, allowNull: false },
      change_note: { type: DataTypes.TEXT, allowNull: true },
      published_at: { type: DataTypes.DATE, allowNull: true },
      published_by: { type: DataTypes.UUID, allowNull: true },
      created_by: { type: DataTypes.UUID, allowNull: true },
    },
    {
      sequelize,
      modelName: "FormVersion",
      tableName: "form_versions",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  );

  return FormVersion;
};
