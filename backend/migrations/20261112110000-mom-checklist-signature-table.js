"use strict";
/**
 * MoM checklist (MOM-FMC), section 16 "Verification signatures": the two signature questions become
 * one table, Role type | Full name | Signature | Date, with a row per team member, the company lead
 * and the people interviewed (data/forms/mom-field-monitoring-checklist.js).
 *
 * The seeder leaves a checklist already in the database unchanged, so this applies it there:
 *   - no inspection uses the current version yet: section 16 of that version is replaced;
 *   - otherwise a new version is published with it (those inspections keep the version they
 *     started with, as when a version is published in the app) and the old one is retired.
 * A draft being edited in the app is left as it is. Nothing happens if section 16 is already a table.
 *
 * down: not undone (publish an earlier version's content as a new version in the app).
 */
const { v4: uuidv4 } = require("uuid");

module.exports = {
  async up(queryInterface) {
    const seq = queryInterface.sequelize;
    const { validateDefinition } = require("../utils/formDefinition");
    const mom = require("../data/forms/mom-field-monitoring-checklist");
    const { value: target } = validateDefinition(mom.definition, { forPublish: true });
    const newSection = target.sections.find((s) => s.key === "signatures");

    const forms = await seq.query(`SELECT form_id FROM forms WHERE code = 'MOM-FMC'`, { type: seq.QueryTypes.SELECT });
    for (const { form_id } of forms) {
      const [current] = await seq.query(`SELECT version_id, version_number, definition FROM form_versions WHERE form_id = :form_id AND status = 'published' LIMIT 1`, {
        replacements: { form_id },
        type: seq.QueryTypes.SELECT,
      });
      if (!current) continue;
      const def = typeof current.definition === "string" ? JSON.parse(current.definition) : current.definition;
      const i = (def.sections || []).findIndex((s) => s.key === "signatures");
      if (i < 0 || def.sections[i].fields?.some((f) => f.type === "table")) continue;
      def.sections[i] = { ...def.sections[i], description: newSection.description, description_am: newSection.description_am, fields: newSection.fields };

      const [{ n }] = await seq.query(`SELECT COUNT(*)::int AS n FROM inspections WHERE form_version_id = :id`, { replacements: { id: current.version_id }, type: seq.QueryTypes.SELECT });
      const transaction = await seq.transaction();
      try {
        if (!n) {
          await seq.query(`UPDATE form_versions SET definition = CAST(:def AS JSONB), updated_at = NOW() WHERE version_id = :id`, {
            replacements: { def: JSON.stringify(def), id: current.version_id },
            transaction,
          });
          console.log(`MoM checklist: section 16 is now a signature table (version ${current.version_number}).`);
        } else {
          const [{ max }] = await seq.query(`SELECT MAX(version_number)::int AS max FROM form_versions WHERE form_id = :form_id`, { replacements: { form_id }, type: seq.QueryTypes.SELECT, transaction });
          await seq.query(`UPDATE form_versions SET status = 'retired', updated_at = NOW() WHERE version_id = :id`, { replacements: { id: current.version_id }, transaction });
          await seq.query(
            `INSERT INTO form_versions (version_id, form_id, version_number, status, definition, change_note, published_at, created_at, updated_at)
             VALUES (:id, :form_id, :num, 'published', CAST(:def AS JSONB), :note, NOW(), NOW(), NOW())`,
            {
              replacements: { id: uuidv4(), form_id, num: max + 1, def: JSON.stringify(def), note: "Section 16: one signature table (team members, company lead, people interviewed) with name, signature and date." },
              transaction,
            },
          );
          console.log(`MoM checklist: version ${max + 1} published with the signature table (${n} inspection(s) keep version ${current.version_number}).`);
        }
        await transaction.commit();
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    }
  },

  async down() {},
};
