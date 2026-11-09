/**
 * How many submitted inspections were answered with a form version.
 * Inspections arrive in Step 4; until their table exists this returns 0, and it
 * starts counting by itself once the table is there.
 */
const { sequelize } = require("../models");

const countInspectionsForVersion = async (versionId, transaction) => {
  const [[exists]] = await sequelize.query(`SELECT to_regclass('public.inspections') IS NOT NULL AS ok`, { transaction });
  if (!exists?.ok) return 0;
  const [[row]] = await sequelize.query(
    `SELECT COUNT(*)::int AS n FROM inspections WHERE form_version_id = :versionId AND status = 'submitted'`,
    { replacements: { versionId }, transaction },
  );
  return row?.n ?? 0;
};

module.exports = { countInspectionsForVersion };
