// models/role.js
"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class Role extends Model {
    static associate(models) {
      // Role has many RolePermissions
      Role.hasMany(models.RolePermission, {
        foreignKey: "role_id",
        as: "rolePermissions",
      });

      Role.belongsTo(models.SectorNode, { foreignKey: "sector_node_id", as: "sector" });
      Role.belongsTo(models.Role, { foreignKey: "copied_from_role_id", as: "copiedFrom" });

      Role.belongsToMany(models.User, {
        through: models.UserRoles,
        foreignKey: "role_id",
        otherKey: "user_id",
        as: "users",
      });
    }
  }

  Role.init(
    {
      role_id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      // Unique among global roles, and within a sector for sector roles (DB indexes)
      name: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      // NULL = global template every sector can use; set = this sector's own role
      sector_node_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      // The role this one was copied from, if any
      copied_from_role_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
      created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
      updated_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
      deleted_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "Role",
      tableName: "roles",
      timestamps: false,
      underscored: true,
      paranoid: true,
      deletedAt: "deleted_at",
    }
  );

  return Role;
};
