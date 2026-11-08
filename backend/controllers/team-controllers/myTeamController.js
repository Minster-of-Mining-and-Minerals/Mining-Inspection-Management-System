/**
 * What a field team sees about itself: its members, its companies and licenses, its progress.
 * Always the signed-in user's own team; no ids are taken from the request, so nobody can
 * look at another team this way. Inspections shown are only this team's.
 */
const { QueryTypes } = require("sequelize");
const { sequelize, TeamMember, User, InspectionSchedule } = require("../../models");
const { currentMembership } = require("../../services/teamMembershipService");
const { coveredLicenses } = require("../../services/scheduleService");
const { localToday } = require("../../utils/scheduleDates");

const fail = (res, status, message) => res.status(status).json({ success: false, message });
const q = (sql, replacements) => sequelize.query(sql, { replacements, type: QueryTypes.SELECT });

/** GET /api/teams/mine — the team, its leader and members with their contact details. */
const getMyTeam = async (req, res) => {
  try {
    const membership = await currentMembership(req.user.user_id);
    if (!membership) return res.status(200).json({ success: true, data: null });
    const team = membership.team;
    const members = await TeamMember.findAll({
      where: { team_id: team.team_id, left_on: null },
      include: [{ model: User, as: "user", attributes: ["user_id", "full_name", "email", "phone_number", "profile_image", "is_active"] }],
      order: [
        ["role", "ASC"], // leader first
        [{ model: User, as: "user" }, "full_name", "ASC"],
      ],
    });
    const [counts] = await q(
      `SELECT COUNT(DISTINCT l.license_id)::int AS licenses, COUNT(DISTINCT l.company_id)::int AS companies
         FROM team_licenses tl JOIN company_licenses l ON l.license_id = tl.license_id WHERE tl.team_id = :team`,
      { team: team.team_id },
    );
    return res.status(200).json({
      success: true,
      data: {
        team,
        my_role: membership.role,
        members: members.map((m) => ({ team_member_id: m.team_member_id, role: m.role, joined_on: m.joined_on, is_me: m.user_id === req.user.user_id, ...m.user?.toJSON() })),
        license_count: counts.licenses,
        company_count: counts.companies,
      },
    });
  } catch (error) {
    console.error("getMyTeam", error);
    return fail(res, 500, "Failed to fetch your team.");
  }
};

/**
 * GET /api/teams/mine/licenses — companies and licenses the team covers, with the forms
 * scheduled for each, the team's latest results there and the next open task.
 */
