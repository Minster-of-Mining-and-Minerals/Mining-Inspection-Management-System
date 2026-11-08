"use strict";
const { Model } = require("sequelize");

/** A license a team is responsible for inspecting. */
module.exports = (sequelize, DataTypes) => {
  class TeamLicense extends Model {
    static associate(models) {
      TeamLicense.belongsTo(models.Team, { foreignKey: "team_id", as: "team" });
      TeamLicense.belongsTo(models.CompanyLicense, { foreignKey: "license_id", as: "license" });
    }
  }

  TeamLicense.init(
    {
      team_id: { type: DataTypes.UUID, primaryKey: true },
      license_id: { type: DataTypes.UUID, primaryKey: true },
      created_by: { type: DataTypes.UUID, allowNull: true },
    },
    {
      sequelize,
      modelName: "TeamLicense",
      tableName: "team_licenses",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: false,
    },
  );

  return TeamLicense;
};
