#!/usr/bin/env node
/**
 * Imports companies and licenses from a license inspection list (.xlsx).
 *
 * Add (only adds what is missing; never changes existing records):
 *   npm run import:licenses                               the list in data/license-list/
 *   npm run import:licenses -- "<file.xlsx>"              another file
 *   npm run import:licenses -- "<file.xlsx>" --dry-run    show what would happen, save nothing
 *   npm run import:licenses -- "<file.xlsx>" --sector=<sector_node_id>   import into another sector
 *                                                          (default: Ministry of Mines)
 *
 * Update (makes the database match the list: details, teams, people, and locations from the
 * coordinate list). CHANGES existing records — always run it with --dry-run first:
 *   npm run import:licenses -- --update --dry-run
 *   npm run import:licenses -- --update
 *   npm run import:licenses -- "<list.xlsx>" --update --coords="<coordinates.xlsx>"
 *   (default coordinate list: data/license-list/license-coordinates.xlsx)
 *
 * `npm run seed` adds from data/license-list/license-list.xlsx automatically.
 * Rules: services/licenseImportService.js (add) and services/licenseListUpdateService.js (update).
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const fs = require("fs");
const db = require("../models");
const { importLicenseList, summarize } = require("../services/licenseImportService");
const { updateFromLicenseList, summarizeUpdate } = require("../services/licenseListUpdateService");

const DATA = path.join(__dirname, "..", "data", "license-list");
const DEFAULT_FILE = path.join(DATA, "license-list.xlsx");
const DEFAULT_COORDS = path.join(DATA, "license-coordinates.xlsx");

async function main() {
  const args = process.argv.slice(2);
  const option = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) || undefined;
  const dryRun = args.includes("--dry-run");
  const update = args.includes("--update");
  const sectorId = option("sector");
  const file = args.find((a) => !a.startsWith("--")) || DEFAULT_FILE;
  if (!fs.existsSync(file)) {
    console.error(`File not found: ${file}\nUsage: npm run import:licenses -- "<file.xlsx>" [--dry-run] [--update [--coords=<file.xlsx>]]`);
    process.exit(1);
  }

  if (update) {
    const coordsFile = option("coords") || (fs.existsSync(DEFAULT_COORDS) ? DEFAULT_COORDS : null);
    if (coordsFile && !fs.existsSync(coordsFile)) {
      console.error(`Coordinate list not found: ${coordsFile}`);
      process.exit(1);
    }
    console.log(`Updating from ${file}${coordsFile ? `\n  locations from ${coordsFile}` : "\n  (no coordinate list: locations from the list's names)"}${dryRun ? "\n  DRY RUN" : ""}\n`);
    const result = await updateFromLicenseList({ listFile: file, coordsFile, sectorId, dryRun });
    console.log(summarizeUpdate(result, { dryRun }));
    return;
  }

  console.log(`Importing ${file}${dryRun ? " (dry run)" : ""}\n`);
  const result = await importLicenseList(file, { dryRun, sectorId });
  console.log(summarize(result, { dryRun }));
}

main()
  .then(() => db.sequelize.close())
  .catch(async (error) => {
    console.error("\nImport failed — nothing was saved.\n", error.message);
    await db.sequelize.close().catch(() => {});
    process.exit(1);
  });
