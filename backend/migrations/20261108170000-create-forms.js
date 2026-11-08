"use strict";

/**
 * Inspection forms (checklists).
 *
 *  forms              one per checklist, e.g. "MoM Mining Field Monitoring Checklist"
 *  form_versions      the questions, as a JSON definition. draft → published → retired.
 *                     A published version never changes, so an inspection always shows
 *                     exactly the questions it was answered with. At most one draft per form.
 *  form_assignments   which licenses use a form: all licenses, a license type,
 *                     a company's licenses, or one license.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    const ts = {
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    };
    try {
      await queryInterface.createTable(
        "forms",
        {
          form_id: { type: Sequelize.UUID, primaryKey: true, allowNull: false, defaultValue: Sequelize.UUIDV4 },
          // Short stable reference, e.g. "MOM-FMC" (shown on printed reports)
          code: { type: Sequelize.STRING(40), allowNull: true, unique: true },
          name: { type: Sequelize.STRING(200), allowNull: false },
          name_am: { type: Sequelize.STRING(300), allowNull: true },
          description: { type: Sequelize.TEXT, allowNull: true },
          is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
          created_by: { type: Sequelize.UUID, allowNull: true },
          ...ts,
        },
        { transaction },
      );

      await queryInterface.createTable(
        "form_versions",
        {
          version_id: { type: Sequelize.UUID, primaryKey: true, allowNull: false, defaultValue: Sequelize.UUIDV4 },
          form_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: "forms", key: "form_id" },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
          },
          version_number: { type: Sequelize.INTEGER, allowNull: false },
          // draft | published | retired
          status: { type: Sequelize.STRING(10), allowNull: false, defaultValue: "draft" },
          // Sections, questions, status options and conditions (see utils/formDefinition.js)
          definition: { type: Sequelize.JSONB, allowNull: false },
          change_note: { type: Sequelize.TEXT, allowNull: true },
          published_at: { type: Sequelize.DATE, allowNull: true },
          published_by: { type: Sequelize.UUID, allowNull: true },
          created_by: { type: Sequelize.UUID, allowNull: true },
          ...ts,
        },
        { transaction },
      );
      await queryInterface.addIndex("form_versions", ["form_id", "version_number"], { unique: true, name: "form_versions_number_unique", transaction });
      await q(`ALTER TABLE form_versions ADD CONSTRAINT form_versions_status_check CHECK (status IN ('draft', 'published', 'retired'))`);
      // One draft and one current (published) version per form
      await q(`CREATE UNIQUE INDEX form_versions_one_draft ON form_versions (form_id) WHERE status = 'draft'`);
      await q(`CREATE UNIQUE INDEX form_versions_one_published ON form_versions (form_id) WHERE status = 'published'`);

      await queryInterface.createTable(
        "form_assignments",
        {
          assignment_id: { type: Sequelize.UUID, primaryKey: true, allowNull: false, defaultValue: Sequelize.UUIDV4 },
          form_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: "forms", key: "form_id" },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
          },
          // all | license_type | company | license
          target_type: { type: Sequelize.STRING(20), allowNull: false },
          // exploration / mining when target_type = license_type
          license_type: { type: Sequelize.STRING(20), allowNull: true },
          company_id: {
            type: Sequelize.UUID,
            allowNull: true,
            references: { model: "companies", key: "company_id" },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
          },
          license_id: {
            type: Sequelize.UUID,
            allowNull: true,
            references: { model: "company_licenses", key: "license_id" },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
          },
          created_by: { type: Sequelize.UUID, allowNull: true },
          created_at: { type: Sequelize.DATE, allowNull: false },
        },
        { transaction },
      );
      await q(`ALTER TABLE form_assignments ADD CONSTRAINT form_assignments_target_check CHECK (
        (target_type = 'all'          AND license_type IS NULL     AND company_id IS NULL     AND license_id IS NULL) OR
        (target_type = 'license_type' AND license_type IS NOT NULL AND company_id IS NULL     AND license_id IS NULL) OR
        (target_type = 'company'      AND license_type IS NULL     AND company_id IS NOT NULL AND license_id IS NULL) OR
        (target_type = 'license'      AND license_type IS NULL     AND company_id IS NULL     AND license_id IS NOT NULL))`);
      // The same assignment only once
      await q(`CREATE UNIQUE INDEX form_assignments_unique ON form_assignments
        (form_id, target_type, COALESCE(license_type, ''), COALESCE(company_id, '00000000-0000-0000-0000-000000000000'), COALESCE(license_id, '00000000-0000-0000-0000-000000000000'))`);
      await queryInterface.addIndex("form_assignments", ["company_id"], { transaction });
      await queryInterface.addIndex("form_assignments", ["license_id"], { transaction });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable("form_assignments");
    await queryInterface.dropTable("form_versions");
    await queryInterface.dropTable("forms");
  },
};