const getMyLicenses = async (req, res) => {
  try {
    const membership = await currentMembership(req.user.user_id);
    if (!membership) return res.status(200).json({ success: true, data: [] });
    const team = membership.team_id;
    const licenses = await q(
      `SELECT l.license_id, l.license_number, l.license_type, l.site_name, l.status, l.mineral_text, l.issued_on, l.expires_on,
              c.company_id, c.name AS company_name, c.name_am AS company_name_am, c.contact_person, c.contact_phone, c.phone, c.email, c.address,
              (SELECT string_agg(m.name, ', ' ORDER BY m.name) FROM license_minerals lm JOIN minerals m ON m.mineral_id = lm.mineral_id WHERE lm.license_id = l.license_id) AS minerals,
              (SELECT string_agg(a.name, ', ' ORDER BY a.name) FROM license_areas la JOIN admin_areas a ON a.area_id = la.area_id AND a.level = 'region' WHERE la.license_id = l.license_id) AS region,
              (SELECT string_agg(a.name, ', ' ORDER BY a.name) FROM license_areas la JOIN admin_areas a ON a.area_id = la.area_id AND a.level = 'zone' WHERE la.license_id = l.license_id) AS zone,
              (SELECT string_agg(a.name, ', ' ORDER BY a.name) FROM license_areas la JOIN admin_areas a ON a.area_id = la.area_id AND a.level = 'woreda' WHERE la.license_id = l.license_id) AS woreda
         FROM team_licenses tl
         JOIN company_licenses l ON l.license_id = tl.license_id
         JOIN companies c ON c.company_id = l.company_id
        WHERE tl.team_id = :team
        ORDER BY c.name, l.license_number`,
      { team },
    );
    if (!licenses.length) return res.status(200).json({ success: true, data: [] });
    const ids = licenses.map((l) => l.license_id);

    // This team's submitted inspections (latest 6 per license) and open tasks
    const [results, open] = await Promise.all([
      q(
        `SELECT * FROM (
           SELECT i.inspection_id, i.license_id, i.score, i.submitted_at, i.is_late, f.name AS form_name,
                  ROW_NUMBER() OVER (PARTITION BY i.license_id ORDER BY i.submitted_at DESC) AS rn
             FROM inspections i JOIN forms f ON f.form_id = i.form_id
            WHERE i.team_id = :team AND i.status = 'submitted' AND i.license_id IN (:ids)) x
          WHERE rn <= 6 ORDER BY submitted_at DESC`,
        { team, ids },
      ),
      q(
        `SELECT i.inspection_id, i.license_id, i.due_at, i.status, i.return_count, f.name AS form_name, (i.due_at < NOW()) AS is_overdue
           FROM inspections i JOIN forms f ON f.form_id = i.form_id
          WHERE i.team_id = :team AND i.status <> 'submitted' AND i.license_id IN (:ids)
          ORDER BY i.due_at`,
        { team, ids },
      ),
    ]);
    const counts = await q(
      `SELECT license_id, COUNT(*)::int AS n FROM inspections WHERE team_id = :team AND status = 'submitted' AND license_id IN (:ids) GROUP BY license_id`,
      { team, ids },
    );

    // Which active schedules cover each license
    const schedules = await InspectionSchedule.findAll({ where: { status: "active" }, include: [{ association: "form", attributes: ["form_id", "name", "name_am"] }] });
    const scheduled = new Map();
    for (const s of schedules) {
      const covered = new Set((await coveredLicenses(s)).map((l) => l.license_id));
      for (const id of ids)
        if (covered.has(id)) {
          if (!scheduled.has(id)) scheduled.set(id, []);
          scheduled.get(id).push({ schedule_id: s.schedule_id, schedule_name: s.name, form_id: s.form_id, form_name: s.form?.name, frequency: s.frequency, due_days: s.due_days });
        }
    }

    const by = (rows) => rows.reduce((m, r) => m.set(r.license_id, [...(m.get(r.license_id) || []), r]), new Map());
    const resultsBy = by(results);
    const openBy = by(open);
    const countBy = new Map(counts.map((c) => [c.license_id, c.n]));
    const today = localToday();
    return res.status(200).json({
      success: true,
      data: licenses.map((l) => {
        const r = (resultsBy.get(l.license_id) || []).map(({ rn, license_id, ...x }) => ({ ...x, score: x.score == null ? null : Number(x.score) }));
        return {
          ...l,
          expired: !!l.expires_on && String(l.expires_on).slice(0, 10) < today,
          forms: scheduled.get(l.license_id) || [],
          last_inspection: r[0] || null,
          recent_scores: r.map((x) => x.score).reverse(), // oldest → newest, for the trend
          inspection_count: countBy.get(l.license_id) || 0,
          open_tasks: (openBy.get(l.license_id) || []).map(({ license_id, ...x }) => x),
        };
      }),
    });
  } catch (error) {
    console.error("getMyLicenses", error);
    return fail(res, 500, "Failed to fetch your companies.");
  }
};

