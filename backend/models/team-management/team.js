"use strict";
const { Model } = require("sequelize");

/** An inspection team. Members are in TeamMember; the licenses it covers in TeamLicense. */
module.exports = (sequelize, DataTypes) => {
  class Team extends Model {
    static associate(models) {
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
      name: { type: DataTypes.STRING(120), allowNull: false, unique: true },
      code: { type: DataTypes.STRING(30), allowNull: true, unique: true },
      description: { type: DataTypes.TEXT, allowNull: true },
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
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
