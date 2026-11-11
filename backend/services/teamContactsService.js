"use strict";
/**
 * Email and phone number of team members from a contact sheet: the Google Form "Inspection Team"
 * responses (Timestamp | Full Name | Email | Phone Number). Used by
 * `npm run import:team-contacts` and by the license-list seeder (for the inspector accounts it
 * creates; data/license-list/team-contacts.xlsx).
 *
 * Rules
 *   - Each response is matched to an account of the sector by name: exact, or the account's name
 *     with small spelling differences, compared with the first words of the full name
 *     ("Fitsume Kucha Dewelle" → Fitsum Kucha). Several possible accounts: nothing is changed.
 *   - Only the email and the phone number change. The email is the login: the person signs in
 *     with the new email and their current password.
 *   - Phones are stored as +2519XXXXXXXX / +2517XXXXXXXX. A number that isn't an Ethiopian mobile
 *     number is not used (reported).
 *   - Someone who answered more than once: the latest answer is used.
 *   - An email already used by another account is not used (reported).
 *   - createMissing: someone in the sheet with no account gets one (inspector role, no team, temporary
 *     password "password" to change at the first login). Several answers with the same email are one
 *     person (the fullest name, the latest phone).
 *   - All or nothing: one transaction.
 */
const path = require("path");
const bcrypt = require("bcrypt");
const { v4: uuidv4 } = require("uuid");
const ExcelJS = require("exceljs");
const { Op } = require("sequelize");
const db = require("../models");
const { sameStartOfName } = require("./personMatchService");
const { writeReport, DEV_PASSWORD } = require("./licenseImportService");
const { MOM_SECTOR_ID } = require("../utils/sectorConstants");

const DEFAULT_REPORT_DIR = path.join(__dirname, "..", "reports");
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NO_ID = "00000000-0000-0000-0000-000000000000";

const text = (cell) => {
  const v = cell.value;
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object" && v.text) return String(v.text);
  if (typeof v === "object" && v.richText) return v.richText.map((t) => t.text).join("");
  if (typeof v === "object" && "result" in v) return String(v.result ?? "");
  return String(v).trim();
};

/** "920242330" / "0920242330" / "+251920242330" / "251 92 024 2330" → "+251920242330"; else null */
const ethiopianMobile = (raw) => {
  const digits = String(raw || "").replace(/\D/g, "");
  const local = digits.startsWith("251") ? digits.slice(3) : digits.startsWith("0") ? digits.slice(1) : digits;
  return /^[79]\d{8}$/.test(local) ? `+251${local}` : null;
};

/** The responses of the sheet: [{ row, name, email, phone, when }] */
async function readContacts(file) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.worksheets[0];
  // values is 1-based with an empty slot at 0
  const header = Array.from(ws.getRow(1).values, (v) => String(v ?? "").toLowerCase().trim());
  const col = (name) => header.findIndex((h) => h.includes(name));
  const C = { when: col("timestamp"), name: col("name"), email: col("email"), phone: col("phone") };
  if (C.name < 1 || C.email < 1 || C.phone < 1) throw new Error("The first row must have Full Name, Email and Phone Number columns.");
  const responses = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const name = text(row.getCell(C.name)).replace(/\s+/g, " ");
    if (!name) continue;
    responses.push({ row: r, name, email: text(row.getCell(C.email)).toLowerCase(), phone: text(row.getCell(C.phone)), when: C.when > 0 ? text(row.getCell(C.when)) : String(r) });
  }
  return responses;
}

/**
 * @param {{ file: string, sectorId?: string, dryRun?: boolean, onlyUserIds?: string[]|null,
 *           reportDir?: string|null, transaction?: object }} options
 *   onlyUserIds: change only these accounts (the seeder: accounts still on their temporary password)
 *   createMissing: create an account for each person in the sheet who has none
 * @returns {Promise<{ stats: object, report: object[], reportFile: string|null }>}
 */
