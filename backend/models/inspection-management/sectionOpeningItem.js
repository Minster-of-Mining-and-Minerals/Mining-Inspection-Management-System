"use strict";
const { Model } = require("sequelize");

/** One submitted inspection in a SectionOpening: waiting until the team taps "Done updating". */
module.exports = (sequelize, DataTypes) => {
  class SectionOpeningItem extends Model {
    static associate(models) {
      SectionOpeningItem.belongsTo(models.SectionOpening, { foreignKey: "opening_id", as: "opening" });
      SectionOpeningItem.belongsTo(models.Inspection, { foreignKey: "inspection_id", as: "inspection" });
      SectionOpeningItem.belongsTo(models.User, { foreignKey: "done_by", as: "doneBy", constraints: false });
    }
  }

  SectionOpeningItem.STATUSES = ["waiting", "done"];

  SectionOpeningItem.init(
    {
      item_id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      opening_id: { type: DataTypes.UUID, allowNull: false },
      inspection_id: { type: DataTypes.UUID, allowNull: false },
      status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "waiting", validate: { isIn: [SectionOpeningItem.STATUSES] } },
      done_at: { type: DataTypes.DATE, allowNull: true },
      done_by: { type: DataTypes.UUID, allowNull: true },
      // questions changed while open: { question_key: { at, by } }
      changed_answers: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    },
    { sequelize, modelName: "SectionOpeningItem", tableName: "section_opening_items", timestamps: true, createdAt: "created_at", updatedAt: "updated_at" },
  );

  return SectionOpeningItem;
};
