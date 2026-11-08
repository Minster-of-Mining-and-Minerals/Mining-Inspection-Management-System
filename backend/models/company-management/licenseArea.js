"use strict";
const { Model } = require("sequelize");

/** License ↔ Region/Zone/Woreda (usually woredas; one license can cover several). */
module.exports = (sequelize, DataTypes) => {
  class LicenseArea extends Model {}

  LicenseArea.init(
    {
      license_id: { type: DataTypes.UUID, primaryKey: true },
      area_id: { type: DataTypes.UUID, primaryKey: true },
    },
    {
      sequelize,
      modelName: "LicenseArea",
      tableName: "license_areas",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: false,
    },
  );

  return LicenseArea;
};
