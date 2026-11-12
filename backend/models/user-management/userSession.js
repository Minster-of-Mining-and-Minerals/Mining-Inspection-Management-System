"use strict";
const { Model } = require("sequelize");

/** One sign-in (services/sessionService.js). */
module.exports = (sequelize, DataTypes) => {
  class UserSession extends Model {
    static associate(models) {
      UserSession.belongsTo(models.User, { foreignKey: "user_id", as: "user" });
    }
  }
  UserSession.init(
    {
      session_id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      user_id: { type: DataTypes.UUID, allowNull: false },
      ip: { type: DataTypes.STRING(64), allowNull: true },
      user_agent: { type: DataTypes.STRING(500), allowNull: true },
      device: { type: DataTypes.STRING(120), allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      last_seen_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      expires_at: { type: DataTypes.DATE, allowNull: false },
      ended_at: { type: DataTypes.DATE, allowNull: true },
      end_reason: { type: DataTypes.STRING(30), allowNull: true },
      ended_by: { type: DataTypes.UUID, allowNull: true },
    },
    { sequelize, modelName: "UserSession", tableName: "user_sessions", timestamps: false },
  );
  return UserSession;
};
