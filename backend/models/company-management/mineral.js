"use strict";
const { Model } = require("sequelize");

/** Standard list of minerals, so "Gold and Base Metals" and "gold and base metals" count as the same. */
module.exports = (sequelize, DataTypes) => {
  class Mineral extends Model {
    static associate(models) {
      Mineral.belongsTo(models.MineralCategory, { foreignKey: "category_id", as: "category" });
      Mineral.belongsToMany(models.CompanyLicense, {
        through: models.LicenseMineral,
        foreignKey: "mineral_id",
        otherKey: "license_id",
        as: "licenses",
      });
    }
  }

  Mineral.init(
    {
      mineral_id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      name: { type: DataTypes.STRING(120), allowNull: false, unique: true },
      name_am: { type: DataTypes.STRING(120), allowNull: true },
      category_id: { type: DataTypes.UUID, allowNull: false },
      aliases: { type: DataTypes.ARRAY(DataTypes.STRING(120)), allowNull: false, defaultValue: [] },
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    {
      sequelize,
      modelName: "Mineral",
      tableName: "minerals",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  );

  return Mineral;
};
