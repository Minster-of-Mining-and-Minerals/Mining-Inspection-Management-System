"use strict";
const { Model } = require("sequelize");

/** Region → Zone → Woreda (official COD-AB list, plus areas added by hand). */
module.exports = (sequelize, DataTypes) => {
  class AdminArea extends Model {
    static associate(models) {
      AdminArea.belongsTo(models.AdminArea, { foreignKey: "parent_id", as: "parent" });
      AdminArea.hasMany(models.AdminArea, { foreignKey: "parent_id", as: "children" });
      AdminArea.hasMany(models.AreaAlias, { foreignKey: "area_id", as: "aliases" });
    }
  }

  AdminArea.LEVELS = ["region", "zone", "woreda"];
  AdminArea.CHILD_LEVEL = { region: "zone", zone: "woreda", woreda: null };

  AdminArea.init(
    {
      area_id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      parent_id: { type: DataTypes.UUID, allowNull: true },
      level: {
        type: DataTypes.STRING(10),
        allowNull: false,
        validate: { isIn: [AdminArea.LEVELS] },
      },
      pcode: { type: DataTypes.STRING(20), allowNull: true, unique: true },
      name: { type: DataTypes.STRING(255), allowNull: false },
      name_am: { type: DataTypes.STRING(255), allowNull: true },
      source: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: "official",
        validate: { isIn: [["official", "manual"]] },
      },
      center_lat: { type: DataTypes.DOUBLE, allowNull: true },
      center_lng: { type: DataTypes.DOUBLE, allowNull: true },
      min_lat: { type: DataTypes.DOUBLE, allowNull: true },
      min_lng: { type: DataTypes.DOUBLE, allowNull: true },
      max_lat: { type: DataTypes.DOUBLE, allowNull: true },
      max_lng: { type: DataTypes.DOUBLE, allowNull: true },
      area_sqkm: { type: DataTypes.DOUBLE, allowNull: true },
      boundary: { type: DataTypes.JSONB, allowNull: true },
      data_version: { type: DataTypes.STRING(20), allowNull: true },
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    {
      sequelize,
      modelName: "AdminArea",
      tableName: "admin_areas",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      // Boundaries are large: only load them when explicitly asked for
      defaultScope: { attributes: { exclude: ["boundary"] } },
      scopes: { withBoundary: { attributes: { include: ["boundary"] } } },
    },
  );

  return AdminArea;
};
