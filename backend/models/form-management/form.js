"use strict";
const { Model } = require("sequelize");

/** An inspection checklist. Its questions live in FormVersion.definition. */
module.exports = (sequelize, DataTypes) => {
  class Form extends Model {
    static associate(models) {
      Form.hasMany(models.FormVersion, { foreignKey: "form_id", as: "versions" });
      Form.hasMany(models.FormAssignment, { foreignKey: "form_id", as: "assignments" });
    }
  }

  Form.init(
    {
      form_id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      code: { type: DataTypes.STRING(40), allowNull: true, unique: true },
      name: { type: DataTypes.STRING(200), allowNull: false },
      name_am: { type: DataTypes.STRING(300), allowNull: true },
      description: { type: DataTypes.TEXT, allowNull: true },
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
      created_by: { type: DataTypes.UUID, allowNull: true },
    },
    {
      sequelize,
      modelName: "Form",
      tableName: "forms",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  );

  return Form;
};
