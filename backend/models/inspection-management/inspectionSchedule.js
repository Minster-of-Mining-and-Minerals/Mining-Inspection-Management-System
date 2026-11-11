"use strict";
const { Model } = require("sequelize");

/**
 * When a form is filled for which licenses: once, daily, weekly, monthly, quarterly,
 * yearly or every N days. Each occurrence creates one task (Inspection) per license.
 */
module.exports = (sequelize, DataTypes) => {
  class InspectionSchedule extends Model {
    static associate(models) {
      InspectionSchedule.belongsTo(models.SectorNode, { foreignKey: "sector_node_id", as: "sector" });
      InspectionSchedule.belongsTo(models.Form, { foreignKey: "form_id", as: "form" });
      InspectionSchedule.belongsTo(models.User, { foreignKey: "created_by", as: "creator", constraints: false });
      InspectionSchedule.belongsToMany(models.CompanyLicense, {
        through: models.ScheduleLicense,
        foreignKey: "schedule_id",
        otherKey: "license_id",
        as: "licenses",
      });
      InspectionSchedule.hasMany(models.Inspection, { foreignKey: "schedule_id", as: "inspections" });
    }
  }

  InspectionSchedule.FREQUENCIES = ["once", "daily", "weekly", "monthly", "quarterly", "yearly", "every_n_days"];
  InspectionSchedule.TARGETS = ["assigned", "license_type", "licenses"];
  InspectionSchedule.STATUSES = ["active", "paused", "ended"];

  InspectionSchedule.init(
    {
      schedule_id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      form_id: { type: DataTypes.UUID, allowNull: false },
      name: { type: DataTypes.STRING(200), allowNull: false },
      target_type: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "assigned", validate: { isIn: [InspectionSchedule.TARGETS] } },
      license_type: { type: DataTypes.STRING(20), allowNull: true },
      frequency: { type: DataTypes.STRING(20), allowNull: false, validate: { isIn: [InspectionSchedule.FREQUENCIES] } },
      interval_days: { type: DataTypes.INTEGER, allowNull: true },
      weekdays: { type: DataTypes.ARRAY(DataTypes.INTEGER), allowNull: true },
      month_day: { type: DataTypes.INTEGER, allowNull: true },
      start_date: { type: DataTypes.DATEONLY, allowNull: false },
      end_date: { type: DataTypes.DATEONLY, allowNull: true },
      due_days: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      status: { type: DataTypes.STRING(10), allowNull: false, defaultValue: "active", validate: { isIn: [InspectionSchedule.STATUSES] } },
      notes: { type: DataTypes.TEXT, allowNull: true },
      last_generated_on: { type: DataTypes.DATEONLY, allowNull: true },
      // Owning sector (data is isolated per sector)
      sector_node_id: { type: DataTypes.UUID, allowNull: false },
      created_by: { type: DataTypes.UUID, allowNull: true },
    },
    {
      sequelize,
      modelName: "InspectionSchedule",
      tableName: "inspection_schedules",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  );

  return InspectionSchedule;
};
