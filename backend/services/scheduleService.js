/**
 * Creates the tasks (inspections) of inspection schedules.
 *
 * - Each occurrence of an active schedule gives one task per covered active license,
 *   handed to the license's team (the first team linked to it; admins can reassign).
 * - A new schedule starts with its current occurrence if that is still open, never a backlog.
 * - After that every occurrence up to today is created, also ones missed while the server
 *   was down (at most 60 days back) — those are simply overdue and can be submitted late.
 * - The current occurrence is re-checked on every run so licenses added later still get a task.
 * Runs when a schedule is saved and every hour (startScheduler).
 */
const { QueryTypes } = require("sequelize");
const { sequelize, InspectionSchedule, Inspection } = require("../models");
const { localToday, addDays, occurrencesBetween, lastOccurrenceOnOrBefore, dueAtFor } = require("../utils/scheduleDates");
const notify = require("./inspectionNotifications");

const CATCH_UP_DAYS = 60;

/** Active licenses a schedule covers, within the schedule's sector: [{ license_id, company_id, license_type, team_id }] */
const coveredLicenses = async (schedule, transaction) => {
  const s = schedule.get ? schedule.get({ plain: true }) : schedule;
  const team = `(SELECT tl.team_id FROM team_licenses tl JOIN teams t ON t.team_id = tl.team_id AND t.is_active AND t.sector_node_id = l.sector_node_id
                 WHERE tl.license_id = l.license_id ORDER BY tl.created_at LIMIT 1) AS team_id`;
  const base = `SELECT l.license_id, l.company_id, l.license_type, ${team} FROM company_licenses l
                JOIN companies c ON c.company_id = l.company_id AND c.is_active AND l.sector_node_id = :sector`;
  let sql;
  if (s.target_type === "licenses" && !s.schedule_id) {
    // not saved yet (preview): the chosen ids
    if (!s.license_ids?.length) return [];
    sql = `${base} WHERE l.status = 'active' AND l.license_id IN (:ids)`;
  } else if (s.target_type === "licenses") {
    sql = `${base} JOIN schedule_licenses sl ON sl.license_id = l.license_id AND sl.schedule_id = :schedule WHERE l.status = 'active'`;
  } else if (s.target_type === "license_type") {
    sql = `${base} WHERE l.status = 'active' AND l.license_type = :type`;
  } else {
    sql = `${base} WHERE l.status = 'active' AND EXISTS (
             SELECT 1 FROM form_assignments a WHERE a.form_id = :form AND (
                  a.target_type = 'all'
               OR (a.target_type = 'license_type' AND a.license_type = l.license_type)
               OR (a.target_type = 'company' AND a.company_id = l.company_id)
               OR (a.target_type = 'license' AND a.license_id = l.license_id)))`;
  }
  return sequelize.query(sql, {
    replacements: { sector: s.sector_node_id, ids: s.license_ids?.length ? [...new Set(s.license_ids)] : [null], schedule: s.schedule_id ?? null, type: s.license_type ?? null, form: s.form_id },
    type: QueryTypes.SELECT,
    transaction,
  });
};

/** Which occurrences need tasks now. */
const occurrencesToCreate = (s, now) => {
  const today = localToday(now);
  const latest = lastOccurrenceOnOrBefore(s, today);
  const stillOpen = latest && dueAtFor(s, latest) > now;
  if (!s.last_generated_on) return stillOpen ? [latest] : [];
  const from = [addDays(String(s.last_generated_on).slice(0, 10), 1), addDays(today, -CATCH_UP_DAYS)].sort().pop();
  const dates = new Set(occurrencesBetween(s, from, today, 100));
  if (stillOpen) dates.add(latest);
  return [...dates].sort();
};

/** Create the missing tasks of one schedule. @returns number of tasks created */
const generateForSchedule = async (schedule, now = new Date()) => {
  if (schedule.status !== "active") return 0;
  const today = localToday(now);
  const dates = occurrencesToCreate(schedule, now);
  let created = 0;
  if (dates.length) {
    const licenses = await coveredLicenses(schedule);
    for (const d of dates) {
      const rows = licenses.map((l) => ({
        schedule_id: schedule.schedule_id,
        sector_node_id: schedule.sector_node_id,
        form_id: schedule.form_id,
        license_id: l.license_id,
        company_id: l.company_id,
        team_id: l.team_id,
        occurrence_date: d,
        due_at: dueAtFor(schedule, d),
      }));
      if (rows.length) {
        const before = await Inspection.count({ where: { schedule_id: schedule.schedule_id, occurrence_date: d } });
        const startedAt = new Date(Date.now() - 1000);
        await Inspection.bulkCreate(rows, { ignoreDuplicates: true });
        const added = (await Inspection.count({ where: { schedule_id: schedule.schedule_id, occurrence_date: d } })) - before;
        created += added;
        // Each team with new tasks gets one notification
        if (added) await notify.roundStarted(schedule.schedule_id, d, startedAt);
      }
    }
  }
  const finished = (schedule.frequency === "once" && today >= String(schedule.start_date).slice(0, 10)) || (schedule.end_date && today >= String(schedule.end_date).slice(0, 10));
  await schedule.update({ last_generated_on: today, ...(finished ? { status: "ended" } : {}) });
  return created;
};

let running = false;
/** Run all active schedules. */
const generateAll = async (now = new Date()) => {
  if (running) return 0;
  running = true;
  let total = 0;
  try {
    const schedules = await InspectionSchedule.findAll({ where: { status: "active" } });
    for (const s of schedules) {
      try {
        total += await generateForSchedule(s, now);
      } catch (e) {
        console.error(`Schedule ${s.schedule_id} (${s.name}): could not create tasks:`, e.message);
      }
    }
  } finally {
    running = false;
  }
  if (total) console.log(`📋 Inspection schedules: ${total} new task(s) created`);
  return total;
};

/** Hourly task creation (set DISABLE_SCHEDULER=true to turn it off, e.g. on a second server). */
const startScheduler = () => {
  if (process.env.DISABLE_SCHEDULER === "true") return;
  const run = () =>
    generateAll()
      .catch((e) => console.error("Inspection schedules:", e.message))
      // Reminders: due within 2 days, overdue (each task once)
      .then(() => notify.sendDueReminders())
      // Audit log rows past the retention time
      .then(() => require("./auditService").removeOldEntries());
  setTimeout(run, 15 * 1000);
  setInterval(run, 60 * 60 * 1000).unref();
};

module.exports = { coveredLicenses, generateForSchedule, generateAll, startScheduler, occurrencesToCreate };
