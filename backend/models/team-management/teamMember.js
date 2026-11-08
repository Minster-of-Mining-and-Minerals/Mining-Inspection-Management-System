"use strict";
const { Model } = require("sequelize");

/**
 * A user's membership of a team. A person is in at most one team at a time;
 * left_on set = no longer in the team (kept for history).
 */
module.exports = (sequelize, DataTypes) => {
  class TeamMember extends Model {
    static associate(models) {
      TeamMember.belongsTo(models.Team, { foreignKey: "team_id", as: "team" });
      TeamMember.belongsTo(models.User, { foreignKey: "user_id", as: "user" });
    }
  }

  TeamMember.ROLES = ["leader", "member"];

  TeamMember.init(
    {
      team_member_id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      team_id: { type: DataTypes.UUID, allowNull: false },
      user_id: { type: DataTypes.UUID, allowNull: false },
      role: { type: DataTypes.STRING(10), allowNull: false, defaultValue: "member", validate: { isIn: [TeamMember.ROLES] } },
      joined_on: { type: DataTypes.DATEONLY, allowNull: false },
      left_on: { type: DataTypes.DATEONLY, allowNull: true },
      created_by: { type: DataTypes.UUID, allowNull: true },
    },
    {
      sequelize,
      modelName: "TeamMember",
      tableName: "team_members",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  );

  return TeamMember;
};
