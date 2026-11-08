"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class SectorNode extends Model {
    static associate(models) {
      // Self-referencing parent-child relationship
      SectorNode.belongsTo(models.SectorNode, {
        foreignKey: "parent_id",
        as: "parent",
      });

      SectorNode.hasMany(models.SectorNode, {
        foreignKey: "parent_id",
        as: "children",
      });

      // One sector node has many users
      SectorNode.hasMany(models.User, {
        foreignKey: "sector_node_id",
        as: "users",
      });

      // SectorNode has one head (user)
      SectorNode.belongsTo(models.User, {
        foreignKey: "head_id",
        as: "head",
      });
    }
  }

  SectorNode.init(
    {
      sector_node_id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },

      parent_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },

      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },

      // Amharic name/description (optional — the app falls back to `name` / `description`)
      name_am: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },

      description_am: {
        type: DataTypes.TEXT,
        allowNull: true,
      },

      head_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: "users",
          key: "user_id",
        },
      },

      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },

      level: {
        type: DataTypes.INTEGER,
        defaultValue: 1,
      },

      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
    },
    {
      sequelize,
      modelName: "SectorNode",
      tableName: "sector_nodes",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      deletedAt: "deleted_at",
      paranoid: true,

      // ✅ Important: uniqueness should be scoped, not global
      indexes: [
        {
          fields: ["parent_id"],
        },
      ],
    },
  );

  return SectorNode;
};
