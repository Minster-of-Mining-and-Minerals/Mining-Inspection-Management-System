"use strict";

/**
 * Companies, their licenses, the minerals each license covers and the
 * Region / Zone / Woreda areas each license is located in.
 * One company can hold several licenses; inspections will target a license.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    const ts = {
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    };
    try {
      await queryInterface.createTable(
        "minerals",
        {
          mineral_id: { type: Sequelize.UUID, primaryKey: true, allowNull: false, defaultValue: Sequelize.UUIDV4 },
          name: { type: Sequelize.STRING(120), allowNull: false, unique: true },
          name_am: { type: Sequelize.STRING(120), allowNull: true },
          // precious_metal | base_metal | battery_metal | energy | industrial | construction | gemstone | other
          category: { type: Sequelize.STRING(30), allowNull: false, defaultValue: "other" },
          // Other spellings seen in imports, e.g. ["placer gold", "alluvial gold"]
          aliases: { type: Sequelize.ARRAY(Sequelize.STRING(120)), allowNull: false, defaultValue: [] },
          is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
          ...ts,
        },
        { transaction },
      );

      await queryInterface.createTable(
        "companies",
        {
          company_id: { type: Sequelize.UUID, primaryKey: true, allowNull: false, defaultValue: Sequelize.UUIDV4 },
          name: { type: Sequelize.STRING(255), allowNull: false },
          // Lower-case, punctuation-free form used to find the same company again on import
          name_normalized: { type: Sequelize.STRING(255), allowNull: false, unique: true },
          name_am: { type: Sequelize.STRING(255), allowNull: true },
          tin: { type: Sequelize.STRING(30), allowNull: true, unique: true },
          phone: { type: Sequelize.STRING(50), allowNull: true },
          email: { type: Sequelize.STRING(255), allowNull: true },
          address: { type: Sequelize.TEXT, allowNull: true },
          // Default company focal person (the checklist asks for one at each inspection)
          contact_person: { type: Sequelize.STRING(150), allowNull: true },
          contact_phone: { type: Sequelize.STRING(50), allowNull: true },
          notes: { type: Sequelize.TEXT, allowNull: true },
          is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
          created_by: { type: Sequelize.UUID, allowNull: true },
          ...ts,
        },
        { transaction },
      );

      await queryInterface.createTable(
        "company_licenses",
        {
          license_id: { type: Sequelize.UUID, primaryKey: true, allowNull: false, defaultValue: Sequelize.UUIDV4 },
          company_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: "companies", key: "company_id" },
            onUpdate: "CASCADE",
            onDelete: "RESTRICT",
          },
          // e.g. MOM\EL\00055\2025
          license_number: { type: Sequelize.STRING(100), allowNull: false, unique: true },
          // exploration | mining
          license_type: { type: Sequelize.STRING(20), allowNull: false },
          // Mineral text exactly as on the license / import (the minerals table holds the clean list)
          mineral_text: { type: Sequelize.STRING(255), allowNull: true },
          issued_on: { type: Sequelize.DATEONLY, allowNull: true },
          expires_on: { type: Sequelize.DATEONLY, allowNull: true },
          // Anything the dates can't express, e.g. "Reinstated on 18/09/2026"
          date_note: { type: Sequelize.STRING(255), allowNull: true },
          // Mine / project / site name (checklist: "የማዕድን ቦታ / ፕሮጀክት")
          site_name: { type: Sequelize.STRING(255), allowNull: true },
          // active | suspended | expired | revoked
          status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: "active" },
          notes: { type: Sequelize.TEXT, allowNull: true },
          created_by: { type: Sequelize.UUID, allowNull: true },
          ...ts,
        },
        { transaction },
      );
      await queryInterface.addIndex("company_licenses", ["company_id"], { transaction });
      await queryInterface.addIndex("company_licenses", ["license_type"], { transaction });
      await queryInterface.addIndex("company_licenses", ["status"], { transaction });

      await queryInterface.createTable(
        "license_minerals",
        {
          license_id: {
            type: Sequelize.UUID,
            allowNull: false,
            primaryKey: true,
            references: { model: "company_licenses", key: "license_id" },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
          },
          mineral_id: {
            type: Sequelize.UUID,
            allowNull: false,
            primaryKey: true,
            references: { model: "minerals", key: "mineral_id" },
            onUpdate: "CASCADE",
            onDelete: "RESTRICT",
          },
          created_at: { type: Sequelize.DATE, allowNull: false },
        },
        { transaction },
      );

      // Usually woredas; a zone or region when the license list gives nothing finer
      await queryInterface.createTable(
        "license_areas",
        {
          license_id: {
            type: Sequelize.UUID,
            allowNull: false,
            primaryKey: true,
            references: { model: "company_licenses", key: "license_id" },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
          },
          area_id: {
            type: Sequelize.UUID,
            allowNull: false,
            primaryKey: true,
            references: { model: "admin_areas", key: "area_id" },
            onUpdate: "CASCADE",
            onDelete: "RESTRICT",
          },
          created_at: { type: Sequelize.DATE, allowNull: false },
        },
        { transaction },
      );
      await queryInterface.addIndex("license_areas", ["area_id"], { transaction });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable("license_areas");
    await queryInterface.dropTable("license_minerals");
    await queryInterface.dropTable("company_licenses");
    await queryInterface.dropTable("companies");
    await queryInterface.dropTable("minerals");
  },
};
