"use strict";
const { Model } = require("sequelize");

/**
 * Which licenses use a form:
 *   all           every license
 *   license_type  every exploration (or mining) license
 *   company       every license of one company
 *   license       one license
 */
module.exports = (sequelize, DataTypes) => {
  class FormAssignment extends Model {
    static associate(models) {
      FormAssignment.belongsTo(models.Form, { foreignKey: "form_id", as: "form" });
      FormAssignment.belongsTo(models.Company, { foreignKey: "company_id", as: "company" });
      FormAssignment.belongsTo(models.CompanyLicense, { foreignKey: "license_id", as: "license" });
    }
  }

  FormAssignment.TARGETS = ["all", "license_type", "company", "license"];

  FormAssignment.init(
    {
      assignment_id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      form_id: { type: DataTypes.UUID, allowNull: false },
      target_type: { type: DataTypes.STRING(20), allowNull: false, validate: { isIn: [FormAssignment.TARGETS] } },
      license_type: { type: DataTypes.STRING(20), allowNull: true },
      company_id: { type: DataTypes.UUID, allowNull: true },
      license_id: { type: DataTypes.UUID, allowNull: true },
      created_by: { type: DataTypes.UUID, allowNull: true },
    },
    {
      sequelize,
      modelName: "FormAssignment",
      tableName: "form_assignments",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: false,
    },
  );

  return FormAssignment;
};
