#!/usr/bin/env node
/**
 * Updates the email and phone number of team members from a contact sheet (e.g. the Google Form
 * "Inspection Team" responses: Timestamp | Full Name | Email | Phone Number).
 *
 *   npm run import:team-contacts -- --dry-run                   the sheet in data/license-list/; nothing saved
 *   npm run import:team-contacts                                apply it
 *   npm run import:team-contacts -- "<file.xlsx>" [--dry-run]   another sheet
 *   … --sector=<sector_node_id>                                  another sector (default Ministry of Mines)
 *
 * Rules: services/teamContactsService.js. A report is written to backend/reports/.
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const fs = require("fs");
const db = require("../models");
const { applyTeamContacts, summarizeContacts } = require("../services/teamContactsService");
const { MOM_SECTOR_ID } = require("../utils/sectorConstants");

const DEFAULT_FILE = path.join(__dirname, "..", "data", "license-list", "team-contacts.xlsx");

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const sectorId = args.find((a) => a.startsWith("--sector="))?.slice(9) || MOM_SECTOR_ID;
  const file = args.find((a) => !a.startsWith("--")) || DEFAULT_FILE;
  if (!fs.existsSync(file)) {
    console.error(`File not found: ${file}\nUsage: npm run import:team-contacts -- ["<file.xlsx>"] [--dry-run] [--sector=<id>]`);
    process.exit(1);
  }
  const result = await applyTeamContacts({ file, sectorId, dryRun });
  console.log(summarizeContacts(result, { dryRun }));
}

main()
  .then(() => db.sequelize.close())
  .catch(async (error) => {
    console.error("\nUpdate failed — nothing was saved.\n", error.message);
    await db.sequelize.close().catch(() => {});
    process.exit(1);
  });
