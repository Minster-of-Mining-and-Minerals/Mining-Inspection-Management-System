"use strict";
const { Model } = require("sequelize");

/** A license chosen for a schedule (when the schedule targets chosen licenses). */
module.exports = (sequelize, DataTypes) => {
  class ScheduleLicense extends Model {}

  ScheduleLicense.init(
    {
      schedule_id: { type: DataTypes.UUID, primaryKey: true },
      license_id: { type: DataTypes.UUID, primaryKey: true },
    },
    { sequelize, modelName: "ScheduleLicense", tableName: "schedule_licenses", timestamps: false },
  );

  return ScheduleLicense;
};
