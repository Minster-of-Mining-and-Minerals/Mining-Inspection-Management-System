"use strict";
/**
 * The MoM Mining Field Monitoring Checklist as a ready form: version 1, published,
 * assigned to all licenses. Safe to re-run: if a form with code MOM-FMC exists it is
 * left as it is (changes are made in the app as new versions).
 */
const { v4: uuidv4 } = require("uuid");
const mom = require("../data/forms/mom-field-monitoring-checklist");
const { validateDefinition } = require("../utils/formDefinition");

module.exports = {
  async up(queryInterface, Sequelize) {
    const existing = await queryInterface.sequelize.query(`SELECT form_id FROM forms WHERE code = :code`, {
      replacements: { code: mom.code },
      type: Sequelize.QueryTypes.SELECT,
    });
    if (existing.length) {
      console.log(`Form ${mom.code} already exists; left unchanged.`);
      return;
    }

    const { value, errors } = validateDefinition(mom.definition, { forPublish: true });
    if (errors.length) throw new Error(`The MoM checklist definition is invalid:\n${errors.join("\n")}`);

    const now = new Date();
    const formId = uuidv4();
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.bulkInsert(
        "forms",
        [{ form_id: formId, code: mom.code, name: mom.name, name_am: mom.name_am, description: mom.description, is_active: true, created_at: now, updated_at: now }],
        { transaction },
      );
      await queryInterface.sequelize.query(
        `INSERT INTO form_versions (version_id, form_id, version_number, status, definition, change_note, published_at, created_at, updated_at)
         VALUES (:id, :form, 1, 'published', CAST(:definition AS JSONB), :note, :now, :now, :now)`,
        {
          replacements: {
            id: uuidv4(),
            form: formId,
            definition: JSON.stringify(value),
            note: "Transcribed from the Ministry's checklist AM-0-1-0.",
            now,
          },
          transaction,
        },
      );
      await queryInterface.bulkInsert(
        "form_assignments",
        [{ assignment_id: uuidv4(), form_id: formId, target_type: "all", created_at: now }],
        { transaction },
      );
      await transaction.commit();
      console.log(`Form ${mom.code} created (version 1, published, assigned to all licenses).`);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("forms", { code: mom.code });
  },
};
