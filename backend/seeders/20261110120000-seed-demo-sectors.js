"use strict";
/**
 * Sample data for the GIE and MIDI sectors, for development and testing (Ministry of Mines gets
 * its data from the license list and checklist seeders). Not created on a server: like the other
 * demo accounts it needs NODE_ENV other than production, or SEED_DEV_PASSWORDS=true.
 *
 * For each sector:
 *   users      a supervisor, a team leader and two inspectors (password "password"); the sector
 *              admin is gie-admin@gmail.com / midi-admin@gmail.com from 20261110110000-seed-sector-admins.js
 *   team       "Team 1" with the leader and the inspectors, responsible for all the sector's licenses
 *   companies  three sample companies with their licenses, minerals and locations
 *   checklist  the sample site check (published, for all the sector's licenses)
 *   schedule   a weekly site check, so the team has tasks straight away
 *
 * Safe to re-run: only what is missing is added; nothing existing is changed.
 */
const { devAccountsAllowed } = require("../utils/seedMode");

const GIE = "c1934d0d-b316-406f-a599-e6282b08ad4b";
const MIDI = "d222bb63-c832-4889-89ae-cdf8a09b5cdb";

const SECTORS = [
  {
    sector_node_id: GIE,
    label: "GIE",
    prefix: "gie",
    phone: "2519110010",
    users: [
      { key: "admin", full_name: "Hirut Alemayehu", role: "sector_admin" },
      { key: "supervisor", full_name: "Dawit Tesfaye", role: "supervisor" },
      { key: "teamleader", full_name: "Meron Kebede", team: "leader" },
      { key: "inspector1", full_name: "Yonas Girma", team: "member" },
      { key: "inspector2", full_name: "Selam Worku", team: "member" },
    ],
    // The Geological Institute: mostly exploration work
    companies: [
      {
        name: "Abay Geoscience Exploration PLC",
        contact_person: "Abebe Mulugeta",
        licenses: [
          { number: "GIE\\EL\\0001\\2026", type: "exploration", minerals: ["Gold"], site: "Asosa gold prospect", region: "Benishangul-Gumuz" },
          { number: "GIE\\EL\\0002\\2026", type: "exploration", minerals: ["Platinum"], site: "Yubdo platinum prospect", region: "Oromia" },
        ],
      },
      {
        name: "Rift Valley Lithium Survey PLC",
        contact_person: "Tigist Bekele",
        licenses: [{ number: "GIE\\EL\\0003\\2026", type: "exploration", minerals: ["Lithium"], site: "Lake Abijata brine survey", region: "Oromia" }],
      },
      {
        name: "Northern Base Metals Exploration PLC",
        contact_person: "Gebremedhin Hailu",
        licenses: [{ number: "GIE\\EL\\0004\\2026", type: "exploration", minerals: ["Copper"], site: "Adigrat copper prospect", region: "Tigray" }],
      },
    ],
  },
  {
    sector_node_id: MIDI,
    label: "MIDI",
    prefix: "midi",
    phone: "2519110020",
    users: [
      { key: "admin", full_name: "Samuel Tadesse", role: "sector_admin" },
      { key: "supervisor", full_name: "Rahel Mengistu", role: "supervisor" },
      { key: "teamleader", full_name: "Biniam Asfaw", team: "leader" },
      { key: "inspector1", full_name: "Liya Haile", team: "member" },
      { key: "inspector2", full_name: "Kalkidan Desta", team: "member" },
    ],
    // The Mining Industry Development Institute: mines and processing plants
    companies: [
      {
        name: "Ethio Marble and Granite Industry PLC",
        contact_person: "Mulu Getachew",
        licenses: [{ number: "MIDI\\ML\\0001\\2026", type: "mining", minerals: ["Marble"], site: "Dejen marble quarry", region: "Amhara" }],
      },
      {
        name: "Awash Limestone Processing PLC",
        contact_person: "Fikru Negash",
        licenses: [
          { number: "MIDI\\ML\\0002\\2026", type: "mining", minerals: ["Limestone"], site: "Mugher limestone quarry", region: "Oromia" },
          { number: "MIDI\\ML\\0003\\2026", type: "mining", minerals: ["Coal"], site: "Yayu coal pit", region: "Oromia" },
        ],
      },
      {
        name: "Danakil Potash Development PLC",
        contact_person: "Ahmed Ali",
        licenses: [{ number: "MIDI\\ML\\0004\\2026", type: "mining", minerals: ["Potash"], site: "Dallol potash site", region: "Afar" }],
      },
    ],
  },
];

// The sector admins are the seeded ones (gie-admin@gmail.com, midi-admin@gmail.com)
const emailOf = (s, u) => (u.key === "admin" ? `${s.prefix}-admin@gmail.com` : `${s.prefix}.${u.key}@gmail.com`);
const SCHEDULE_NAME = "Weekly site check";

