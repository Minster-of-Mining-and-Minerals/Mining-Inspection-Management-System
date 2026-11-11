"use strict";
const { Model } = require("sequelize");

/** An exploration or mining license held by a company. Inspections target a license. */
module.exports = (sequelize, DataTypes) => {
  class CompanyLicense extends Model {
    static associate(models) {
      CompanyLicense.belongsTo(models.SectorNode, { foreignKey: "sector_node_id", as: "sector" });
      CompanyLicense.belongsTo(models.Company, { foreignKey: "company_id", as: "company" });
      CompanyLicense.belongsToMany(models.Mineral, {
        through: models.LicenseMineral,
        foreignKey: "license_id",
        otherKey: "mineral_id",
        as: "minerals",
      });
      CompanyLicense.belongsToMany(models.AdminArea, {
        through: models.LicenseArea,
        foreignKey: "license_id",
        otherKey: "area_id",
        as: "areas",
      });
      CompanyLicense.belongsToMany(models.Team, {
        through: models.TeamLicense,
        foreignKey: "license_id",
        otherKey: "team_id",
        as: "teams",
      });
    }
  }

  CompanyLicense.TYPES = ["exploration", "mining"];
  CompanyLicense.STATUSES = ["active", "suspended", "expired", "revoked"];

  CompanyLicense.init(
    {
      license_id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      company_id: { type: DataTypes.UUID, allowNull: false },
      license_number: { type: DataTypes.STRING(100), allowNull: false },
      license_type: { type: DataTypes.STRING(20), allowNull: false, validate: { isIn: [CompanyLicense.TYPES] } },
      mineral_text: { type: DataTypes.STRING(255), allowNull: true },
      issued_on: { type: DataTypes.DATEONLY, allowNull: true },
      expires_on: { type: DataTypes.DATEONLY, allowNull: true },
      date_note: { type: DataTypes.STRING(255), allowNull: true },
      site_name: { type: DataTypes.STRING(255), allowNull: true },
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "active",
        validate: { isIn: [CompanyLicense.STATUSES] },
      },
      notes: { type: DataTypes.TEXT, allowNull: true },
      // Owning sector (data is isolated per sector)
      sector_node_id: { type: DataTypes.UUID, allowNull: false },
      // Surveyed license area: GeoJSON MultiPolygon, [lng, lat] in WGS 84 (left out of queries unless asked for)
      boundary: { type: DataTypes.JSONB, allowNull: true },
      center_lat: { type: DataTypes.DOUBLE, allowNull: true },
      center_lng: { type: DataTypes.DOUBLE, allowNull: true },
      // Where the woreda/zone/region links come from: 'coordinates' (the boundary) or 'list' (typed names)
      location_source: { type: DataTypes.STRING(20), allowNull: true, validate: { isIn: [["coordinates", "list"]] } },
      // How the team travels there (license list "Traveling By" / "Airport")
      travel_mode: { type: DataTypes.STRING(10), allowNull: true, validate: { isIn: [["car", "plane"]] } },
      airport: { type: DataTypes.STRING(60), allowNull: true },
      created_by: { type: DataTypes.UUID, allowNull: true },
    },
    {
      sequelize,
      modelName: "CompanyLicense",
      defaultScope: { attributes: { exclude: ["boundary"] } },
      scopes: { withBoundary: { attributes: { include: ["boundary"] } } },
      tableName: "company_licenses",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      hooks: {
        beforeValidate: (license) => {
          // "MOM\EL\00055\2025 " and "mom/el/00055/2025" are the same license
          if (license.license_number) license.license_number = license.license_number.trim().replace(/\//g, "\\").toUpperCase();
        },
      },
    },
  );

  return CompanyLicense;
};
