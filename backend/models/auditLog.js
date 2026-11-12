"use strict";
const { Model } = require("sequelize");

/** One audited request or sign-in (services/auditService.js). Append-only. */
module.exports = (sequelize, DataTypes) => {
  class AuditLog extends Model {}
  AuditLog.init(
    {
      audit_id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      occurred_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      actor_id: DataTypes.UUID,
      actor_name: DataTypes.STRING(200),
      actor_email: DataTypes.STRING(255),
      actor_sector_id: DataTypes.UUID,
      session_id: DataTypes.UUID,
      action: { type: DataTypes.STRING(80), allowNull: false },
      entity_type: DataTypes.STRING(60),
      entity_id: DataTypes.UUID,
      entity_label: DataTypes.STRING(300),
      entity_sector_id: DataTypes.UUID,
      changes: DataTypes.JSONB,
      outcome: { type: DataTypes.STRING(10), allowNull: false },
      status_code: DataTypes.INTEGER,
      message: DataTypes.STRING(500),
      method: DataTypes.STRING(10),
      path: DataTypes.STRING(300),
      ip: DataTypes.STRING(64),
      user_agent: DataTypes.STRING(500),
    },
    { sequelize, modelName: "AuditLog", tableName: "audit_logs", timestamps: false },
  );
  return AuditLog;
};
