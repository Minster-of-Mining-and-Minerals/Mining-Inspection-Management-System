"use strict";
const { Model } = require("sequelize");

/** A license holder. One company can hold several licenses. */
module.exports = (sequelize, DataTypes) => {
  class Company extends Model {
    static associate(models) {
      Company.hasMany(models.CompanyLicense, { foreignKey: "company_id", as: "licenses" });
      Company.belongsTo(models.User, { foreignKey: "created_by", as: "creator", constraints: false });
    }

    /** Comparable form of a company name: "MIDROC Gold Mine PLC " -> "midroc gold mine plc". */
    static normalizeName(name) {
      return String(name || "")
        .normalize("NFKC")
        .toLowerCase()
        .replace(/[’'`´]/g, "")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim();
    }
  }

  Company.init(
    {
      company_id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      name: { type: DataTypes.STRING(255), allowNull: false },
      name_normalized: { type: DataTypes.STRING(255), allowNull: false, unique: true },
      name_am: { type: DataTypes.STRING(255), allowNull: true },
      tin: { type: DataTypes.STRING(30), allowNull: true, unique: true },
      phone: { type: DataTypes.STRING(50), allowNull: true },
      email: { type: DataTypes.STRING(255), allowNull: true },
      address: { type: DataTypes.TEXT, allowNull: true },
      contact_person: { type: DataTypes.STRING(150), allowNull: true },
      contact_phone: { type: DataTypes.STRING(50), allowNull: true },
      notes: { type: DataTypes.TEXT, allowNull: true },
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
      created_by: { type: DataTypes.UUID, allowNull: true },
    },
    {
      sequelize,
      modelName: "Company",
      tableName: "companies",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      hooks: {
        beforeValidate: (company) => {
          if (company.name) {
            company.name = company.name.trim().replace(/\s+/g, " ");
            company.name_normalized = Company.normalizeName(company.name);
          }
        },
      },
    },
  );

  return Company;
};
