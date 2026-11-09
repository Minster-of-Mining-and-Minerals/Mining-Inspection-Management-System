"use strict";
const { Model } = require("sequelize");

/** A photo, document, video or signature attached to one question of an inspection. */
module.exports = (sequelize, DataTypes) => {
  class InspectionFile extends Model {
    static associate(models) {
      InspectionFile.belongsTo(models.Inspection, { foreignKey: "inspection_id", as: "inspection" });
      InspectionFile.belongsTo(models.User, { foreignKey: "uploaded_by", as: "uploader", constraints: false });
    }
  }

  InspectionFile.KINDS = ["image", "document", "video", "signature"];

  InspectionFile.init(
    {
      file_id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      inspection_id: { type: DataTypes.UUID, allowNull: false },
      field_key: { type: DataTypes.STRING(60), allowNull: false },
      kind: { type: DataTypes.STRING(12), allowNull: false, validate: { isIn: [InspectionFile.KINDS] } },
      original_name: { type: DataTypes.STRING(255), allowNull: false },
      mime_type: { type: DataTypes.STRING(120), allowNull: false },
      size_bytes: {
        type: DataTypes.BIGINT,
        allowNull: false,
        get() {
          return Number(this.getDataValue("size_bytes"));
        },
      },
      storage_key: { type: DataTypes.STRING(400), allowNull: false },
      uploaded_by: { type: DataTypes.UUID, allowNull: true },
    },
    {
      sequelize,
      modelName: "InspectionFile",
      tableName: "inspection_files",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: false,
      defaultScope: { attributes: { exclude: ["storage_key"] } },
      scopes: { withStorage: { attributes: { include: ["storage_key"] } } },
    },
  );

  return InspectionFile;
};
