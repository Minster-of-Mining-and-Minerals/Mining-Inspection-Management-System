const { QueryTypes } = require("sequelize");
const { validate: isUuid } = require("uuid");
const { sequelize, InspectionSchedule, ScheduleLicense, Inspection, Form, FormVersion, CompanyLicense, Company } = require("../../models");
const { coveredLicenses, generateForSchedule } = require("../../services/scheduleService");
const { localToday, nextOccurrences, dueAtFor, lastOccurrenceOnOrBefore } = require("../../utils/scheduleDates");

const fail = (res, status, message, extra) => res.status(status).json({ success: false, message, ...extra });

const SCHEDULE_FIELDS = ["form_id", "name", "target_type", "license_type", "frequency", "interval_days", "weekdays", "month_day", "start_date", "end_date", "due_days", "status", "notes"];

/** Tidy the fields that only matter for some frequencies / targets. */
const normalize = (body) => {
  const s = { ...body };
  if (s.frequency !== "every_n_days") s.interval_days = null;
  if (!["daily", "weekly"].includes(s.frequency)) s.weekdays = null;
  if (!["monthly", "quarterly", "yearly"].includes(s.frequency)) s.month_day = null;
  if (s.frequency === "once") s.end_date = null;
  if (s.target_type !== "license_type") s.license_type = null;
  return s;
};

/** Counts of tasks per status for one occurrence, or for every occurrence of the given schedules. */
const taskStats = async (scheduleIds, occurrenceBySchedule) => {
  if (!scheduleIds.length) return new Map();
  const rows = await sequelize.query(
    `SELECT schedule_id, occurrence_date,
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status = 'submitted')::int AS submitted,
            COUNT(*) FILTER (WHERE status = 'submitted' AND is_late)::int AS late,
            COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
            COUNT(*) FILTER (WHERE status <> 'submitted' AND due_at < NOW())::int AS overdue,
            COUNT(*) FILTER (WHERE team_id IS NULL AND status <> 'submitted')::int AS no_team,
            MIN(due_at) AS due_at
       FROM inspections WHERE schedule_id IN (:ids)
      GROUP BY schedule_id, occurrence_date
      ORDER BY occurrence_date DESC`,
    { replacements: { ids: scheduleIds }, type: QueryTypes.SELECT },
  );
  const m = new Map();
  for (const r of rows) {
    if (!m.has(r.schedule_id)) m.set(r.schedule_id, []);
    m.get(r.schedule_id).push(r);
  }
  return m;
};

const describe = (s, statsRows = []) => {
  const plain = s.get ? s.get({ plain: true }) : s;
  const today = localToday();
  const upcoming = plain.status === "active" ? nextOccurrences(plain, today, 3) : [];
  return {
    ...plain,
    current: statsRows[0] || null, // the latest occurrence with tasks
    occurrence_count: statsRows.length,
    totals: statsRows.reduce(
      (t, r) => ({ total: t.total + r.total, submitted: t.submitted + r.submitted, late: t.late + r.late, overdue: t.overdue + r.overdue }),
      { total: 0, submitted: 0, late: 0, overdue: 0 },
    ),
    next_dates: upcoming.filter((d) => d > (statsRows[0]?.occurrence_date ?? "")),
  };
};

const checkForm = async (formId) => {
  if (!isUuid(formId)) return "Choose a form.";
  const form = await Form.findByPk(formId);
  if (!form) return "Form not found.";
  if (!form.is_active) return "This form is inactive. Activate it first.";
  const published = await FormVersion.count({ where: { form_id: formId, status: "published" } });
  if (!published) return "Publish the form before scheduling it.";
  return null;
};

const setLicenses = async (scheduleId, licenseIds, transaction) => {
  await ScheduleLicense.destroy({ where: { schedule_id: scheduleId }, transaction });
  const ids = [...new Set(licenseIds || [])];
  if (!ids.length) return;
  const found = await CompanyLicense.count({ where: { license_id: ids }, transaction });
  if (found !== ids.length) throw Object.assign(new Error("Some of the chosen licenses no longer exist."), { status: 400 });
  await ScheduleLicense.bulkCreate(ids.map((license_id) => ({ schedule_id: scheduleId, license_id })), { transaction });
};

