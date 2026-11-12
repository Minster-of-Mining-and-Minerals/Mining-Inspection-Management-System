"use strict";
/**
 * In-app notifications about inspections (the bell). No email.
 *
 *   INSPECTION_SUBMITTED      → the sector's reviewers (inspections:review / read_all), the central
 *                                administrators, and the other members of the team
 *   INSPECTION_RETURNED       → the team (with the reason)
 *   INSPECTION_ASSIGNED       → the new team (task given to them) and the old team (task moved away);
 *                                also the team when the due date changes
 *   INSPECTION_OFFICE_UPDATED → the sector's reviewers (section filled in at the office after submitting)
 *   ROUND_STARTED             → each team with new tasks: one summary per team
 *   INSPECTION_DUE_SOON       → the team: tasks due within 2 days (one summary per team, once per task)
 *   INSPECTION_OVERDUE        → the team: tasks past their due date (one summary per team, once per task)
 *
 * The person who did the action is never notified about it. Sending never makes the action fail:
 * errors are logged only.
 */
const { QueryTypes, Op } = require("sequelize");
const { v4: uuidv4 } = require("uuid");
const db = require("../models");
const { ROOT_SECTOR_ID } = require("../utils/sectorConstants");

const q = (sql, replacements = {}, transaction) => db.sequelize.query(sql, { replacements, type: QueryTypes.SELECT, transaction });
const day = (d) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Addis_Ababa" });
// The due date shown to people: the last day to submit (due_at is midnight after it)
const lastDay = (dueAt) => day(new Date(new Date(dueAt).getTime() - 1));
const uniq = (ids) => [...new Set(ids.filter(Boolean))];

/** Active members of a team. */
const teamMembers = async (teamId, transaction) =>
  teamId
    ? (
        await q(
          `SELECT m.user_id FROM team_members m JOIN users u ON u.user_id = m.user_id
            WHERE m.team_id = :teamId AND m.left_on IS NULL AND u.is_active`,
          { teamId },
          transaction,
        )
      ).map((r) => r.user_id)
    : [];

/** People who review inspections of a sector: its users with inspections:review or read_all, and central users with them. */
const reviewers = async (sectorId, transaction) =>
  (
    await q(
      `SELECT DISTINCT u.user_id
         FROM users u
         JOIN user_roles ur ON ur.user_id = u.user_id AND ur.is_active
         JOIN roles r ON r.role_id = ur.role_id AND r.is_active
         JOIN role_permissions rp ON rp.role_id = r.role_id AND rp.is_active
         JOIN permissions p ON p.permission_id = rp.permission_id AND p.is_active
        WHERE u.is_active
          AND p.resource = 'inspections' AND p.action IN ('review', 'read_all')
          AND u.sector_node_id IN (:sectorId, :root)`,
      { sectorId, root: ROOT_SECTOR_ID },
      transaction,
    )
  ).map((r) => r.user_id);

/** Insert one notification per recipient (minus the actor). */
const send = async (recipientIds, { type, title, message, entityType = "inspection", entityId = null }, exceptUserId = null) => {
  const ids = uniq(recipientIds).filter((id) => id !== exceptUserId);
  if (!ids.length) return 0;
  const now = new Date();
  await db.Notification.bulkCreate(
    ids.map((id) => ({
      notification_id: uuidv4(),
      recipient_id: id,
      recipient_type: "internal",
      type,
      title: title.slice(0, 255),
      message,
      related_entity_type: entityType,
      related_entity_id: entityId,
      is_read: false,
      created_at: now,
      updated_at: now,
    })),
  );
  return ids.length;
};

/** The task with what the messages need. */
const taskInfo = async (inspectionId) => {
  const [t] = await q(
    `SELECT i.inspection_id, i.sector_node_id, i.team_id, i.due_at, i.is_late, i.status,
            c.name AS company, l.license_number, t.name AS team
       FROM inspections i
       JOIN companies c ON c.company_id = i.company_id
       JOIN company_licenses l ON l.license_id = i.license_id
       LEFT JOIN teams t ON t.team_id = i.team_id
      WHERE i.inspection_id = :inspectionId`,
    { inspectionId },
  );
  return t || null;
};
const nameOf = async (userId) => (userId ? (await db.User.findByPk(userId, { attributes: ["full_name"] }))?.full_name : null) || "Someone";
const what = (t) => `${t.company} (${t.license_number})`;

/** Never let a notification break the action that triggered it. */
const safely = (label, fn) =>
  fn().catch((e) => {
    console.error(`Notification (${label}) not sent:`, e.message);
    return 0;
  });

const inspectionSubmitted = (inspectionId, actorId) =>
  safely("submitted", async () => {
    const t = await taskInfo(inspectionId);
    if (!t) return 0;
    const actor = await nameOf(actorId);
    const late = t.is_late ? " (late)" : "";
    const reviewerIds = await reviewers(t.sector_node_id);
    const toReviewers = await send(
      reviewerIds,
      { type: "INSPECTION_SUBMITTED", title: `Inspection submitted${late}`, message: `${actor} submitted ${what(t)}${t.team ? ` for ${t.team}` : ""}${late}.`, entityId: t.inspection_id },
      actorId,
    );
    const toTeam = await send(
      (await teamMembers(t.team_id)).filter((id) => !reviewerIds.includes(id)),
      { type: "INSPECTION_SUBMITTED", title: `Your team submitted an inspection${late}`, message: `${actor} submitted ${what(t)}${late}.`, entityId: t.inspection_id },
      actorId,
    );
    return toReviewers + toTeam;
  });

