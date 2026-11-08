"use strict";
const { Model } = require("sequelize");

/** License ↔ mineral (a license can cover several minerals). */
module.exports = (sequelize, DataTypes) => {
  class LicenseMineral extends Model {}

  LicenseMineral.init(
    {
      license_id: { type: DataTypes.UUID, primaryKey: true },
      mineral_id: { type: DataTypes.UUID, primaryKey: true },
    },
    {
      sequelize,
      modelName: "LicenseMineral",
      tableName: "license_minerals",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: false,
    },
  );

  return LicenseMineral;
};