module.exports = {


  async up() {
    if (!devAccountsAllowed()) {
      console.log("Sample sector data is for development only; skipped.");
      return;
    }
    // Loaded here so the other seeders don't depend on the models
    const bcrypt = require("bcrypt");
    const { v4: uuidv4 } = require("uuid");
    const db = require("../models");
    const sample = require("../data/forms/sample-site-check");
    const { validateDefinition } = require("../utils/formDefinition");
    const { addUserToTeam } = require("../services/teamMembershipService");
    const { generateForSchedule } = require("../services/scheduleService");
    const { localToday } = require("../utils/scheduleDates");
    const { User, UserRoles, UserType, Role, Team, TeamLicense, Company, CompanyLicense, Mineral, AdminArea, Form, FormVersion, FormAssignment, InspectionSchedule, SectorNode } = db;

    const { value: definition, errors } = validateDefinition(sample.definition, { forPublish: true });
    if (errors.length) throw new Error(`The sample form definition is invalid:\n${errors.join("\n")}`);

    const internal = await UserType.findOne({ where: { name: "internal" } });
    if (!internal) throw new Error("The internal user type is missing: run the user type seeder first.");
    const password = await bcrypt.hash("password", 10);
    const schedulesToRun = [];

    for (const s of SECTORS) {
      if (!(await SectorNode.findByPk(s.sector_node_id))) {
        console.log(`Sector ${s.label} not found; skipped.`);
        continue;
      }
      const sector = { sector_node_id: s.sector_node_id };
      const created = { users: 0, companies: 0, licenses: 0 };
      const t = await db.sequelize.transaction();
      try {
        /* ---------- users ---------- */
        const users = {};
        for (const u of s.users) {
          const email = emailOf(s, u);
          let user = await User.findOne({ where: { email }, transaction: t });
          if (!user) {
            user = await User.create(
              {
                user_id: uuidv4(),
                full_name: u.full_name,
                email,
                password,
                phone_number: `${s.phone}${s.users.indexOf(u) + 1}`,
                user_type_id: internal.user_type_id,
                ...sector,
                is_first_logged_in: true,
                is_active: true,
              },
              { transaction: t },
            );
            created.users++;
          }
          if (user.sector_node_id !== s.sector_node_id) throw new Error(`${email} already exists in another sector.`);
          users[u.key] = user;
          if (u.role) {
            const role = await Role.findOne({ where: { name: u.role, sector_node_id: null }, transaction: t });
            if (!role) throw new Error(`Role ${u.role} is missing: run the roles seeder first.`);
            await UserRoles.findOrCreate({
              where: { user_id: user.user_id, role_id: role.role_id },
              defaults: { user_role_id: uuidv4(), user_id: user.user_id, role_id: role.role_id, assigned_at: new Date(), is_active: true },
              transaction: t,
            });
          }
        }
        const adminId = users.admin.user_id;

        /* ---------- team (joining gives the inspector / team_leader roles) ---------- */
        const [team] = await Team.findOrCreate({
          where: { ...sector, code: "1" },
          defaults: { ...sector, code: "1", name: "Team 1", description: `${s.label} field inspection team`, created_by: adminId },
          transaction: t,
        });
        for (const u of s.users.filter((x) => x.team)) {
          const inTeam = await db.TeamMember.count({ where: { user_id: users[u.key].user_id, left_on: null }, transaction: t });
          if (!inTeam) await addUserToTeam({ teamId: team.team_id, userId: users[u.key].user_id, role: u.team, createdBy: adminId, transaction: t });
        }

        /* ---------- companies and licenses ---------- */
        for (const c of s.companies) {
          let company = await Company.findOne({ where: { ...sector, name_normalized: Company.normalizeName(c.name) }, transaction: t });
          if (!company) {
            company = await Company.create({ ...sector, name: c.name, contact_person: c.contact_person, created_by: adminId }, { transaction: t });
            created.companies++;
          }
          for (const l of c.licenses) {
            let license = await CompanyLicense.findOne({ where: { ...sector, license_number: l.number }, transaction: t });
            if (!license) {
              license = await CompanyLicense.create(
                {
                  ...sector,
                  company_id: company.company_id,
                  license_number: l.number,
                  license_type: l.type,
                  mineral_text: l.minerals.join(", "),
                  site_name: l.site,
                  issued_on: "2026-01-15",
                  expires_on: l.type === "exploration" ? "2029-01-14" : "2046-01-14",
                  status: "active",
                  created_by: adminId,
                },
                { transaction: t },
              );
              const minerals = await Mineral.findAll({ where: { name: l.minerals }, transaction: t });
              await license.setMinerals(minerals, { transaction: t });
              const region = await AdminArea.findOne({ where: { level: "region", name: l.region }, transaction: t });
              if (region) await license.setAreas([region], { transaction: t });
              created.licenses++;
            }
            await TeamLicense.findOrCreate({
              where: { team_id: team.team_id, license_id: license.license_id },
              defaults: { team_id: team.team_id, license_id: license.license_id, created_by: adminId },
              transaction: t,
            });
          }
        }

        /* ---------- checklist: the sample site check, published, for all the sector's licenses ---------- */
        let form = await Form.findOne({ where: { ...sector, code: sample.code }, transaction: t });
        if (!form) {
          form = await Form.create(
            { ...sector, code: sample.code, name: sample.name, name_am: sample.name_am, description: sample.description, created_by: adminId },
            { transaction: t },
          );
          await FormVersion.create(
            { form_id: form.form_id, version_number: 1, status: "published", definition, change_note: "Sample form for testing.", published_at: new Date(), published_by: adminId, created_by: adminId },
            { transaction: t },
          );
          await FormAssignment.create({ form_id: form.form_id, target_type: "all", created_by: adminId }, { transaction: t });
        }

        /* ---------- weekly schedule, opening today's weekday ---------- */
        let schedule = await InspectionSchedule.findOne({ where: { ...sector, name: SCHEDULE_NAME }, transaction: t });
        if (!schedule) {
          const today = localToday();
          schedule = await InspectionSchedule.create(
            {
              ...sector,
              form_id: form.form_id,
              name: SCHEDULE_NAME,
              target_type: "assigned",
              frequency: "weekly",
              weekdays: [new Date(`${today}T00:00:00Z`).getUTCDay()],
              start_date: today,
              due_days: 3,
              status: "active",
              notes: "Sample schedule",
              created_by: users.supervisor.user_id,
            },
            { transaction: t },
          );
          schedulesToRun.push(schedule);
        }

        await t.commit();
        console.log(`${s.label}: ${created.users} user(s), ${created.companies} compan(ies), ${created.licenses} license(s) added. Sign in as ${emailOf(s, s.users[0])} / password`);
      } catch (error) {
        await t.rollback();
        throw error;
      }
    }

    // This week's tasks for the new schedules
    for (const schedule of schedulesToRun) {
      const n = await generateForSchedule(schedule);
      console.log(`  ${SCHEDULE_NAME}: ${n} task(s) created`);
    }
  },

  /** Removes the sample data again (only the records this seeder creates). */
  async down(queryInterface) {
    const q = (sql, replacements) => queryInterface.sequelize.query(sql, { replacements });
    for (const s of SECTORS) {
      const r = {
        sector: s.sector_node_id,
        // not the sector admin: it belongs to 20261110110000-seed-sector-admins.js
        emails: s.users.filter((u) => u.key !== "admin").map((u) => emailOf(s, u)),
        numbers: s.companies.flatMap((c) => c.licenses.map((l) => l.number)),
        names: s.companies.map((c) => c.name),
      };
      const forms = `SELECT form_id FROM forms WHERE sector_node_id = :sector AND code = 'SAMPLE-SITE'`;
      await q(`DELETE FROM inspection_events WHERE inspection_id IN (SELECT inspection_id FROM inspections WHERE form_id IN (${forms}))`, r);
      await q(`DELETE FROM inspection_files WHERE inspection_id IN (SELECT inspection_id FROM inspections WHERE form_id IN (${forms}))`, r);
      await q(`DELETE FROM inspections WHERE form_id IN (${forms})`, r);
      await q(`DELETE FROM inspection_schedules WHERE form_id IN (${forms})`, r);
      await q(`DELETE FROM form_assignments WHERE form_id IN (${forms})`, r);
      await q(`DELETE FROM form_version_edits WHERE version_id IN (SELECT version_id FROM form_versions WHERE form_id IN (${forms}))`, r);
      await q(`DELETE FROM form_versions WHERE form_id IN (${forms})`, r);
      await q(`DELETE FROM forms WHERE form_id IN (${forms})`, r);
      await q(`DELETE FROM team_licenses WHERE license_id IN (SELECT license_id FROM company_licenses WHERE sector_node_id = :sector AND license_number IN (:numbers))`, r);
      await q(`DELETE FROM license_minerals WHERE license_id IN (SELECT license_id FROM company_licenses WHERE sector_node_id = :sector AND license_number IN (:numbers))`, r);
      await q(`DELETE FROM license_areas WHERE license_id IN (SELECT license_id FROM company_licenses WHERE sector_node_id = :sector AND license_number IN (:numbers))`, r);
      await q(`DELETE FROM company_licenses WHERE sector_node_id = :sector AND license_number IN (:numbers)`, r);
      await q(`DELETE FROM companies c WHERE c.sector_node_id = :sector AND c.name IN (:names) AND NOT EXISTS (SELECT 1 FROM company_licenses l WHERE l.company_id = c.company_id)`, r);
      await q(`DELETE FROM team_members WHERE user_id IN (SELECT user_id FROM users WHERE email IN (:emails))`, r);
      await q(`DELETE FROM teams t WHERE t.sector_node_id = :sector AND t.code = '1' AND NOT EXISTS (SELECT 1 FROM team_members m WHERE m.team_id = t.team_id)
                 AND NOT EXISTS (SELECT 1 FROM team_licenses l WHERE l.team_id = t.team_id)`, r);
      await q(`DELETE FROM notifications WHERE recipient_id IN (SELECT user_id FROM users WHERE email IN (:emails))`, r);
      await q(`DELETE FROM user_roles WHERE user_id IN (SELECT user_id FROM users WHERE email IN (:emails))`, r);
      await q(`DELETE FROM users WHERE email IN (:emails)`, r);
    }
  },
};
