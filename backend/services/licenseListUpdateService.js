"use strict";
/**
 * Bring the database in line with a new license list (and the coordinate list).
 *
 *   npm run import:licenses -- --update [--dry-run] ["<list.xlsx>"] [--coords "<coordinates.xlsx>"]
 *
 * Unlike the normal import (which only adds), this CHANGES existing records, so it only runs when
 * asked, and should be run with --dry-run first: the report then lists every change, nothing saved.
 *
 * What comes from where
 *   License list (the Ministry's current word): companies, license type, minerals, issue date,
 *     comment, travel (car / plane, airport), the team of each license and the people in each team.
 *   Coordinate list (surveyed): each license's area and its woreda / zone / region.
 *     A license missing from the coordinate list keeps the location typed in the license list.
 *
 * Rules
 *   - Licenses are matched by number, ignoring spaces, / vs \ and a stray "." or quote at the end.
 *   - A license gets exactly the team the list gives it. No team in the list (e.g. RED ZONE):
 *     the license stays (with its comment) but has no team, so no tasks are made for it.
 *   - Tasks not started yet move with the license to its new team; started and submitted ones stay.
 *   - Teams named in the list have exactly the people the list puts in them: others leave
 *     (kept as history), people listed for another team move. Names spelled slightly differently
 *     match the existing account (services/personMatchService.js).
 *   - Nothing is deleted. Licenses, companies, teams and people not in the list are reported only.
 *   - All or nothing: one transaction.
 */
const path = require("path");
const ExcelJS = require("exceljs");
const bcrypt = require("bcrypt");
const { v4: uuidv4 } = require("uuid");
const { Op } = require("sequelize");
const db = require("../models");
const { AreaMatcher } = require("./areaMatchingService");
const { parseMineralText } = require("../utils/mineralNames");
const { addUserToTeam } = require("./teamMembershipService");
const { readLicenseCoordinates, licenseKey, WoredaIndex } = require("./licenseCoordinatesService");
const { findUserForName } = require("./personMatchService");
const {
  COL,
  MISSING_NUMBER,
  cellText,
  licenseTypeOf,
  travelOf,
  parseIssueDate,
  writeReport,
  emailLocalPart,
  IS_PRODUCTION,
  DEV_PASSWORD,
  SEED_EMAIL_DOMAIN,
} = require("./licenseImportService");
const { MOM_SECTOR_ID } = require("../utils/sectorConstants");

const DEFAULT_REPORT_DIR = path.join(__dirname, "..", "reports");
const today = () => new Date().toISOString().slice(0, 10);
const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

/** The rows of the license list. */
async function readList(file) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.worksheets[0];
  const rows = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const company = cellText(row, COL.company);
    if (!company) continue;
    const dateCell = row.getCell(COL.date).value;
    rows.push({
      r,
      company: String(company),
      number: String(cellText(row, COL.number) || "").trim(),
      type: licenseTypeOf(cellText(row, COL.type)),
      typeText: String(cellText(row, COL.type) || ""),
      mineralText: String(cellText(row, COL.mineral) || ""),
      date: parseIssueDate(dateCell instanceof Date ? dateCell : cellText(row, COL.date)),
      loc: { region: cellText(row, COL.region), zone: cellText(row, COL.zone), woreda: cellText(row, COL.woreda) },
      team: String(cellText(row, COL.team) || "").replace(/^team\s*/i, "").trim(),
      members: COL.members.map((c) => String(cellText(row, c) || "").replace(/\s+/g, " ").trim()).filter(Boolean),
      comment: String(cellText(row, COL.comment) || "") || null,
      travel: travelOf(row),
    });
  }
  return rows;
}

/**
 * @param {{ listFile: string, coordsFile?: string|null, sectorId?: string, dryRun?: boolean, reportDir?: string|null }} options
 * @returns {Promise<{ stats: object, report: object[], reportFile: string|null }>}
 */
