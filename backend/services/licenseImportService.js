/**
 * Imports companies and licenses from the Ministry's license inspection list (.xlsx).
 * Used by `npm run seed` (seeders/20261108140000-seed-license-list.js) and by
 * `npm run import:licenses` (scripts/import-license-list.js).
 *
 * Expected columns (first sheet, header on row 1):
 *   B የድርጅቱ ስም (company) | C Type of License | D የፈቃድ ቁጥር (license no.) | E የማዕድን ዓይነት (mineral)
 *   F ፈቃድ የተሰጠበት ቀን (issue date) | G ክልል (region) | H ዞን (zone) | I ወረዳ (woreda) | N Comment
 *   J Team (number) | K–M Member 1–3 (inspector names)
 *
 * Rules
 *   - One company per name (case, spacing and punctuation ignored).
 *   - A license number that already exists is left unchanged, so importing
 *     again only adds new rows and never overwrites edits made in the app.
 *   - Locations: only certain matches are linked. If no woreda is certain, the
 *     license is linked to its zone, else its region. Everything uncertain goes
 *     into the report for a person to fix in the app.
 *   - Teams: "Team <n>" is created once and each license is assigned to its team.
 *   - Members are user accounts. A name matches an existing user with exactly that
 *     full name; otherwise a user is created with a generated email
 *     (firstname.lastname@<SEED_USER_EMAIL_DOMAIN>, default gmail.com),
 *     password "password" and the inspector role — but only when .env has
 *     SEED_DEV_PASSWORDS=true (never with NODE_ENV=production). Otherwise no users
 *     are created and the names are listed in the report to create by hand.
 *     A person is put in a team only if they are in no team yet (one team per person).
 *   - Team steps also run for licenses that already exist, so teams can be added
 *     to a list imported before teams existed. Nothing is added twice.
 *   - All or nothing: one transaction; any error saves nothing.
 */
const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");
const bcrypt = require("bcrypt");
const { v4: uuidv4 } = require("uuid");
const { Op } = require("sequelize");
const db = require("../models");
const { AreaMatcher, splitAreaList } = require("./areaMatchingService");
const { parseMineralText } = require("../utils/mineralNames");
const { escapeLike } = require("../utils/search");
const { addUserToTeam } = require("./teamMembershipService");

// Accounts with the known password "password" only when explicitly allowed in .env
// (SEED_DEV_PASSWORDS=true or SEED_USERS=true) and default false on production.
const IS_PRODUCTION =
  process.env.SEED_DEV_PASSWORDS === "true" || process.env.SEED_USERS === "true"
    ? false
    : process.env.NODE_ENV === "production";
// Default domain for generated inspector emails
const SEED_EMAIL_DOMAIN = process.env.SEED_USER_EMAIL_DOMAIN || "gmail.com";
const DEV_PASSWORD = "password";
const TITLES = new Set(["dr", "mr", "mrs", "ms", "eng", "engr", "prof", "ato", "w/ro", "wro", "weizero", "weyzero"]);

/** "Dr. Eyob Bekele" -> "eyob.bekele"; Latin letters only. */
const emailLocalPart = (fullName) => {
  const words = String(fullName)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/\.$/, ""))
    .filter((w) => w && !TITLES.has(w))
    .map((w) => w.replace(/[^a-z]/g, ""))
    .filter(Boolean);
  if (!words.length) return "inspector";
  return words.length === 1 ? words[0] : `${words[0]}.${words[words.length - 1]}`;
};

const COL = { company: 2, type: 3, number: 4, mineral: 5, date: 6, region: 7, zone: 8, woreda: 9, team: 10, members: [11, 12, 13], comment: 14 };
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const MISSING_NUMBER = /^(n\s*[\\/]?\s*a|na|none|-+|)$/i;
const DEFAULT_REPORT_DIR = path.join(__dirname, "..", "reports");

// ---------- cell helpers ----------
const cellText = (row, col) => {
  const cell = row.getCell(col);
  if (cell.value == null) return "";
  if (cell.value instanceof Date) return cell.value;
  return String(cell.text ?? "").replace(/\s+/g, " ").trim();
};

