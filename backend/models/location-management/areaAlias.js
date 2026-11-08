"use strict";
const { Model } = require("sequelize");

/**
 * Another spelling of an area, e.g. "Asossa" → Assosa.
 * Scoped to the area's level and parent, so the same text can mean different
 * places in different regions ("Zone 2" in Afar vs. Gambela).
 */
module.exports = (sequelize, DataTypes) => {
  class AreaAlias extends Model {
    static associate(models) {
      AreaAlias.belongsTo(models.AdminArea, { foreignKey: "area_id", as: "area" });
      AreaAlias.belongsTo(models.User, { foreignKey: "created_by", as: "creator", constraints: false });
    }
  }

  AreaAlias.init(
    {
      alias_id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      area_id: { type: DataTypes.UUID, allowNull: false },
      alias: { type: DataTypes.STRING(255), allowNull: false },
      alias_normalized: { type: DataTypes.STRING(255), allowNull: false },
      level: { type: DataTypes.STRING(10), allowNull: false },
      scope_parent_id: { type: DataTypes.UUID, allowNull: true },
      source: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: "confirmed",
        validate: { isIn: [["official", "confirmed"]] },
      },
      created_by: { type: DataTypes.UUID, allowNull: true },
    },
    {
      sequelize,
      modelName: "AreaAlias",
      tableName: "area_aliases",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  );

  return AreaAlias;
};
