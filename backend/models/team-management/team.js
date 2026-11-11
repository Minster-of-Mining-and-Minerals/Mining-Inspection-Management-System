"use strict";
const { Model } = require("sequelize");

/** An inspection team. Members are in TeamMember; the licenses it covers in TeamLicense. */
module.exports = (sequelize, DataTypes) => {
  class Team extends Model {
    static associate(models) {
      Team.belongsTo(models.SectorNode, { foreignKey: "sector_node_id", as: "sector" });
      Team.hasMany(models.TeamMember, { foreignKey: "team_id", as: "members" });
      Team.belongsToMany(models.CompanyLicense, {
        through: models.TeamLicense,
        foreignKey: "team_id",
        otherKey: "license_id",
        as: "licenses",
      });
    }
  }

  Team.init(
    {
      team_id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      name: { type: DataTypes.STRING(120), allowNull: false },
      code: { type: DataTypes.STRING(30), allowNull: true },
      description: { type: DataTypes.TEXT, allowNull: true },
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
      // Owning sector (data is isolated per sector)
      sector_node_id: { type: DataTypes.UUID, allowNull: false },
      created_by: { type: DataTypes.UUID, allowNull: true },
    },
    {
      sequelize,
      modelName: "Team",
      tableName: "teams",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  );

  return Team;
};