const iso = (y, m, d) => {
  if (!(y > 1900 && y < 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null; // e.g. 31/02
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
};

/**
 * Issue date from the sheet. Returns { date, note }:
 *   Excel date            -> date
 *   "13/06/2022"          -> date (day/month/year, the Ministry's format)
 *   "April 30,2026"       -> date
 *   "on 25/08/2022, reinstatment:18/09/2026" -> first date + the full text as note
 */
const parseIssueDate = (value) => {
  if (value instanceof Date) return { date: iso(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate()), note: null };
  const text = String(value || "").trim();
  if (!text) return { date: null, note: null };

  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
  if (m) {
    const d = iso(+m[3], +m[2], +m[1]);
    return { date: d, note: d ? null : `Issue date as written: ${text}` };
  }

  // "April 30,2026", "Feb 14, 2025", "Sept. 3 2024"
  m = /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s*(\d{4})$/.exec(text);
  const month = m && MONTHS[m[1].slice(0, 3).toLowerCase()];
  if (month) {
    const d = iso(+m[3], month, +m[2]);
    return { date: d, note: d ? null : `Issue date as written: ${text}` };
  }

  // Something longer: take the first d/m/yyyy in it and keep the whole text as a note
  m = /(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(text);
  return { date: m ? iso(+m[3], +m[2], +m[1]) : null, note: `Issue date as written: ${text}`.slice(0, 255) };
};

const licenseTypeOf = (raw) => {
  const t = String(raw || "").toLowerCase();
  if (t.startsWith("explor")) return "exploration";
  if (t.startsWith("min")) return "mining";
  return null;
};

const csvCell = (v) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const writeReport = (report, { dryRun, reportDir }) => {
  fs.mkdirSync(reportDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
  const file = path.join(reportDir, `license-import-${dryRun ? "dry-run-" : ""}${stamp}.csv`);
  const lines = ["Row,Company,License number,Issue,Detail", ...report.map((x) => [x.row, x.company, x.license, x.issue, x.detail].map(csvCell).join(","))];
  fs.writeFileSync(file, "﻿" + lines.join("\r\n"), "utf8"); // BOM so Excel shows Amharic correctly
  return file;
};

/**
 * @param {string} file  path to the .xlsx
 * @param {{ dryRun?: boolean, reportDir?: string|null }} options  reportDir null = no report file
 * @returns {Promise<{ stats: object, report: object[], reportFile: string|null }>}
 */
async function importLicenseList(file, { dryRun = false, reportDir = DEFAULT_REPORT_DIR } = {}) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.worksheets[0];

  const { Company, CompanyLicense, Mineral, AdminArea, AreaAlias, Team, TeamMember, TeamLicense, User, sequelize } = db;
  const [areas, aliases, minerals] = await Promise.all([
    AdminArea.findAll({ attributes: ["area_id", "parent_id", "level", "name", "is_active"], raw: true }),
    AreaAlias.findAll({ attributes: ["area_id", "alias", "level", "scope_parent_id"], raw: true }),
    Mineral.findAll({ where: { is_active: true }, raw: true }),
  ]);
  if (!areas.length) throw new Error("No locations in the database: the admin areas seeder must run first.");
  if (!minerals.length) throw new Error("No minerals in the database: the minerals seeder must run first.");
  const matcher = new AreaMatcher(areas, aliases);

  const report = [];
  const note = (row, company, license, issue, detail) => report.push({ row, company, license, issue, detail });
  const stats = {
    rows: 0,
    companiesCreated: 0,
    companiesExisting: 0,
    licensesCreated: 0,
    licensesExisting: 0,
    licensesSkipped: 0,
    woredaLinks: 0,
    zoneFallback: 0,
    regionFallback: 0,
    noLocation: 0,
    teamsCreated: 0,
    usersCreated: 0,
    membersAdded: 0,
    teamLicenseLinks: 0,
  };
  const createdUsers = [];

  const t = await sequelize.transaction();

  // ----- people: an existing user with this exact name, else a new inspector account -----
  const userCache = new Map();
  const inspectorRole = await db.Role.findOne({ where: { name: "inspector", is_active: true }, transaction: t });
  const internalType = await db.UserType.findOne({ where: { name: "internal" }, transaction: t });
  const devPasswordHash = IS_PRODUCTION ? null : await bcrypt.hash(DEV_PASSWORD, 10);

  const userFor = async (name, r, companyName) => {
    const key = name.toLowerCase();
    if (userCache.has(key)) return userCache.get(key);

    const matches = await User.findAll({
      where: { full_name: { [Op.iLike]: escapeLike(name) } },
      attributes: ["user_id", "full_name", "email", "is_active"],
      transaction: t,
    });
    let user = null;
    if (matches.length === 1) {
      user = matches[0];
      if (!user.is_active) {
        note(r, companyName, "", "Person's account is inactive", `${name} (${user.email}) was not added to a team.`);
        user = null;
      }
    } else if (matches.length > 1) {
      note(r, companyName, "", "Several users with this name", `${name}: add the right one to the team by hand.`);
    } else if (IS_PRODUCTION) {
      note(r, companyName, "", "User to create", `${name}: create their account on the Users page and choose their team.`);
    } else {
      if (!inspectorRole || !internalType) throw new Error("The inspector role or internal user type is missing: run the seeders.");
      // firstname.lastname@domain, numbered if taken
      const local = emailLocalPart(name);
      let email = `${local}@${SEED_EMAIL_DOMAIN}`;
      for (let i = 2; await User.findOne({ where: { email }, attributes: ["user_id"], transaction: t }); i++) {
        email = `${local}${i}@${SEED_EMAIL_DOMAIN}`;
      }
      const now = new Date();
      user = await User.create(
        {
          user_id: uuidv4(),
          full_name: name,
          email,
          password: devPasswordHash,
          user_type_id: internalType.user_type_id,
          is_first_logged_in: true,
          is_active: true,
          created_at: now,
          updated_at: now,
        },
        { transaction: t },
      );
      stats.usersCreated++;
      createdUsers.push({ name, email });
      if (inspectorRole) {
        await db.UserRoles.create(
          {
            user_role_id: uuidv4(),
            user_id: user.user_id,
            role_id: inspectorRole.role_id,
            is_active: true,
            assigned_at: now,
            created_at: now,
            updated_at: now,
          },
          { transaction: t },
        );
      }
      note(r, companyName, "", "User created", `${name}: ${email} (password "${DEV_PASSWORD}"; replace the email before go-live)`);
    }
    userCache.set(key, user);
    return user;
  };

  // ----- teams: "Team <n>", its members and the licenses it covers -----
  const teamCache = new Map();
  const assignTeam = async (row, r, companyName, license) => {
    const code = String(cellText(row, COL.team) || "").replace(/^team\s*/i, "").trim();
    if (!code) return;
    let team = teamCache.get(code);
    if (!team) {
      team = await Team.findOne({ where: { code }, transaction: t });
      if (!team) {
        team = await Team.create({ name: `Team ${code}`, code }, { transaction: t });
        stats.teamsCreated++;
      }
      teamCache.set(code, team);
    }

    for (const col of COL.members) {
      const name = String(cellText(row, col) || "").replace(/\s+/g, " ").trim();
      if (!name) continue;
      const user = await userFor(name, r, companyName);
      if (!user) continue;

      const current = await TeamMember.findOne({
        where: { user_id: user.user_id, left_on: null },
        include: [{ model: Team, as: "team", attributes: ["team_id", "name"] }],
        transaction: t,
      });
      if (current) {
        if (current.team_id !== team.team_id) {
          note(r, companyName, "", "Person already in another team", `${name} is in ${current.team?.name}; the list puts them in ${team.name}. Left in ${current.team?.name}.`);
        }
        continue;
      }
      await addUserToTeam({ teamId: team.team_id, userId: user.user_id, role: "member", transaction: t });
      stats.membersAdded++;
    }

    if (license) {
      const [, created] = await TeamLicense.findOrCreate({
        where: { team_id: team.team_id, license_id: license.license_id },
        defaults: { team_id: team.team_id, license_id: license.license_id },
        transaction: t,
      });
      if (created) stats.teamLicenseLinks++;
    }
  };

  try {
    const companyCache = new Map();

    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const companyName = cellText(row, COL.company);
      if (!companyName) continue;
      stats.rows++;

      // ----- company -----
      const key = Company.normalizeName(companyName);
      let company = companyCache.get(key);
      if (!company) {
        company = await Company.findOne({ where: { name_normalized: key }, transaction: t });
        if (company) stats.companiesExisting++;
        else {
          company = await Company.create({ name: companyName }, { transaction: t });
          stats.companiesCreated++;
        }
        companyCache.set(key, company);
      }

      // ----- license -----
      const rawNumber = String(cellText(row, COL.number) || "");
      if (MISSING_NUMBER.test(rawNumber.trim())) {
        stats.licensesSkipped++;
        note(r, companyName, rawNumber, "No license number", "Company created; add the license by hand in the app.");
        await assignTeam(row, r, companyName, null);
        continue;
      }
      const number = rawNumber.trim().replace(/\//g, "\\").toUpperCase();
      const existing = await CompanyLicense.findOne({ where: { license_number: number }, transaction: t });
      if (existing) {
        stats.licensesExisting++;
        if (existing.company_id !== company.company_id) {
          note(r, companyName, number, "License belongs to another company", "Already in the system under a different company; left unchanged.");
        }
        await assignTeam(row, r, companyName, existing);
        continue;
      }

      const type = licenseTypeOf(cellText(row, COL.type));
      if (!type) {
        stats.licensesSkipped++;
        note(r, companyName, number, "Unknown license type", `"${cellText(row, COL.type)}" is not Exploration or Mining; license not created.`);
        continue;
      }

      const dateCell = row.getCell(COL.date).value;
      const { date, note: dateNote } = parseIssueDate(dateCell instanceof Date ? dateCell : cellText(row, COL.date));
      if (!date && cellText(row, COL.date)) note(r, companyName, number, "Issue date not read", `"${cellText(row, COL.date)}" kept as a date note.`);
      else if (dateNote) note(r, companyName, number, "Issue date partly read", dateNote);

      const mineralText = String(cellText(row, COL.mineral) || "");
      const { matched: licenseMinerals, unknown } = parseMineralText(mineralText, minerals);
      if (unknown.length) note(r, companyName, number, "Mineral not recognised", `${unknown.join(", ")} (from "${mineralText}")`);

      const comment = String(cellText(row, COL.comment) || "");
      const license = await CompanyLicense.create(
        {
          company_id: company.company_id,
          license_number: number,
          license_type: type,
          mineral_text: mineralText || null,
          issued_on: date,
          date_note: dateNote,
          notes: comment || null,
          status: "active",
        },
        { transaction: t },
      );
      stats.licensesCreated++;
      if (licenseMinerals.length) await license.setMinerals(licenseMinerals.map((m) => m.mineral_id), { transaction: t });

      // ----- locations: certain matches only -----
      const loc = { region: cellText(row, COL.region), zone: cellText(row, COL.zone), woreda: cellText(row, COL.woreda) };
      const m = matcher.matchRow(loc);
      const woredaIds = [...new Set(m.woredas.filter((x) => x.status === "matched").map((x) => x.area.area_id))];
      const zoneIds = [...new Set(m.zones.filter((x) => x.status === "matched").map((x) => x.area.area_id))];
      let linkIds = woredaIds;
      if (!linkIds.length && zoneIds.length) {
        linkIds = zoneIds;
        stats.zoneFallback++;
      } else if (!linkIds.length && m.region.status === "matched") {
        linkIds = [m.region.area.area_id];
        stats.regionFallback++;
      }
      if (linkIds.length) await license.setAreas(linkIds, { transaction: t });
      else stats.noLocation++;
      stats.woredaLinks += woredaIds.length;

      await assignTeam(row, r, companyName, license);

      const describe = (x) =>
        x.suggestions.length ? `"${x.input}" → maybe ${x.suggestions.map((s) => s.path).join(" / ")}` : `"${x.input}" → not found`;
      const unsure = [m.region, ...m.zones, ...m.woredas].filter((x) => x.status !== "matched" && x.status !== "empty");
      const linkedText = linkIds.length ? linkIds.map((id) => matcher.pathOf(matcher.get(id))).join("; ") : "";
      if (unsure.length) {
        note(r, companyName, number, "Location to confirm", `${unsure.map(describe).join(" | ")} — ${linkedText ? `linked to ${linkedText}` : "no location linked"}`);
      } else if (!splitAreaList(loc.woreda).length) {
        note(r, companyName, number, "No woreda in the list", `Linked to ${linkedText || "nothing"}.`);
      }
    }

    if (dryRun) await t.rollback();
    else await t.commit();
  } catch (error) {
    if (!t.finished) await t.rollback();
    throw error;
  }

  // A report only when there is something new to look at (re-seeding adds nothing)
  const addedSomething = dryRun || stats.licensesCreated > 0 || stats.companiesCreated > 0 || stats.teamsCreated > 0 || stats.membersAdded > 0 || stats.usersCreated > 0;
  const reportFile = reportDir && report.length && addedSomething ? writeReport(report, { dryRun, reportDir }) : null;
  return { stats, report, reportFile, createdUsers };
}

/** Console summary shared by the script and the seeder. */
const summarize = ({ stats, report, reportFile }, { dryRun = false } = {}) => {
  const byIssue = report.reduce((acc, x) => ((acc[x.issue] = (acc[x.issue] || 0) + 1), acc), {});
  return [
    dryRun ? "DRY RUN — nothing was saved." : "License list imported.",
    `  Rows read:              ${stats.rows}`,
    `  Companies created:      ${stats.companiesCreated}  (already there: ${stats.companiesExisting})`,
    `  Licenses created:       ${stats.licensesCreated}  (already there: ${stats.licensesExisting}, skipped: ${stats.licensesSkipped})`,
    `  Woreda links:           ${stats.woredaLinks}`,
    `  Linked to zone only:    ${stats.zoneFallback}`,
    `  Linked to region only:  ${stats.regionFallback}`,
    `  No location linked:     ${stats.noLocation}`,
    `  Teams created:          ${stats.teamsCreated}`,
    `  Users created:          ${stats.usersCreated}${stats.usersCreated ? `  (password "${DEV_PASSWORD}", emails @${SEED_EMAIL_DOMAIN})` : ""}`,
    `  Team members added:     ${stats.membersAdded}`,
    `  Licenses given a team:  ${stats.teamLicenseLinks}`,
    `  To review: ${report.length}${report.length ? " " + JSON.stringify(byIssue) : ""}`,
    ...(reportFile ? [`  Report: ${reportFile}`] : []),
  ].join("\n");
};

module.exports = { importLicenseList, summarize, parseIssueDate };
