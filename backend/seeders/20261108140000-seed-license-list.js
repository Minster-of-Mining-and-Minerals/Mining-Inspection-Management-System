"use strict";
/**
 * Imports the Ministry's license inspection list that ships with the project:
 * data/license-list/license-list.xlsx (companies + licenses, minerals, locations, teams),
 * gives every license without one its surveyed area from data/license-list/license-coordinates.xlsx
 * (also licenses imported before areas existed; an existing area is never changed),
 * and creates the inspectors' accounts with their real email and phone from
 * data/license-list/team-contacts.xlsx — on a server too (temporary password "password", to
 * change at the first login). People not in that sheet get a generated email
 * (firstname.lastname@gmail.com), on a server too; the report lists them.
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
const CONTACTS = path.join(DATA, "team-contacts.xlsx");

module.exports = {
  async up() {
    if (!fs.existsSync(FILE)) {
      console.log(`License list not found (${FILE}); skipping company import.`);
      return;
    }
    // Loaded here so the other seeders don't depend on exceljs / the models
    const { importLicenseList, summarize } = require("../services/licenseImportService");
    const { loadContactBook } = require("../services/teamContactsService");
    // People named in the list get an account with their real email and phone (on a server too)
    const contactFor = await loadContactBook(fs.existsSync(CONTACTS) ? CONTACTS : null);
    const result = await importLicenseList(FILE, { contactFor });
    console.log(summarize(result));

    // Surveyed areas (what the maps draw) for every Ministry of Mines license that has none yet:
    // the new ones, and licenses imported before areas existed. An existing area is never changed.
    if (fs.existsSync(COORDS)) {
      const db = require("../models");
      const { MOM_SECTOR_ID } = require("../utils/sectorConstants");
      const { applyLicenseCoordinates } = require("../services/licenseListUpdateService");
      const missing = await db.CompanyLicense.findAll({ where: { boundary: null, sector_node_id: MOM_SECTOR_ID }, attributes: ["license_id"] });
      if (missing.length) {
        const { applied } = await applyLicenseCoordinates({ coordsFile: COORDS, licenseIds: missing.map((l) => l.license_id) });
        console.log(`  Surveyed areas added:   ${applied} of ${missing.length} license(s) without one`);
      }
    }

    // The inspector accounts just created get their real email and phone (never existing accounts)
    const newUserIds = (result.createdUsers ?? []).map((u) => u.user_id).filter(Boolean);
    if (newUserIds.length && fs.existsSync(CONTACTS)) {
      const { applyTeamContacts } = require("../services/teamContactsService");
      const { stats } = await applyTeamContacts({ file: CONTACTS, onlyUserIds: newUserIds });
      if (stats.emails || stats.phones) console.log(`  Contacts filled in:     ${stats.emails} email(s), ${stats.phones} phone(s) of ${newUserIds.length} new inspector account(s)`);
    }
  },

  async down() {
    // Imported companies may have been edited or gained inspections since;
    // remove them in the app instead of undoing the import blindly.
    console.log("The license list import is not undone automatically.");
  },
};