async function applyTeamContacts({ file, sectorId = MOM_SECTOR_ID, dryRun = false, onlyUserIds = null, createMissing = false, reportDir = DEFAULT_REPORT_DIR, transaction = null }) {
  const responses = await readContacts(file);
  const report = [];
  const note = (row, name, issue, detail) => report.push({ row, company: name, license: "", issue, detail });
  const stats = { responses: responses.length, matched: 0, emails: 0, phones: 0, unchanged: 0, created: 0 };

  const t = transaction ?? (await db.sequelize.transaction());
  try {
    const users = await db.User.findAll({ where: { sector_node_id: sectorId }, attributes: ["user_id", "full_name", "email", "phone_number", "is_active"], transaction: t });

    // Match every response; keep the latest answer per account
    const latest = new Map(); // user_id -> { user, response, others[] }
    const unmatched = []; // responses with no account at all
    for (const res of responses) {
      const exact = users.filter((u) => u.full_name.toLowerCase().replace(/\s+/g, " ") === res.name.toLowerCase());
      const candidates = exact.length ? exact : users.filter((u) => sameStartOfName(res.name, u.full_name));
      if (!candidates.length && createMissing) {
        unmatched.push(res);
        continue;
      }
      if (candidates.length !== 1) {
        note(res.row, res.name, candidates.length ? "Several possible accounts" : "No matching account", candidates.length ? candidates.map((u) => u.full_name).join(", ") : "Create the account on the Users page, or correct the name.");
        continue;
      }
      const user = candidates[0];
      const prev = latest.get(user.user_id);
      if (!prev) latest.set(user.user_id, { user, response: res, others: [] });
      else if (res.when > prev.response.when) latest.set(user.user_id, { user, response: res, others: [...prev.others, prev.response] });
      else prev.others.push(res);
    }

    for (const { user, response: res, others } of latest.values()) {
      if (onlyUserIds && !onlyUserIds.includes(user.user_id)) continue;
      stats.matched++;
      const label = `${res.name} → ${user.full_name}`;
      for (const o of others) {
        if (o.email !== res.email || ethiopianMobile(o.phone) !== ethiopianMobile(res.phone)) {
          note(o.row, res.name, "Answered more than once", `The latest answer (row ${res.row}) is used: ${res.email}, ${res.phone}; this one said ${o.email}, ${o.phone}.`);
        }
      }
      const changes = {};
      if (!EMAIL.test(res.email)) note(res.row, label, "Email not valid", `"${res.email}" — email left as ${user.email}.`);
      else if (res.email !== user.email.toLowerCase()) {
        const taken = await db.User.findOne({ where: { email: { [Op.iLike]: res.email }, user_id: { [Op.ne]: user.user_id } }, attributes: ["full_name"], transaction: t });
        if (taken) note(res.row, label, "Email used by another account", `${res.email} belongs to ${taken.full_name}; email left as ${user.email}.`);
        else changes.email = res.email;
      }
      const phone = ethiopianMobile(res.phone);
      if (!phone) note(res.row, label, "Phone not an Ethiopian mobile number", `"${res.phone}" — phone left as ${user.phone_number ?? "empty"}.`);
      else if (phone !== user.phone_number) changes.phone_number = phone;

      if (!Object.keys(changes).length) {
        stats.unchanged++;
        continue;
      }
      if (changes.email) stats.emails++;
      if (changes.phone_number) stats.phones++;
      note(
        res.row,
        label,
        "Updated",
        [changes.email && `email ${user.email} → ${changes.email}`, changes.phone_number && `phone ${user.phone_number ?? "—"} → ${changes.phone_number}`].filter(Boolean).join("; "),
      );
      await user.update(changes, { transaction: t });
    }

    // People in the sheet with no account: create one (one per email)
    if (unmatched.length) {
      const matchedEmails = new Set([...latest.values()].map((x) => x.response.email));
      const byEmail = new Map();
      for (const res of unmatched) {
        if (matchedEmails.has(res.email)) continue; // the same person answered under a name that matched
        if (!EMAIL.test(res.email)) {
          note(res.row, res.name, "Email not valid", `"${res.email}" — no account created; create it on the Users page.`);
          continue;
        }
        byEmail.set(res.email, [...(byEmail.get(res.email) ?? []), res]);
      }
      const role = byEmail.size ? await db.Role.findOne({ where: { name: "inspector", sector_node_id: null, is_active: true }, transaction: t }) : null;
      const internal = byEmail.size ? await db.UserType.findOne({ where: { name: "internal" }, transaction: t }) : null;
      const passwordHash = byEmail.size ? await bcrypt.hash(DEV_PASSWORD, 10) : null;
      for (const [email, answers] of byEmail) {
        const fullest = [...answers].sort((a, b) => b.name.split(" ").length - a.name.split(" ").length)[0];
        const newest = [...answers].sort((a, b) => (a.when < b.when ? 1 : -1))[0];
        const taken = await db.User.findOne({ where: { email: { [Op.iLike]: email } }, attributes: ["full_name", "sector_node_id"], transaction: t });
        // Their account already exists under a name that doesn't match this answer ("Birtukan"): nothing to do
        if (taken?.sector_node_id === sectorId) continue;
        if (taken) {
          note(fullest.row, fullest.name, "Email used by another account", `${email} belongs to ${taken.full_name}; no account created.`);
          continue;
        }
        if (!role || !internal) throw new Error("The inspector role or internal user type is missing: run the seeders.");
        const phone = ethiopianMobile(newest.phone);
        const user = await db.User.create(
          { user_id: uuidv4(), full_name: fullest.name, email, phone_number: phone, password: passwordHash, user_type_id: internal.user_type_id, sector_node_id: sectorId, is_first_logged_in: true, is_active: true },
          { transaction: t },
        );
        await db.UserRoles.create({ user_role_id: uuidv4(), user_id: user.user_id, role_id: role.role_id, is_active: true, assigned_at: new Date() }, { transaction: t });
        stats.created++;
        note(fullest.row, fullest.name, "Account created", `${email}${phone ? `, ${phone}` : ""}; inspector, no team yet (choose it on the Users page); temporary password "${DEV_PASSWORD}", to change at the first login.`);
      }
    }

    // Team members the sheet doesn't mention (not when limited to some accounts)
    if (!onlyUserIds) {
      const members = await db.TeamMember.findAll({
        where: { left_on: null, user_id: { [Op.notIn]: latest.size ? [...latest.keys()] : [NO_ID] } },
        include: [
          { model: db.User, as: "user", where: { sector_node_id: sectorId }, attributes: ["full_name", "email"] },
          { model: db.Team, as: "team", attributes: ["name"] },
        ],
        transaction: t,
      });
      for (const m of members) note("", m.user.full_name, "Team member not in the sheet", `${m.team?.name}: email ${m.user.email} unchanged.`);
    }

    if (!transaction) {
      if (dryRun) await t.rollback();
      else await t.commit();
    }
  } catch (error) {
    if (!transaction && !t.finished) await t.rollback();
    throw error;
  }

  const reportFile = reportDir && report.length ? writeReport(report, { dryRun, reportDir, name: "team-contacts" }) : null;
  return { stats, report, reportFile };
}

