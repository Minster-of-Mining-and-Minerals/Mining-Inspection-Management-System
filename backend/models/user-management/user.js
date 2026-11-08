// models/user.js
"use strict";
const { Model } = require("sequelize");

// Never part of an API response, whatever query loaded the user
const SECRET_FIELDS = ["password", "otp", "otp_expiry"];

module.exports = (sequelize, DataTypes) => {
  class User extends Model {
    /** res.json(user) and JSON.stringify(user) leave out the password hash and one-time codes. */
    toJSON() {
      const values = { ...super.toJSON() };
      for (const field of SECRET_FIELDS) delete values[field];
      return values;
    }

    static associate(models) {
      // User belongs to UserType
      User.belongsTo(models.UserType, {
        foreignKey: "user_type_id",
        as: "userType",
      });

      User.belongsToMany(models.Role, {
        through: models.UserRoles,
        foreignKey: "user_id",
        otherKey: "role_id",
        as: "roles",
      });

      // User belongs to SectorNode
      User.belongsTo(models.SectorNode, {
        foreignKey: "sector_node_id",
        as: "sectorNode",
      });
      // User belongs to SectorNode
      User.belongsTo(models.SectorNode, {
        foreignKey: "department_id",
        as: "department",
      });
      // Team memberships (at most one active at a time; past ones kept as history)
      User.hasMany(models.TeamMember, {
        foreignKey: "user_id",
        as: "teamMemberships",
      });
      // User belongs to Attachment as profile image
      User.belongsTo(models.Attachment, {
        foreignKey: "profile_image_id",
        as: "profileImage",
      });
    }
  }

  User.init(
    {
      user_id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      sector_node_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: "sector_nodes",
          key: "sector_node_id",
        },
      },
      department_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: "sector_nodes",
          key: "sector_node_id",
        },
      },
      profile_image_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: "attachments",
          key: "attachment_id",
        },
      },
      full_name: {

        type: DataTypes.STRING(100),
        allowNull: false,
      },
      email: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true,
        validate: { isEmail: true },
      },
      password: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      phone_number: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      profile_image: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      is_first_logged_in: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
      last_login_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      password_changed_at: {
        type: DataTypes.DATE,
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
      otp: {
        type: DataTypes.STRING(10),
        allowNull: true,
      },
      otp_expiry: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "User",
      tableName: "users",
      timestamps: false,
      underscored: true,
    },
  );

  return User;
};
