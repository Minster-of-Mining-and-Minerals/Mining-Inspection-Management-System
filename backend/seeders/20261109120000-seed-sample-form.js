"use strict";
/**
 * A short sample form (data/forms/sample-site-check.js): 2 sections, 10 questions,
 * version 1 published and applying to all licenses, so it can be scheduled at once.
 * Safe to re-run: if a form with code SAMPLE-SITE exists it is left as it is.
 */
const { v4: uuidv4 } = require("uuid");
const sample = require("../data/forms/sample-site-check");
const { validateDefinition } = require("../utils/formDefinition");
// Belongs to Ministry of Mines
const { MOM_SECTOR_ID } = require("../utils/sectorConstants");

module.exports = {
  async up(queryInterface, Sequelize) {
    const existing = await queryInterface.sequelize.query(`SELECT form_id FROM forms WHERE code = :code AND sector_node_id = :sector`, {
      replacements: { code: sample.code, sector: MOM_SECTOR_ID },
      type: Sequelize.QueryTypes.SELECT,
    });
    if (existing.length) {
      console.log(`Form ${sample.code} already exists; left unchanged.`);
      return;
    }

    const { value, errors } = validateDefinition(sample.definition, { forPublish: true });
    if (errors.length) throw new Error(`The sample form definition is invalid:\n${errors.join("\n")}`);

    const now = new Date();
    const formId = uuidv4();
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.bulkInsert(
        "forms",
        [{ form_id: formId, sector_node_id: MOM_SECTOR_ID, code: sample.code, name: sample.name, name_am: sample.name_am, description: sample.description, is_active: true, created_at: now, updated_at: now }],
        { transaction },
      );
      await queryInterface.sequelize.query(
        `INSERT INTO form_versions (version_id, form_id, version_number, status, definition, change_note, published_at, created_at, updated_at)
         VALUES (:id, :form, 1, 'published', CAST(:definition AS JSONB), :note, :now, :now, :now)`,
        { replacements: { id: uuidv4(), form: formId, definition: JSON.stringify(value), note: "Sample form for testing.", now }, transaction },
      );
      await queryInterface.bulkInsert("form_assignments", [{ assignment_id: uuidv4(), form_id: formId, target_type: "all", created_at: now }], { transaction });
      await transaction.commit();
      console.log(`Form ${sample.code} created (2 sections, 10 questions; version 1 published; applies to all licenses).`);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  /** Removes the sample form only while no schedule or inspection uses it. */
  async down(queryInterface, Sequelize) {
    const [row] = await queryInterface.sequelize.query(
      `SELECT f.form_id,
              (SELECT COUNT(*)::int FROM inspection_schedules s WHERE s.form_id = f.form_id) +
              (SELECT COUNT(*)::int FROM inspections i WHERE i.form_id = f.form_id) AS used
         FROM forms f WHERE f.code = :code`,
      { replacements: { code: sample.code }, type: Sequelize.QueryTypes.SELECT },
    );
    if (!row) return;
    if (row.used > 0) {
      console.log(`Form ${sample.code} is used by schedules or inspections; left in place (delete those first).`);
      return;
    }
    await queryInterface.bulkDelete("forms", { form_id: row.form_id });
  },
};
