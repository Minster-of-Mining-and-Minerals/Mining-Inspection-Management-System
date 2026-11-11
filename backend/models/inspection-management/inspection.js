"use strict";
const { Model } = require("sequelize");

/**
 * A task: one form to fill for one license, given to the license's team.
 * todo -> in_progress (answers saved as they go) -> submitted (locked; can be returned for correction).
 * "Overdue" is not stored: it is a task not submitted after due_at. Submitting after due_at marks it late.
 */
module.exports = (sequelize, DataTypes) => {
  class Inspection extends Model {
    static associate(models) {
      Inspection.belongsTo(models.SectorNode, { foreignKey: "sector_node_id", as: "sector" });
      Inspection.belongsTo(models.InspectionSchedule, { foreignKey: "schedule_id", as: "schedule" });
      Inspection.belongsTo(models.Form, { foreignKey: "form_id", as: "form" });
      Inspection.belongsTo(models.FormVersion, { foreignKey: "form_version_id", as: "version" });
      Inspection.belongsTo(models.CompanyLicense, { foreignKey: "license_id", as: "license" });
      Inspection.belongsTo(models.Company, { foreignKey: "company_id", as: "company" });
      Inspection.belongsTo(models.Team, { foreignKey: "team_id", as: "team" });
      Inspection.belongsTo(models.User, { foreignKey: "submitted_by", as: "submitter", constraints: false });
      Inspection.belongsTo(models.User, { foreignKey: "last_saved_by", as: "lastSaver", constraints: false });
      Inspection.hasMany(models.InspectionEvent, { foreignKey: "inspection_id", as: "events" });
    }
  }

  Inspection.STATUSES = ["todo", "in_progress", "submitted"];

  Inspection.init(
    {
      inspection_id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      schedule_id: { type: DataTypes.UUID, allowNull: true },
      form_id: { type: DataTypes.UUID, allowNull: false },
      form_version_id: { type: DataTypes.UUID, allowNull: true },
      license_id: { type: DataTypes.UUID, allowNull: false },
      company_id: { type: DataTypes.UUID, allowNull: false },
      team_id: { type: DataTypes.UUID, allowNull: true },
      // Owning sector (data is isolated per sector)
      sector_node_id: { type: DataTypes.UUID, allowNull: false },
      occurrence_date: { type: DataTypes.DATEONLY, allowNull: false },
      due_at: { type: DataTypes.DATE, allowNull: false },
      status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "todo", validate: { isIn: [Inspection.STATUSES] } },
      answers: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      score: {
        type: DataTypes.DECIMAL(6, 4),
        allowNull: true,
        get() {
          const v = this.getDataValue("score");
          return v == null ? null : Number(v);
        },
      },
      started_at: { type: DataTypes.DATE, allowNull: true },
      started_by: { type: DataTypes.UUID, allowNull: true },
      last_saved_at: { type: DataTypes.DATE, allowNull: true },
      last_saved_by: { type: DataTypes.UUID, allowNull: true },
      submitted_at: { type: DataTypes.DATE, allowNull: true },
      submitted_by: { type: DataTypes.UUID, allowNull: true },
      is_late: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      submit_location: { type: DataTypes.JSONB, allowNull: true },
      submit_device: { type: DataTypes.JSONB, allowNull: true },
      submit_ip: { type: DataTypes.STRING(64), allowNull: true },
      return_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    },
    {
      sequelize,
      modelName: "Inspection",
      tableName: "inspections",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  );

  return Inspection;
};
