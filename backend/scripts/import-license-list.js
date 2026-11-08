#!/usr/bin/env node
/**
 * Imports companies and licenses from a license inspection list (.xlsx).
 *
 *   npm run import:licenses                               the list in data/license-list/
 *   npm run import:licenses -- "<file.xlsx>"              another file
 *   npm run import:licenses -- "<file.xlsx>" --dry-run    show what would happen, save nothing
 *
 * `npm run seed` imports data/license-list/license-list.xlsx automatically.
 * Rules and expected columns: services/licenseImportService.js
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const fs = require("fs");
const db = require("../models");
const { importLicenseList, summarize } = require("../services/licenseImportService");

const DEFAULT_FILE = path.join(__dirname, "..", "data", "license-list", "license-list.xlsx");

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const file = args.find((a) => !a.startsWith("--")) || DEFAULT_FILE;
  if (!fs.existsSync(file)) {
    console.error(`File not found: ${file}\nUsage: npm run import:licenses -- "<file.xlsx>" [--dry-run]`);
    process.exit(1);
  }
  console.log(`Importing ${file}${dryRun ? " (dry run)" : ""}\n`);
  const result = await importLicenseList(file, { dryRun });
  console.log(summarize(result, { dryRun }));
}

main()
  .then(() => db.sequelize.close())
  .catch(async (error) => {
    console.error("\nImport failed — nothing was saved.\n", error.message);
    await db.sequelize.close().catch(() => {});
    process.exit(1);
  });