async function updateFromLicenseList({ listFile, coordsFile = null, sectorId = MOM_SECTOR_ID, dryRun = false, reportDir = DEFAULT_REPORT_DIR }) {
  const { Company, CompanyLicense, Mineral, AdminArea, AreaAlias, Team, TeamMember, TeamLicense, User, UserRoles, Role, UserType, Inspection, InspectionEvent, sequelize } = db;
  const list = await readList(listFile);
  const coords = coordsFile ? await readLicenseCoordinates(coordsFile) : { licenses: new Map(), problems: [] };

  const report = coords.problems.map((p) => ({ ...p, row: `coordinates row ${p.row}` }));
  const note = (row, company, license, issue, detail) => report.push({ row, company, license, issue, detail });
  const stats = {
    rows: list.length,
    companiesCreated: 0,
    licensesCreated: 0,
    licensesUpdated: 0,
    licensesMovedCompany: 0,
    fromCoordinates: 0,
    fromList: 0,
    locationsChanged: 0,
    teamChanges: 0,
    licensesWithoutTeam: 0,
    tasksMoved: 0,
    peopleAdded: 0,
    peopleMoved: 0,
    peopleRemoved: 0,
    usersCreated: 0,
  };

  const t = await sequelize.transaction();
  try {
    const [areas, aliases, minerals] = await Promise.all([
      AdminArea.findAll({ attributes: ["area_id", "parent_id", "level", "name", "is_active"], raw: true, transaction: t }),
      AreaAlias.findAll({ attributes: ["area_id", "alias", "level", "scope_parent_id"], raw: true, transaction: t }),
      Mineral.findAll({ where: { is_active: true }, raw: true, transaction: t }),
    ]);
    const matcher = new AreaMatcher(areas, aliases);
    const areaById = new Map(areas.map((a) => [a.area_id, a]));
    const pathOf = (ids) => ids.map((id) => matcher.pathOf(areaById.get(id))).join("; ") || "nothing";
    const woredas = coords.licenses.size ? await WoredaIndex.load(db, t) : null;

    const sector = { sector_node_id: sectorId };
    const existing = await CompanyLicense.findAll({ where: sector, include: [{ model: Company, as: "company", attributes: ["company_id", "name"] }], transaction: t });
    const licenseByKey = new Map(existing.map((l) => [licenseKey(l.license_number), l]));
    const seenKeys = new Set();

    /* ---------- helpers ---------- */
    const companyCache = new Map();
    const companyFor = async (name, r, number) => {
      const key = Company.normalizeName(name);
      if (companyCache.has(key)) return companyCache.get(key);
      let company = await Company.findOne({ where: { ...sector, name_normalized: key }, transaction: t });
      if (!company) {
        company = await Company.create({ ...sector, name }, { transaction: t });
        stats.companiesCreated++;
        note(r, name, number, "Company added", "");
      }
      companyCache.set(key, company);
      return company;
    };

    const teamCache = new Map();
    const teamFor = async (code) => {
      if (teamCache.has(code)) return teamCache.get(code);
      let team = await Team.findOne({ where: { ...sector, code }, transaction: t });
      if (!team) {
        team = await Team.create({ ...sector, code, name: `Team ${code}` }, { transaction: t });
        note("", "", "", "Team added", team.name);
      }
      teamCache.set(code, team);
      return team;
    };

    const inspectorRole = await Role.findOne({ where: { name: "inspector", sector_node_id: null, is_active: true }, transaction: t });
    const internalType = await UserType.findOne({ where: { name: "internal" }, transaction: t });
    const devPasswordHash = IS_PRODUCTION ? null : await bcrypt.hash(DEV_PASSWORD, 10);
    const personCache = new Map();
    const personFor = async (name, r) => {
      const k = name.toLowerCase();
      if (personCache.has(k)) return personCache.get(k);
      const found = await findUserForName(name, sectorId, t);
      let user = found.user;
      if (user && found.how === "spelling") note(r, "", "", "Name spelled differently", `"${name}" taken to be ${user.full_name} (${user.email}).`);
      if (!user && found.candidates.length > 1) note(r, "", "", "Several users with this name", `${name}: ${found.candidates.map((u) => u.full_name).join(", ")}. Put the right one in the team by hand.`);
      else if (!user && IS_PRODUCTION) note(r, "", "", "User to create", `${name}: create their account on the Users page and choose their team.`);
      else if (!user) {
        const local = emailLocalPart(name);
        let email = `${local}@${SEED_EMAIL_DOMAIN}`;
        for (let i = 2; await User.findOne({ where: { email }, attributes: ["user_id"], transaction: t }); i++) email = `${local}${i}@${SEED_EMAIL_DOMAIN}`;
        user = await User.create(
          { user_id: uuidv4(), full_name: name, email, password: devPasswordHash, user_type_id: internalType.user_type_id, ...sector, is_first_logged_in: true, is_active: true },
          { transaction: t },
        );
        if (inspectorRole) await UserRoles.create({ user_role_id: uuidv4(), user_id: user.user_id, role_id: inspectorRole.role_id, is_active: true, assigned_at: new Date() }, { transaction: t });
        stats.usersCreated++;
        note(r, "", "", "User created", `${name}: ${email} (password "${DEV_PASSWORD}")`);
      }
      if (user && !user.is_active) {
        note(r, "", "", "Person's account is inactive", `${user.full_name} (${user.email}) is not put in a team.`);
        user = null;
      }
      personCache.set(k, user);
      return user;
    };

    /** Location from the list's typed names (when a license has no coordinates). */
    const listLocation = (loc) => {
      const m = matcher.matchRow(loc);
      const w = [...new Set(m.woredas.filter((x) => x.status === "matched").map((x) => x.area.area_id))];
      if (w.length) return w;
      const z = [...new Set(m.zones.filter((x) => x.status === "matched").map((x) => x.area.area_id))];
      if (z.length) return z;
      return m.region.status === "matched" ? [m.region.area.area_id] : [];
    };

    // Who the list puts in which team
    const peopleOfTeam = new Map(); // code -> Map(userId -> user)
    const teamOfPerson = new Map(); // userId -> code

    /* ---------- each row of the list ---------- */
    for (const row of list) {
      const { r } = row;
      if (MISSING_NUMBER.test(row.number)) {
        note(r, row.company, row.number, "No license number", "Row skipped; add the license by hand in the app.");
        continue;
      }
      const key = licenseKey(row.number);
      if (seenKeys.has(key)) {
        note(r, row.company, row.number, "License listed twice", "Only its first row is used.");
        continue;
      }
      seenKeys.add(key);
      const company = await companyFor(row.company, r, row.number);
      const { matched: licenseMinerals, unknown } = parseMineralText(row.mineralText, minerals);
      if (unknown.length) note(r, row.company, row.number, "Mineral not recognised", `${unknown.join(", ")} (from "${row.mineralText}")`);
      const fields = {
        license_type: row.type,
        mineral_text: row.mineralText || null,
        issued_on: row.date.date,
        date_note: row.date.note,
        notes: row.comment,
        travel_mode: row.travel.travel_mode,
        airport: row.travel.airport,
      };
      if (!row.type) note(r, row.company, row.number, "Unknown license type", `"${row.typeText}" is not Exploration or Mining; type left as it was.`);

      /* license */
      let license = licenseByKey.get(key);
      if (license) {
        const changes = [];
        if (license.company_id !== company.company_id) {
          changes.push(`company: ${license.company?.name} → ${company.name}`);
          license.company_id = company.company_id;
          stats.licensesMovedCompany++;
        }
        for (const [k, v] of Object.entries(fields)) {
          if (k === "license_type" && !v) continue;
          if ((license[k] ?? null) !== (v ?? null)) {
            changes.push(`${k.replace(/_/g, " ")}: ${license[k] ?? "—"} → ${v ?? "—"}`);
            license[k] = v;
          }
        }
        if (licenseKey(license.license_number) === key && license.license_number !== row.number.toUpperCase().replace(/\//g, "\\")) {
          note(r, row.company, row.number, "Number written differently", `Database: ${license.license_number}. Left as it is.`);
        }
        if (changes.length) {
          await license.save({ transaction: t });
          stats.licensesUpdated++;
          note(r, row.company, license.license_number, "License updated", changes.join("; "));
        }
        const current = (await license.getMinerals({ transaction: t, attributes: ["mineral_id"] })).map((m) => m.mineral_id);
        const wanted = [...new Set(licenseMinerals.map((m) => m.mineral_id))];
        if (!sameSet(current, wanted)) await license.setMinerals(wanted, { transaction: t });
      } else {
        if (!row.type) continue;
        license = await CompanyLicense.create(
          { ...sector, company_id: company.company_id, license_number: row.number, status: "active", ...fields },
          { transaction: t },
        );
        await license.setMinerals(licenseMinerals.map((m) => m.mineral_id), { transaction: t });
        licenseByKey.set(key, license);
        stats.licensesCreated++;
        note(r, row.company, license.license_number, "License added", "");
      }

      /* location: the surveyed area, else the typed names */
      const before = (await db.LicenseArea.findAll({ where: { license_id: license.license_id }, attributes: ["area_id"], transaction: t })).map((x) => x.area_id);
      const surveyed = coords.licenses.get(key);
      let after;
      if (surveyed) {
        after = woredas.forGeometry(surveyed.geometry).map((w) => w.area_id);
        await CompanyLicense.update(
          { boundary: surveyed.geometry, center_lat: surveyed.center.lat, center_lng: surveyed.center.lng, location_source: "coordinates" },
          { where: { license_id: license.license_id }, transaction: t },
        );
        stats.fromCoordinates++;
        if (!after.length) {
          after = listLocation(row.loc);
          note(r, row.company, license.license_number, "Area not inside a known woreda", `Location kept from the list: ${pathOf(after)}.`);
        }
      } else {
        after = listLocation(row.loc);
        await CompanyLicense.update({ location_source: after.length ? "list" : null }, { where: { license_id: license.license_id }, transaction: t });
        stats.fromList++;
        note(r, row.company, license.license_number, "Not in the coordinate list", `Location from the list's names: ${pathOf(after)}.`);
      }
      if (!sameSet(before, after)) {
        await license.setAreas(after, { transaction: t });
        stats.locationsChanged++;
        note(r, row.company, license.license_number, "Location changed", `${pathOf(before)} → ${pathOf(after)}`);
      }

      /* team */
      const team = row.team ? await teamFor(row.team) : null;
      const links = await TeamLicense.findAll({ where: { license_id: license.license_id }, transaction: t });
      const linkedTeams = links.map((l) => l.team_id);
      if (!sameSet(linkedTeams, team ? [team.team_id] : [])) {
        const names = (await Team.findAll({ where: { team_id: linkedTeams }, attributes: ["name"], transaction: t })).map((x) => x.name);
        await TeamLicense.destroy({ where: { license_id: license.license_id, ...(team && { team_id: { [Op.ne]: team.team_id } }) }, transaction: t });
        if (team) await TeamLicense.findOrCreate({ where: { team_id: team.team_id, license_id: license.license_id }, defaults: { team_id: team.team_id, license_id: license.license_id }, transaction: t });
        stats.teamChanges++;
        note(r, row.company, license.license_number, team ? "Team changed" : "Team removed", `${names.join(", ") || "no team"} → ${team ? team.name : "no team"}${row.comment ? ` (${row.comment})` : ""}`);
      }
      if (!team) stats.licensesWithoutTeam++;

      // Tasks nobody has started go with the license to its new team
      const tasks = await Inspection.findAll({
        where: { license_id: license.license_id, status: "todo", team_id: team ? { [Op.or]: [{ [Op.ne]: team.team_id }, { [Op.is]: null }] } : { [Op.ne]: null } },
        transaction: t,
      });
      for (const task of tasks) {
        await InspectionEvent.create({ inspection_id: task.inspection_id, type: "reassigned", user_id: null, details: { from: task.team_id, to: team?.team_id ?? null, reason: "license list update" } }, { transaction: t });
        await task.update({ team_id: team?.team_id ?? null }, { transaction: t });
        stats.tasksMoved++;
      }
      if (tasks.length) note(r, row.company, license.license_number, "Tasks moved", `${tasks.length} task(s) not started yet → ${team ? team.name : "no team"}`);

      /* people of the team */
      if (team) {
        if (!peopleOfTeam.has(row.team)) peopleOfTeam.set(row.team, new Map());
        for (const name of row.members) {
          const user = await personFor(name, r);
          if (!user) continue;
          const other = teamOfPerson.get(user.user_id);
          if (other && other !== row.team) {
            note(r, row.company, license.license_number, "Person listed in two teams", `${user.full_name}: Team ${other} and Team ${row.team}. Kept in Team ${other}.`);
            continue;
          }
          teamOfPerson.set(user.user_id, row.team);
          peopleOfTeam.get(row.team).set(user.user_id, user);
        }
      }
    }

    /* ---------- team membership: exactly the list's people ---------- */
    for (const [code, people] of peopleOfTeam) {
      const team = await teamFor(code);
      const members = await TeamMember.findAll({ where: { team_id: team.team_id, left_on: null }, include: [{ model: User, as: "user", attributes: ["full_name"] }], transaction: t });
      for (const m of members) {
        if (m.user_id && people.has(m.user_id)) continue;
        // Listed for another team: moved below (reported as a move)
        if (m.user_id && teamOfPerson.has(m.user_id)) continue;
        await m.update({ left_on: today(), role: "member" }, { transaction: t });
        stats.peopleRemoved++;
        note("", "", "", "Left the team", `${m.user?.full_name ?? m.pending_name} is not in ${team.name} in the list.`);
      }
    }
    for (const [code, people] of peopleOfTeam) {
      const team = await teamFor(code);
      for (const user of people.values()) {
        const current = await TeamMember.findOne({ where: { user_id: user.user_id, left_on: null }, include: [{ model: Team, as: "team", attributes: ["name"] }], transaction: t });
        if (current?.team_id === team.team_id) continue;
        if (current) {
          await current.update({ left_on: today(), role: "member" }, { transaction: t });
          stats.peopleMoved++;
          note("", "", "", "Moved to another team", `${user.full_name}: ${current.team?.name} → ${team.name}`);
        } else {
          stats.peopleAdded++;
          note("", "", "", "Joined a team", `${user.full_name} → ${team.name}`);
        }
        try {
          await addUserToTeam({ teamId: team.team_id, userId: user.user_id, role: "member", transaction: t });
        } catch (error) {
          if (!error.status) throw error;
          note("", "", "", "Could not join the team", `${user.full_name} → ${team.name}: ${error.message}`);
        }
      }
    }

    /* ---------- reported only ---------- */
    for (const [key, l] of licenseByKey) {
      if (!seenKeys.has(key)) note("", l.company?.name ?? "", l.license_number, "Not in the list", "Left as it is (status, team and location unchanged).");
    }
    for (const [key, c] of coords.licenses) {
      if (!seenKeys.has(key)) note("", c.company, c.number, "Coordinates for a license not in the list", "Not used.");
    }
    const emptyTeams = await Team.findAll({
      where: { ...sector, is_active: true, team_id: { [Op.notIn]: sequelize.literal("(SELECT team_id FROM team_licenses)") } },
      attributes: ["name"],
      transaction: t,
    });
    for (const team of emptyTeams) note("", "", "", "Team without licenses", `${team.name} is responsible for no license now.`);

    if (dryRun) await t.rollback();
    else await t.commit();
  } catch (error) {
    if (!t.finished) await t.rollback();
    throw error;
  }

  const reportFile = reportDir && report.length ? writeReport(report, { dryRun, reportDir, name: "license-update" }) : null;
  return { stats, report, reportFile };
}

/** Console summary. */
const summarizeUpdate = ({ stats, report, reportFile }, { dryRun = false } = {}) => {
  const byIssue = report.reduce((acc, x) => ((acc[x.issue] = (acc[x.issue] || 0) + 1), acc), {});
  return [
    dryRun ? "DRY RUN — nothing was saved. This is what the update would do:" : "License list update applied.",
    `  Rows in the list:             ${stats.rows}`,
    `  Companies added:              ${stats.companiesCreated}`,
    `  Licenses added:               ${stats.licensesCreated}`,
    `  Licenses with changed details: ${stats.licensesUpdated}  (moved to another company: ${stats.licensesMovedCompany})`,
    `  Locations from coordinates:   ${stats.fromCoordinates}  (from the list's names: ${stats.fromList})`,
    `  Locations changed:            ${stats.locationsChanged}`,
    `  Licenses changing team:       ${stats.teamChanges}  (now without a team: ${stats.licensesWithoutTeam})`,
    `  Tasks moved to the new team:  ${stats.tasksMoved}`,
    `  People joining a team:        ${stats.peopleAdded}`,
    `  People moving team:           ${stats.peopleMoved}`,
    `  People leaving their team:    ${stats.peopleRemoved}`,
    `  Users created:                ${stats.usersCreated}`,
    `  Report lines: ${report.length}${report.length ? " " + JSON.stringify(byIssue) : ""}`,
    ...(reportFile ? [`  Report: ${reportFile}`] : []),
  ].join("\n");
};

/**
 * Give licenses their surveyed area (used by the seeder for licenses it just created, so a
 * fresh installation gets exact locations). Licenses not in the coordinate list are left as they are.
 */
async function applyLicenseCoordinates({ coordsFile, licenseIds, transaction }) {
  if (!licenseIds?.length) return { applied: 0 };
  const coords = await readLicenseCoordinates(coordsFile);
  const woredas = await WoredaIndex.load(db, transaction);
  const licenses = await db.CompanyLicense.findAll({ where: { license_id: licenseIds }, transaction });
  let applied = 0;
  for (const license of licenses) {
    const surveyed = coords.licenses.get(licenseKey(license.license_number));
    if (!surveyed) continue;
    const ids = woredas.forGeometry(surveyed.geometry).map((w) => w.area_id);
    await license.update({ boundary: surveyed.geometry, center_lat: surveyed.center.lat, center_lng: surveyed.center.lng, ...(ids.length && { location_source: "coordinates" }) }, { transaction });
    if (ids.length) await license.setAreas(ids, { transaction });
    applied++;
  }
  return { applied };
}

module.exports = { updateFromLicenseList, summarizeUpdate, applyLicenseCoordinates, readList };