/**
 * The sheet as a look-up for the importers: contactFor("Fitsum Kucha") → { email, phone } of the
 * one response whose name matches (latest answer), else null. Used to create an account with the
 * person's real email when the license list names someone who has none yet.
 */
async function loadContactBook(file) {
  const responses = file ? await readContacts(file) : [];
  return (name) => {
    const found = responses.filter((r) => r.name.toLowerCase() === String(name).toLowerCase() || sameStartOfName(r.name, name));
    if (!found.length) return null;
    // Different people could match the same short name: then no contact is used
    const people = new Set(found.map((r) => r.email));
    if (people.size > 1) return null;
    const latest = found.sort((a, b) => (a.when < b.when ? 1 : -1))[0];
    if (!EMAIL.test(latest.email)) return null;
    return { email: latest.email, phone: ethiopianMobile(latest.phone), fullName: latest.name };
  };
}

/** Console summary. */
const summarizeContacts =({ stats, report, reportFile }, { dryRun = false } = {}) => {
  const byIssue = report.reduce((a, x) => ((a[x.issue] = (a[x.issue] || 0) + 1), a), {});
  return [
    dryRun ? "DRY RUN — nothing was saved. This is what would change:" : "Team contacts updated.",
    `  Responses read:      ${stats.responses}`,
    `  Matched to accounts: ${stats.matched}`,
    `  Emails changed:      ${stats.emails}`,
    `  Phones changed:      ${stats.phones}`,
    `  Already up to date:  ${stats.unchanged}`,
    ...(stats.created ? [`  Accounts created:    ${stats.created}  (inspector, no team; temporary password "${DEV_PASSWORD}")`] : []),
    ...(reportFile ? [`  Report: ${reportFile}  ${JSON.stringify(byIssue)}`] : []),
  ].join("\n");
};

module.exports = { applyTeamContacts, summarizeContacts, readContacts, loadContactBook, ethiopianMobile };
