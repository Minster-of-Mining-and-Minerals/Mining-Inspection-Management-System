"use strict";
/**
 * The MoM checklist (MOM-FMC) no longer has required questions: the inspector is shown what is
 * not filled in before submitting, and may submit anyway. The seeder leaves a checklist that is
 * already in the database unchanged, so this removes `required` from the questions of its
 * versions there (drafts and published ones). Nothing else in the definitions changes.
 *
 * down: not undone (which questions were required is in data/forms/mom-field-monitoring-checklist.js
 * history); mark questions required again in the form editor.
 */
module.exports = {
  async up(queryInterface) {
    const q = (sql, replacements = {}) => queryInterface.sequelize.query(sql, { replacements, type: queryInterface.sequelize.QueryTypes.SELECT });
    const versions = await q(
      `SELECT v.version_id, v.definition FROM form_versions v JOIN forms f ON f.form_id = v.form_id WHERE f.code = 'MOM-FMC'`,
    );
    let changed = 0;
    for (const v of versions) {
      const def = typeof v.definition === "string" ? JSON.parse(v.definition) : v.definition;
      let touched = false;
      for (const section of def?.sections ?? [])
        for (const field of section.fields ?? [])
          if (field.required) {
            delete field.required;
            touched = true;
          }
      if (!touched) continue;
      await queryInterface.sequelize.query(`UPDATE form_versions SET definition = CAST(:def AS JSONB), updated_at = NOW() WHERE version_id = :id`, {
        replacements: { def: JSON.stringify(def), id: v.version_id },
      });
      changed++;
    }
    if (changed) console.log(`MoM checklist: questions made optional in ${changed} version(s).`);
  },

  async down() {},
};
