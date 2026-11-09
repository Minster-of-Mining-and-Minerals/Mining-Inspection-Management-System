"use strict";
const { Model } = require("sequelize");

/** History of a task: started, submitted, returned (for correction), reassigned, due_changed. */
module.exports = (sequelize, DataTypes) => {
  class InspectionEvent extends Model {
    static associate(models) {
      InspectionEvent.belongsTo(models.Inspection, { foreignKey: "inspection_id", as: "inspection" });
      InspectionEvent.belongsTo(models.User, { foreignKey: "user_id", as: "user", constraints: false });
    }
  }

  InspectionEvent.TYPES = ["started", "submitted", "returned", "reassigned", "due_changed"];

  InspectionEvent.init(
    {
      event_id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      inspection_id: { type: DataTypes.UUID, allowNull: false },
      type: { type: DataTypes.STRING(20), allowNull: false, validate: { isIn: [InspectionEvent.TYPES] } },
      user_id: { type: DataTypes.UUID, allowNull: true },
      details: { type: DataTypes.JSONB, allowNull: true },
    },
    {
      sequelize,
      modelName: "InspectionEvent",
      tableName: "inspection_events",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: false,
    },
  );

  return InspectionEvent;
};