/** GET /api/inspections/my/stats — the team's and the signed-in member's progress. */
const getMyStats = async (req, res) => {
  try {
    const membership = await currentMembership(req.user.user_id);
    if (!membership) return res.status(200).json({ success: true, data: null });
    const team = membership.team_id;
    const me = req.user.user_id;
    const monthStart = `${localToday().slice(0, 7)}-01`;
    const stats = (where) =>
      q(
        `SELECT COUNT(*)::int AS tasks,
                COUNT(*) FILTER (WHERE status = 'submitted')::int AS submitted,
                COUNT(*) FILTER (WHERE status = 'submitted' AND NOT is_late)::int AS on_time,
                COUNT(*) FILTER (WHERE status = 'submitted' AND is_late)::int AS late,
                COUNT(*) FILTER (WHERE status <> 'submitted')::int AS open,
                COUNT(*) FILTER (WHERE status <> 'submitted' AND due_at < NOW())::int AS overdue,
                AVG(score) FILTER (WHERE status = 'submitted') AS avg_score
           FROM inspections WHERE team_id = :team ${where}`,
        { team, monthStart },
      ).then(([r]) => ({ ...r, avg_score: r.avg_score == null ? null : Number(r.avg_score) }));

    const [overall, month, [mine], weekly, byCompany, recent] = await Promise.all([
      stats(""),
      stats("AND occurrence_date >= :monthStart"),
      q(
        `SELECT COUNT(*) FILTER (WHERE status = 'submitted')::int AS submitted,
                COUNT(*) FILTER (WHERE status = 'submitted' AND is_late)::int AS late,
                AVG(score) FILTER (WHERE status = 'submitted') AS avg_score,
                (SELECT COUNT(*)::int FROM inspection_events r
                  WHERE r.type = 'returned' AND (
                    SELECT s.user_id FROM inspection_events s
                     WHERE s.inspection_id = r.inspection_id AND s.type = 'submitted' AND s.created_at <= r.created_at
                     ORDER BY s.created_at DESC LIMIT 1) = :me) AS returned
           FROM inspections WHERE team_id = :team AND submitted_by = :me`,
        { team, me },
      ),
      // submissions per week, last 8 weeks (Ethiopia time)
      q(
        `SELECT to_char(date_trunc('week', submitted_at AT TIME ZONE 'Africa/Addis_Ababa'), 'YYYY-MM-DD') AS week,
                COUNT(*)::int AS submitted, COUNT(*) FILTER (WHERE submitted_by = :me)::int AS mine
           FROM inspections
          WHERE team_id = :team AND status = 'submitted' AND submitted_at >= NOW() - INTERVAL '8 weeks'
          GROUP BY 1 ORDER BY 1`,
        { team, me },
      ),
      // latest scores per company (this team's inspections), oldest → newest
      q(
        `SELECT company_id, company_name, json_agg(score ORDER BY submitted_at) AS scores, MAX(submitted_at) AS last_at FROM (
           SELECT i.company_id, c.name AS company_name, i.score::float AS score, i.submitted_at,
                  ROW_NUMBER() OVER (PARTITION BY i.company_id ORDER BY i.submitted_at DESC) AS rn
             FROM inspections i JOIN companies c ON c.company_id = i.company_id
            WHERE i.team_id = :team AND i.status = 'submitted') x
          WHERE rn <= 6 GROUP BY company_id, company_name ORDER BY company_name`,
        { team },
      ),
      q(
        `SELECT i.inspection_id, i.submitted_at, i.score::float AS score, i.is_late, c.name AS company_name, l.license_number, f.name AS form_name, u.full_name AS submitted_by_name
           FROM inspections i
           JOIN companies c ON c.company_id = i.company_id
           JOIN company_licenses l ON l.license_id = i.license_id
           JOIN forms f ON f.form_id = i.form_id
           LEFT JOIN users u ON u.user_id = i.submitted_by
          WHERE i.team_id = :team AND i.status = 'submitted'
          ORDER BY i.submitted_at DESC LIMIT 10`,
        { team },
      ),
    ]);
    return res.status(200).json({
      success: true,
      data: {
        team: membership.team,
        overall,
        this_month: month,
        me: { ...mine, avg_score: mine.avg_score == null ? null : Number(mine.avg_score) },
        weekly,
        by_company: byCompany,
        recent,
      },
    });
  } catch (error) {
    console.error("getMyStats", error);
    return fail(res, 500, "Failed to fetch your progress.");
  }
};

module.exports = { getMyTeam, getMyLicenses, getMyStats };