const inspectionReturned = (inspectionId, actorId, reason) =>
  safely("returned", async () => {
    const t = await taskInfo(inspectionId);
    if (!t) return 0;
    const actor = await nameOf(actorId);
    return send(
      await teamMembers(t.team_id),
      { type: "INSPECTION_RETURNED", title: "Returned for correction", message: `${actor} returned ${what(t)} for correction: ${String(reason).slice(0, 500)}`, entityId: t.inspection_id },
      actorId,
    );
  });

/** changes: { fromTeamId?, toTeamId?, dueChanged? } */
const inspectionReassigned = (inspectionId, actorId, { fromTeamId, toTeamId, dueChanged }) =>
  safely("reassigned", async () => {
    const t = await taskInfo(inspectionId);
    if (!t) return 0;
    let n = 0;
    if (toTeamId !== undefined) {
      n += await send(
        await teamMembers(toTeamId),
        { type: "INSPECTION_ASSIGNED", title: "New task for your team", message: `${what(t)} is now your team's task, due by ${lastDay(t.due_at)}.`, entityId: t.inspection_id },
        actorId,
      );
      if (fromTeamId)
        n += await send(
          await teamMembers(fromTeamId),
          { type: "INSPECTION_ASSIGNED", title: "Task given to another team", message: `${what(t)} was given to ${t.team ?? "no team"}.`, entityId: t.inspection_id },
          actorId,
        );
    } else if (dueChanged) {
      n += await send(
        await teamMembers(t.team_id),
        { type: "INSPECTION_ASSIGNED", title: "Due date changed", message: `${what(t)} is now due by ${lastDay(t.due_at)}.`, entityId: t.inspection_id },
        actorId,
      );
    }
    return n;
  });

const officeCompleted = (inspectionId, actorId, sections) =>
  safely("office", async () => {
    const t = await taskInfo(inspectionId);
    if (!t) return 0;
    const actor = await nameOf(actorId);
    return send(
      await reviewers(t.sector_node_id),
      { type: "INSPECTION_OFFICE_UPDATED", title: "Completed at the office", message: `${actor} filled in section ${sections.join(", ")} of ${what(t)} after submitting.`, entityId: t.inspection_id },
      actorId,
    );
  });

/** New tasks of one round (scheduleService): one summary per team. createdSince: when the tasks were created. */
const roundStarted = (scheduleId, occurrenceDate, createdSince) =>
  safely("round", async () => {
    const rows = await q(
      `SELECT i.team_id, COUNT(*)::int AS n, MIN(i.due_at) AS due_at, s.name AS schedule
         FROM inspections i JOIN inspection_schedules s ON s.schedule_id = i.schedule_id
        WHERE i.schedule_id = :scheduleId AND i.occurrence_date = :occurrenceDate AND i.created_at >= :createdSince AND i.team_id IS NOT NULL
        GROUP BY i.team_id, s.name`,
      { scheduleId, occurrenceDate, createdSince },
    );
    let n = 0;
    for (const r of rows)
      n += await send(await teamMembers(r.team_id), {
        type: "ROUND_STARTED",
        title: "New inspection tasks",
        message: `${r.n} new task${r.n === 1 ? "" : "s"} for your team (${r.schedule}), due by ${lastDay(r.due_at)}.`,
        entityType: "tasks",
      });
    return n;
  });

/** Daily: due within 2 days, and overdue. Each task is reminded once of each; one summary per team. */
const sendDueReminders = (now = new Date()) =>
  safely("reminders", async () => {
    let n = 0;
    const soon = new Date(now.getTime() + 2 * 86400e3);
    for (const [kind, where, column] of [
      ["soon", { due_at: { [Op.gt]: now, [Op.lte]: soon }, due_soon_notified_at: null }, "due_soon_notified_at"],
      ["overdue", { due_at: { [Op.lte]: now }, overdue_notified_at: null }, "overdue_notified_at"],
    ]) {
      const tasks = await db.Inspection.findAll({
        where: { ...where, status: { [Op.ne]: "submitted" }, team_id: { [Op.ne]: null } },
        attributes: ["inspection_id", "team_id", "due_at"],
        include: [{ model: db.Company, as: "company", attributes: ["name"] }],
      });
      const byTeam = new Map();
      for (const t of tasks) byTeam.set(t.team_id, [...(byTeam.get(t.team_id) || []), t]);
      for (const [teamId, list] of byTeam) {
        const one = list.length === 1;
        const names = list.slice(0, 3).map((t) => t.company?.name).filter(Boolean).join(", ") + (list.length > 3 ? ` and ${list.length - 3} more` : "");
        n += await send(await teamMembers(teamId), {
          type: kind === "soon" ? "INSPECTION_DUE_SOON" : "INSPECTION_OVERDUE",
          title: kind === "soon" ? (one ? "Task due soon" : `${list.length} tasks due soon`) : one ? "Task overdue" : `${list.length} tasks overdue`,
          message:
            kind === "soon"
              ? `Due by ${lastDay(list[0].due_at)}: ${names}.`
              : `Past the due date and not submitted: ${names}.`,
          entityType: one ? "inspection" : "tasks",
          entityId: one ? list[0].inspection_id : null,
        });
      }
      if (tasks.length) await db.Inspection.update({ [column]: now }, { where: { inspection_id: tasks.map((t) => t.inspection_id) } });
    }
    return n;
  });

module.exports = { inspectionSubmitted, inspectionReturned, inspectionReassigned, officeCompleted, roundStarted, sendDueReminders, teamMembers, reviewers };
