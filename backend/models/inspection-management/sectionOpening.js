"use strict";
const { Model } = require("sequelize");

/**
 * Sections of submitted inspections opened for the team to update until a deadline
 * (scope: one inspection, chosen licenses, a round, a team or a region). See services/sectionOpeningService.js.
 * It is open while closed_at is empty and until is in the future.
 */
module.exports = (sequelize, DataTypes) => {
  class SectionOpening extends Model {
    static associate(models) {
      SectionOpening.hasMany(models.SectionOpeningItem, { foreignKey: "opening_id", as: "items" });
      SectionOpening.belongsTo(models.InspectionSchedule, { foreignKey: "schedule_id", as: "schedule", constraints: false });
      SectionOpening.belongsTo(models.User, { foreignKey: "opened_by", as: "opener", constraints: false });
      SectionOpening.belongsTo(models.User, { foreignKey: "closed_by", as: "closer", constraints: false });
    }
  }

  SectionOpening.SCOPES = ["inspection", "licenses", "round", "team", "region"];

  SectionOpening.init(
    {
      opening_id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      sector_node_id: { type: DataTypes.UUID, allowNull: false },
      scope: { type: DataTypes.STRING(20), allowNull: false, validate: { isIn: [SectionOpening.SCOPES] } },
      scope_details: { type: DataTypes.JSONB, allowNull: true },
      schedule_id: { type: DataTypes.UUID, allowNull: true },
      section_keys: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      section_labels: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      reason: { type: DataTypes.TEXT, allowNull: false },
      until: { type: DataTypes.DATE, allowNull: false },
      opened_by: { type: DataTypes.UUID, allowNull: true },
      closed_at: { type: DataTypes.DATE, allowNull: true },
      closed_by: { type: DataTypes.UUID, allowNull: true },
      close_reason: { type: DataTypes.STRING(20), allowNull: true },
    },
    { sequelize, modelName: "SectionOpening", tableName: "section_openings", timestamps: true, createdAt: "created_at", updatedAt: "updated_at" },
  );

  return SectionOpening;
};
