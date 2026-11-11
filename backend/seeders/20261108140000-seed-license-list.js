"use strict";
/**
 * Imports the Ministry's license inspection list that ships with the project:
 * data/license-list/license-list.xlsx (companies + licenses, minerals, locations, teams),
 * and gives the licenses it adds their surveyed area from data/license-list/license-coordinates.xlsx.
 *
 * Runs with every `npm run seed` and is safe to repeat: licenses already in the
 * database are skipped, so only rows that are new in the sheet are added, and
 * edits made in the app are never overwritten. To apply a newer list to existing
 * licenses (teams, details, locations), use the update:
 *   npm run import:licenses -- --update --dry-run   (then without --dry-run)
 *
 * Must run after the admin-areas and minerals seeders (file names sort it after them).
 * A report of rows to review is written to backend/reports/.
 */
const fs = require("fs");
const path = require("path");

const DATA = path.join(__dirname, "..", "data", "license-list");
const FILE = path.join(DATA, "license-list.xlsx");
const COORDS = path.join(DATA, "license-coordinates.xlsx");

module.exports = {
  async up() {
    if (!fs.existsSync(FILE)) {
      console.log(`License list not found (${FILE}); skipping company import.`);
      return;
    }
    // Loaded here so the other seeders don't depend on exceljs / the models
    const { importLicenseList, summarize } = require("../services/licenseImportService");
    const result = await importLicenseList(FILE);
    console.log(summarize(result));

    if (result.createdLicenseIds?.length && fs.existsSync(COORDS)) {
      const { applyLicenseCoordinates } = require("../services/licenseListUpdateService");
      const { applied } = await applyLicenseCoordinates({ coordsFile: COORDS, licenseIds: result.createdLicenseIds });
      console.log(`  Surveyed areas added:   ${applied} of ${result.createdLicenseIds.length} new license(s)`);
    }
  },

  async down() {
    // Imported companies may have been edited or gained inspections since;
    // remove them in the app instead of undoing the import blindly.
    console.log("The license list import is not undone automatically.");
  },
};
