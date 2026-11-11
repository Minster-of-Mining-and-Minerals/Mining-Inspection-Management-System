"use strict";
/**
 * MoM checklist (MOM-FMC) revision from the Ministry (data/forms/mom-field-monitoring-checklist.js):
 *   - section 2: "Has production started?" removed;
 *   - section 3: yes / no questions, text areas, attachments for question 12;
 *   - sections 4–10: text areas; 10.9 any file; 6.2 removed; some questions for mining licenses only;
 *   - section 4.1 for both license types, filled in at the office (also after submitting);
 *   - spelling corrections. The checklist gives no score any more.
 *
 * The seeder leaves a checklist already in the database unchanged, so this applies the file's
 * definition there:
 *   - no inspection uses the current version yet: that version is replaced;
 *   - otherwise a new version is published (those inspections keep the version they started with,
 *     as when a version is published in the app) and the old one is retired.
 * A draft being edited in the app is left as it is. Nothing happens if the current version already
 * matches the file. Changes made to the current version in the app are replaced by the file.
 *
 * down: not undone (publish an earlier version's content as a new version in the app).
 */
const { v4: uuidv4 } = require("uuid");

// Same definition (key order aside)?
const canonical = (v) => (Array.isArray(v) ? v.map(canonical) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])])) : v);
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

module.exports = {
  async up(queryInterface) {
    const seq = queryInterface.sequelize;
    const { validateDefinition } = require("../utils/formDefinition");
    const mom = require("../data/forms/mom-field-monitoring-checklist");
    const { value: def, errors } = validateDefinition(mom.definition, { forPublish: true });
    if (errors.length) throw new Error(`The MoM checklist definition is invalid:\n${errors.join("\n")}`);

    const forms = await seq.query(`SELECT form_id FROM forms WHERE code = 'MOM-FMC'`, { type: seq.QueryTypes.SELECT });
    for (const { form_id } of forms) {
      const [current] = await seq.query(`SELECT version_id, version_number, definition FROM form_versions WHERE form_id = :form_id AND status = 'published' LIMIT 1`, {
        replacements: { form_id },
        type: seq.QueryTypes.SELECT,
      });
      if (!current) continue;
      const old = typeof current.definition === "string" ? JSON.parse(current.definition) : current.definition;
      if (same(old, def)) continue;

      const [{ n }] = await seq.query(`SELECT COUNT(*)::int AS n FROM inspections WHERE form_version_id = :id`, { replacements: { id: current.version_id }, type: seq.QueryTypes.SELECT });
      const transaction = await seq.transaction();
      try {
        if (!n) {
          await seq.query(`UPDATE form_versions SET definition = CAST(:def AS JSONB), updated_at = NOW() WHERE version_id = :id`, {
            replacements: { def: JSON.stringify(def), id: current.version_id },
            transaction,
          });
          console.log(`MoM checklist: revised (version ${current.version_number}).`);
        } else {
          const [{ max }] = await seq.query(`SELECT MAX(version_number)::int AS max FROM form_versions WHERE form_id = :form_id`, { replacements: { form_id }, type: seq.QueryTypes.SELECT, transaction });
          await seq.query(`UPDATE form_versions SET status = 'retired', updated_at = NOW() WHERE version_id = :id`, { replacements: { id: current.version_id }, transaction });
          await seq.query(
            `INSERT INTO form_versions (version_id, form_id, version_number, status, definition, change_note, published_at, created_at, updated_at)
             VALUES (:id, :form_id, :num, 'published', CAST(:def AS JSONB), :note, NOW(), NOW(), NOW())`,
            {
              replacements: {
                id: uuidv4(),
                form_id,
                num: max + 1,
                def: JSON.stringify(def),
                note: "Revision: yes/no and text-area questions, questions per license type, 4.1 filled in at the office, spelling corrections.",
              },
              transaction,
            },
          );
          console.log(`MoM checklist: version ${max + 1} published with the revision (${n} inspection(s) keep version ${current.version_number}).`);
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
