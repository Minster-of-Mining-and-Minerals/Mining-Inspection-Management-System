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
 *   - All or nothing: one transaction.
 */
const path = require("path");
const ExcelJS = require("exceljs");
const { Op } = require("sequelize");
const db = require("../models");
const { sameStartOfName } = require("./personMatchService");
const { writeReport } = require("./licenseImportService");
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
 *   onlyUserIds: change only these accounts (the seeder: the inspectors it just created)
 * @returns {Promise<{ stats: object, report: object[], reportFile: string|null }>}
 */
async function applyTeamContacts({ file, sectorId = MOM_SECTOR_ID, dryRun = false, onlyUserIds = null, reportDir = DEFAULT_REPORT_DIR, transaction = null }) {
  const responses = await readContacts(file);
  const report = [];
  const note = (row, name, issue, detail) => report.push({ row, company: name, license: "", issue, detail });
  const stats = { responses: responses.length, matched: 0, emails: 0, phones: 0, unchanged: 0 };

  const t = transaction ?? (await db.sequelize.transaction());
  try {
    const users = await db.User.findAll({ where: { sector_node_id: sectorId }, attributes: ["user_id", "full_name", "email", "phone_number", "is_active"], transaction: t });

    // Match every response; keep the latest answer per account
    const latest = new Map(); // user_id -> { user, response, others[] }
    for (const res of responses) {
      const exact = users.filter((u) => u.full_name.toLowerCase().replace(/\s+/g, " ") === res.name.toLowerCase());
      const candidates = exact.length ? exact : users.filter((u) => sameStartOfName(res.name, u.full_name));
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

/** Console summary. */
const summarizeContacts = ({ stats, report, reportFile }, { dryRun = false } = {}) => {
  const byIssue = report.reduce((a, x) => ((a[x.issue] = (a[x.issue] || 0) + 1), a), {});
  return [
    dryRun ? "DRY RUN — nothing was saved. This is what would change:" : "Team contacts updated.",
    `  Responses read:      ${stats.responses}`,
    `  Matched to accounts: ${stats.matched}`,
    `  Emails changed:      ${stats.emails}`,
    `  Phones changed:      ${stats.phones}`,
    `  Already up to date:  ${stats.unchanged}`,
    ...(reportFile ? [`  Report: ${reportFile}  ${JSON.stringify(byIssue)}`] : []),
  ].join("\n");
};

module.exports = { applyTeamContacts, summarizeContacts, readContacts, ethiopianMobile };