/* =================== list / one =================== */
const getSchedules = async (req, res) => {
  try {
    const where = {};
    if (req.query.form_id && isUuid(req.query.form_id)) where.form_id = req.query.form_id;
    if (req.query.status) where.status = req.query.status;
    const schedules = await InspectionSchedule.findAll({
      where,
      include: [{ model: Form, as: "form", attributes: ["form_id", "name", "name_am", "code"] }],
      order: [
        ["status", "ASC"],
        ["name", "ASC"],
      ],
    });
    const stats = await taskStats(schedules.map((s) => s.schedule_id));
    const counts = await Promise.all(schedules.map((s) => coveredLicenses(s).then((l) => l.length)));
    return res.status(200).json({
      success: true,
      data: schedules.map((s, i) => ({ ...describe(s, stats.get(s.schedule_id)), license_count: counts[i] })),
    });
  } catch (error) {
    console.error("getSchedules", error);
    return fail(res, 500, "Failed to fetch schedules.");
  }
};

const getScheduleById = async (req, res) => {
  try {
    if (!isUuid(req.params.id)) return fail(res, 400, "Invalid schedule id.");
    const s = await InspectionSchedule.findByPk(req.params.id, {
      include: [
        { model: Form, as: "form", attributes: ["form_id", "name", "name_am", "code"] },
        {
          model: CompanyLicense,
          as: "licenses",
          attributes: ["license_id", "license_number", "license_type", "site_name"],
          through: { attributes: [] },
          include: [{ model: Company, as: "company", attributes: ["company_id", "name"] }],
        },
      ],
    });
    if (!s) return fail(res, 404, "Schedule not found.");
    const stats = await taskStats([s.schedule_id]);
    const covered = await coveredLicenses(s);
    return res.status(200).json({
      success: true,
      data: {
        ...describe(s, stats.get(s.schedule_id)),
        license_count: covered.length,
        licenses_without_team: covered.filter((l) => !l.team_id).length,
        occurrences: (stats.get(s.schedule_id) || []).slice(0, 60),
      },
    });
  } catch (error) {
    console.error("getScheduleById", error);
    return fail(res, 500, "Failed to fetch the schedule.");
  }
};

/** What a schedule would do: how many licenses, the next dates and when they're due. */
const previewSchedule = async (req, res) => {
  try {
    const s = normalize(req.body);
    const formProblem = await checkForm(s.form_id);
    if (formProblem) return fail(res, 400, formProblem);
    const licenses = await coveredLicenses({ ...s, schedule_id: null });
    const today = localToday();
    const dates = nextOccurrences(s, lastOccurrenceOnOrBefore(s, today) ?? s.start_date, 5);
    return res.status(200).json({
      success: true,
      data: {
        license_count: licenses.length,
        licenses_without_team: licenses.filter((l) => !l.team_id).length,
        next: dates.map((d) => ({ opens: d, due_at: dueAtFor(s, d) })),
      },
    });
  } catch (error) {
    console.error("previewSchedule", error);
    return fail(res, 500, "Failed to preview the schedule.");
  }
};

/* =================== create / update / delete =================== */
const createSchedule = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const s = normalize(req.body);
    const formProblem = await checkForm(s.form_id);
    if (formProblem) {
      await transaction.rollback();
      return fail(res, 400, formProblem);
    }
    const schedule = await InspectionSchedule.create(
      { ...Object.fromEntries(SCHEDULE_FIELDS.map((k) => [k, s[k]])), status: "active", created_by: req.user.user_id },
      { transaction },
    );
    if (s.target_type === "licenses") await setLicenses(schedule.schedule_id, s.license_ids, transaction);
    await transaction.commit();
    const created = await generateForSchedule(schedule);
    return res.status(201).json({ success: true, message: created ? `Schedule saved. ${created} task(s) created for today.` : "Schedule saved.", data: { schedule_id: schedule.schedule_id, tasks_created: created } });
  } catch (error) {
    await transaction.rollback();
    if (error.status) return fail(res, error.status, error.message);
    console.error("createSchedule", error);
    return fail(res, 500, "Failed to save the schedule.");
  }
};

