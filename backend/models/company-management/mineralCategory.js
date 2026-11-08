"use strict";
const { Model } = require("sequelize");

/** Editable grouping of minerals (Precious metals, Industrial minerals, …). */
module.exports = (sequelize, DataTypes) => {
  class MineralCategory extends Model {
    static associate(models) {
      MineralCategory.hasMany(models.Mineral, { foreignKey: "category_id", as: "minerals" });
    }
  }

  MineralCategory.init(
    {
      category_id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      code: { type: DataTypes.STRING(50), allowNull: false, unique: true },
      name: { type: DataTypes.STRING(120), allowNull: false, unique: true },
      name_am: { type: DataTypes.STRING(120), allowNull: true },
      sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    {
      sequelize,
      modelName: "MineralCategory",
      tableName: "mineral_categories",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  );

  return MineralCategory;
};
