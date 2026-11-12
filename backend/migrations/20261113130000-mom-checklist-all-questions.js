"use strict";
/**
 * MoM checklist (MOM-FMC): every question is shown for exploration and mining licenses (the inspector
 * leaves out what does not apply). Applies data/forms/mom-field-monitoring-checklist.js to the database
 * the same way as the revision before it:
 *   - no inspection uses the current version yet: that version is replaced;
 *   - otherwise a new version is published (inspections already started keep theirs).
 * Nothing happens if the current version already matches the file.
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
          console.log(`MoM checklist: all questions for both license types (version ${current.version_number}).`);
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
                note: "All questions shown for exploration and mining licenses.",
              },
              transaction,
            },
          );
          console.log(`MoM checklist: version ${max + 1} published with all questions for both license types (${n} inspection(s) keep version ${current.version_number}).`);
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