/** Changes apply to tasks created from now on; existing tasks keep their dates and team. */
const updateSchedule = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    if (!isUuid(req.params.id)) {
      await transaction.rollback();
      return fail(res, 400, "Invalid schedule id.");
    }
    const schedule = await InspectionSchedule.findByPk(req.params.id, { transaction });
    if (!schedule) {
      await transaction.rollback();
      return fail(res, 404, "Schedule not found.");
    }
    const merged = normalize({ ...schedule.get({ plain: true }), ...req.body });
    if (req.body.form_id && req.body.form_id !== schedule.form_id) {
      const used = await Inspection.count({ where: { schedule_id: schedule.schedule_id }, transaction });
      if (used) {
        await transaction.rollback();
        return fail(res, 409, "This schedule already has tasks, so its form can't change. End it and create a new schedule.");
      }
      const formProblem = await checkForm(req.body.form_id);
      if (formProblem) {
        await transaction.rollback();
        return fail(res, 400, formProblem);
      }
    }
    if (merged.status === "ended" && schedule.status !== "ended") merged.end_date = merged.end_date && merged.end_date < localToday() ? merged.end_date : localToday();
    if (schedule.status === "ended" && merged.status === "active" && merged.end_date && merged.end_date < localToday()) {
      await transaction.rollback();
      return fail(res, 400, "The end date has passed. Change it before restarting the schedule.");
    }
    await schedule.update(Object.fromEntries(SCHEDULE_FIELDS.map((k) => [k, merged[k]])), { transaction });
    if (merged.target_type === "licenses" && req.body.license_ids) await setLicenses(schedule.schedule_id, req.body.license_ids, transaction);
    if (merged.target_type !== "licenses") await ScheduleLicense.destroy({ where: { schedule_id: schedule.schedule_id }, transaction });
    await transaction.commit();
    const created = await generateForSchedule(schedule);
    return res.status(200).json({ success: true, message: created ? `Schedule saved. ${created} new task(s) created.` : "Schedule saved.", data: { schedule_id: schedule.schedule_id, tasks_created: created } });
  } catch (error) {
    await transaction.rollback();
    if (error.status) return fail(res, error.status, error.message);
    console.error("updateSchedule", error);
    return fail(res, 500, "Failed to save the schedule.");
  }
};

/** Only while nothing has been filled in; otherwise end the schedule (its history stays). */
const deleteSchedule = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    if (!isUuid(req.params.id)) {
      await transaction.rollback();
      return fail(res, 400, "Invalid schedule id.");
    }
    const schedule = await InspectionSchedule.findByPk(req.params.id, { transaction });
    if (!schedule) {
      await transaction.rollback();
      return fail(res, 404, "Schedule not found.");
    }
    const started = await Inspection.count({ where: { schedule_id: schedule.schedule_id, status: ["in_progress", "submitted"] }, transaction });
    if (started) {
      await transaction.rollback();
      return fail(res, 409, `Teams have already worked on ${started} task(s) of this schedule. End the schedule instead; its inspections stay in the history.`);
    }
    await Inspection.destroy({ where: { schedule_id: schedule.schedule_id }, transaction });
    await schedule.destroy({ transaction });
    await transaction.commit();
    return res.status(200).json({ success: true, message: "Schedule deleted." });
  } catch (error) {
    await transaction.rollback();
    console.error("deleteSchedule", error);
    return fail(res, 500, "Failed to delete the schedule.");
  }
};

module.exports = { getSchedules, getScheduleById, previewSchedule, createSchedule, updateSchedule, deleteSchedule };
