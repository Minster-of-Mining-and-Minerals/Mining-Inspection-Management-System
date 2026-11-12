/**
 * Director's dashboard: numbers behind the charts.
 *
 *   GET /api/dashboard/analytics?from=&to=&team_id=&submitted_by=&form_id=&schedule_id=&company_id=&license_type=&region_id=
 *
 * Two kinds of numbers, both for the chosen period:
 *   - workload: tasks whose round opened in the period (due, submitted, overdue, completion)
 *   - results:  inspections submitted in the period (on time, scores, answers, regions, companies)
 * Results are compared with the period of the same length just before.
 *
 * Sector users see their sector. Central users see every sector combined (plus a by_sector
 * breakdown), or one sector when the sector switcher sends X-Sector-Id.
 */
const { QueryTypes } = require("sequelize");
const { validate: isUuid } = require("uuid");
const { sequelize, FormVersion } = require("../../models");
const { scopeSql } = require("../../services/sectorScope");
const { byNaturalName } = require("../../utils/naturalOrder");
const { visibleStructure } = require("../../utils/formAnswers");
const { statusOptionsFor, questionText } = require("../../utils/formDefinition");

const fail = (res, status, message) => res.status(status).json({ success: false, message });
const q = (sql, replacements) => sequelize.query(sql, { replacements, type: QueryTypes.SELECT });
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_DAY = (col) => `(${col} AT TIME ZONE 'Africa/Addis_Ababa')::date`;
const MAX_ANSWER_SCAN = 3000;

const dayShift = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400e3).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400e3);

/** The license's region name (from its woreda / zone / region). */
const REGION_OF = `(SELECT CASE a.level WHEN 'region' THEN a.name WHEN 'zone' THEN p.name ELSE g.name END
                      FROM license_areas la JOIN admin_areas a ON a.area_id = la.area_id
                      LEFT JOIN admin_areas p ON p.area_id = a.parent_id
                      LEFT JOIN admin_areas g ON g.area_id = p.parent_id
                     WHERE la.license_id = i.license_id
                     ORDER BY a.level = 'woreda' DESC, a.level = 'zone' DESC LIMIT 1)`;

/** …and its id (for links to that region's inspections). */
const REGION_ID_OF = REGION_OF.replace("CASE a.level WHEN 'region' THEN a.name WHEN 'zone' THEN p.name ELSE g.name END", "CASE a.level WHEN 'region' THEN a.area_id WHEN 'zone' THEN p.area_id ELSE g.area_id END");

/** Filters that apply to both kinds of numbers (always limited to the request's sector). */
const commonFilters = (query, req) => {
  const where = [scopeSql(req, "i")];
  const r = {};
  for (const [param, column] of [
    ["team_id", "i.team_id"],
    ["form_id", "i.form_id"],
    ["schedule_id", "i.schedule_id"],
    ["company_id", "i.company_id"],
  ]) {
    if (query[param] && isUuid(query[param])) {
      where.push(`${column} = :${param}`);
      r[param] = query[param];
    }
  }
  if (["exploration", "mining"].includes(query.license_type)) {
    where.push("l.license_type = :license_type");
    r.license_type = query.license_type;
  }
  if (query.region_id && isUuid(query.region_id)) {
    where.push(`EXISTS (SELECT 1 FROM license_areas la JOIN admin_areas a ON a.area_id = la.area_id
                LEFT JOIN admin_areas p ON p.area_id = a.parent_id LEFT JOIN admin_areas g ON g.area_id = p.parent_id
                WHERE la.license_id = i.license_id AND :region_id IN (a.area_id, p.area_id, g.area_id))`);
    r.region_id = query.region_id;
  }
  return { where, r };
};

const FROM = "FROM inspections i JOIN company_licenses l ON l.license_id = i.license_id";

const getAnalytics = async (req, res) => {
  try {
    const query = req.query;
    const from = DATE.test(query.from || "") ? query.from : null;
    const to = DATE.test(query.to || "") ? query.to : null;
    const { where, r } = commonFilters(query, req);
    const by = query.submitted_by && isUuid(query.submitted_by) ? query.submitted_by : null;

    // ---- workload: tasks whose round opened in the period ----
    const taskWhere = [...where];
    if (from) taskWhere.push("i.occurrence_date >= :from");
    if (to) taskWhere.push("i.occurrence_date <= :to");
    const tw = taskWhere.length ? `WHERE ${taskWhere.join(" AND ")}` : "";

    // ---- results: inspections submitted in the period (optionally a previous period) ----
    const subWhere = (f, t) => {
      const w = [...where, "i.status = 'submitted'"];
      if (f) w.push(`${LOCAL_DAY("i.submitted_at")} >= '${f}'`);
      if (t) w.push(`${LOCAL_DAY("i.submitted_at")} <= '${t}'`);
      if (by) w.push("i.submitted_by = :submitted_by");
      return `WHERE ${w.join(" AND ")}`;
    };
    const sw = subWhere(from, to);
    const prev = from && to ? { from: dayShift(from, -(daysBetween(from, to) + 1)), to: dayShift(from, -1) } : null;
    const rr = { ...r, from, to, submitted_by: by };

    const resultsOf = (w) =>
      q(
        `SELECT COUNT(*)::int AS submitted,
                COUNT(*) FILTER (WHERE NOT i.is_late)::int AS on_time,
                COUNT(*) FILTER (WHERE i.is_late)::int AS late,
                AVG(i.score)::float AS avg_score,
                COUNT(DISTINCT i.company_id)::int AS companies,
                COUNT(DISTINCT i.license_id)::int AS licenses,
                COUNT(*) FILTER (WHERE i.return_count > 0)::int AS returned,
                COUNT(*) FILTER (WHERE (i.submit_location->>'lat') IS NULL)::int AS no_location
           ${FROM} ${w}`,
        rr,
      ).then(([x]) => x);

    // Central users looking at every sector: the same headline numbers per sector
    const bySector =
      req.scope.isCentral && !req.scope.sectorId
        ? q(
            `SELECT s.sector_node_id, s.name AS sector, s.name_am AS sector_am,
                    COUNT(i.inspection_id) FILTER (WHERE ${taskWhere.length ? taskWhere.join(" AND ") : "TRUE"})::int AS due,
                    COUNT(i.inspection_id) FILTER (WHERE (${taskWhere.length ? taskWhere.join(" AND ") : "TRUE"}) AND i.status = 'submitted')::int AS completed,
                    COUNT(i.inspection_id) FILTER (WHERE ${sw.replace(/^WHERE /, "")})::int AS submitted,
                    COUNT(i.inspection_id) FILTER (WHERE (${sw.replace(/^WHERE /, "")}) AND i.is_late)::int AS late,
                    AVG(i.score) FILTER (WHERE ${sw.replace(/^WHERE /, "")})::float AS avg_score,
                    COUNT(i.inspection_id) FILTER (WHERE (${taskWhere.length ? taskWhere.join(" AND ") : "TRUE"}) AND i.status <> 'submitted' AND i.due_at < NOW())::int AS overdue
               FROM sector_nodes s
               LEFT JOIN (inspections i JOIN company_licenses l ON l.license_id = i.license_id) ON i.sector_node_id = s.sector_node_id
              WHERE s.parent_id IS NOT NULL AND s.deleted_at IS NULL AND s.is_active
              GROUP BY 1, 2, 3 ORDER BY s.name`,
            rr,
          )
        : Promise.resolve(null);

    const [workload, results, previous, weekly, byRegion, teamTasks, teamResults, companies, sectors] = await Promise.all([
      q(
        `SELECT COUNT(*)::int AS due,
                COUNT(*) FILTER (WHERE i.status = 'submitted')::int AS submitted,
                COUNT(*) FILTER (WHERE i.status <> 'submitted' AND i.due_at < NOW())::int AS overdue,
                COUNT(*) FILTER (WHERE i.status <> 'submitted' AND i.due_at >= NOW())::int AS open,
                COUNT(*) FILTER (WHERE i.team_id IS NULL AND i.status <> 'submitted')::int AS no_team
           ${FROM} ${tw}`,
        rr,
      ).then(([x]) => x),
      resultsOf(sw),
      prev ? resultsOf(subWhere(prev.from, prev.to)) : Promise.resolve(null),
      q(
        `SELECT to_char(date_trunc('week', i.submitted_at AT TIME ZONE 'Africa/Addis_Ababa'), 'YYYY-MM-DD') AS week,
                COUNT(*) FILTER (WHERE NOT i.is_late)::int AS on_time,
                COUNT(*) FILTER (WHERE i.is_late)::int AS late,
                AVG(i.score)::float AS avg_score
           ${FROM} ${sw} GROUP BY 1 ORDER BY 1`,
        rr,
      ),
      q(
        `SELECT COALESCE(${REGION_OF}, 'Region not recorded') AS region, ${REGION_ID_OF} AS region_id, COUNT(*)::int AS submitted, AVG(i.score)::float AS avg_score
           ${FROM} ${sw} GROUP BY 1, 2 ORDER BY avg_score ASC NULLS LAST`,
        rr,
      ),
      q(
        `SELECT COALESCE(t.name, 'No team') AS team, i.team_id,
                COUNT(*)::int AS due,
                COUNT(*) FILTER (WHERE i.status = 'submitted')::int AS submitted,
                COUNT(*) FILTER (WHERE i.status <> 'submitted' AND i.due_at < NOW())::int AS overdue
           ${FROM} LEFT JOIN teams t ON t.team_id = i.team_id ${tw} GROUP BY 1, 2`,
        rr,
      ),
      q(
        `SELECT i.team_id, COUNT(*)::int AS submitted_in_period, COUNT(*) FILTER (WHERE NOT i.is_late)::int AS on_time, AVG(i.score)::float AS avg_score
           ${FROM} ${sw} GROUP BY 1`,
        rr,
      ),
      q(
        `SELECT i.company_id, c.name AS company, COUNT(*)::int AS submitted, AVG(i.score)::float AS avg_score,
                (ARRAY_AGG(i.score::float ORDER BY i.submitted_at DESC))[1] AS last_score,
                (ARRAY_AGG(i.score::float ORDER BY i.submitted_at ASC)) AS scores
           ${FROM} JOIN companies c ON c.company_id = i.company_id ${sw}
          GROUP BY 1, 2 HAVING AVG(i.score) IS NOT NULL ORDER BY avg_score ASC LIMIT 10`,
        rr,
      ),
      bySector,
    ]);

    // Teams: workload + results side by side
    const resultsByTeam = new Map(teamResults.map((x) => [x.team_id, x]));
    const teams = teamTasks
      .map((t) => ({ ...t, ...(resultsByTeam.get(t.team_id) || { submitted_in_period: 0, on_time: 0, avg_score: null }) }))
      // By team name (Team 2 before Team 10); "No team" last
      .sort(byNaturalName((t) => (t.team_id ? t.team : null)));

    // ---- answers: distribution, sections, most frequent "not met" (from the answers themselves) ----
    const rows = await q(
      `SELECT i.answers, i.form_version_id, l.license_type, f.name AS form_name
         ${FROM} JOIN forms f ON f.form_id = i.form_id ${sw} AND i.form_version_id IS NOT NULL
        ORDER BY i.submitted_at DESC LIMIT ${MAX_ANSWER_SCAN}`,
      rr,
    );
    const versions = new Map(
      (await FormVersion.findAll({ where: { version_id: [...new Set(rows.map((x) => x.form_version_id))] }, attributes: ["version_id", "definition"] })).map((v) => [v.version_id, v.definition]),
    );
    const dist = { met: 0, partial: 0, not_met: 0, not_counted: 0 };
    const sections = new Map(); // form|section -> { form, section, points, possible }
    const questions = new Map(); // form|key -> { form, section, question, answered, not_met }
    for (const row of rows) {
      const def = versions.get(row.form_version_id);
      if (!def) continue;
      for (const { section, fields } of visibleStructure(def, row.license_type, row.answers || {})) {
        for (const f of fields) {
          if (f.type !== "status") continue;
          const a = row.answers?.[f.key];
          if (!a?.value) continue;
          const options = statusOptionsFor(def, f);
          const o = options.find((x) => x.value === a.value);
          if (!o) continue;
          const best = Math.max(0, ...options.map((x) => x.score ?? 0));
          const kind = o.score == null ? "not_counted" : o.score >= best && best > 0 ? "met" : o.score === 0 ? "not_met" : "partial";
          dist[kind]++;
          const sk = `${row.form_name}|${section.key}`;
          if (!sections.has(sk)) sections.set(sk, { form: row.form_name, section: `${section.number ? section.number + ". " : ""}${section.title_am || section.title}`, points: 0, possible: 0, answers: 0 });
          const s = sections.get(sk);
          if (o.score != null && best > 0) {
            s.points += o.score;
            s.possible += best;
          }
          s.answers++;
          const qk = `${row.form_name}|${f.key}`;
          if (!questions.has(qk)) questions.set(qk, { form: row.form_name, section: s.section, question: questionText(f), answered: 0, not_met: 0 });
          const qq = questions.get(qk);
          qq.answered++;
          if (kind === "not_met") qq.not_met++;
        }
      }
    }
    const sectionScores = [...sections.values()]
      .filter((s) => s.possible > 0)
      .map((s) => ({ form: s.form, section: s.section, score: s.points / s.possible, answers: s.answers }))
      .sort((a, b) => a.score - b.score);
    const topNotMet = [...questions.values()]
      .filter((x) => x.not_met > 0)
      .map((x) => ({ ...x, rate: x.not_met / x.answered }))
      .sort((a, b) => b.not_met - a.not_met || b.rate - a.rate)
      .slice(0, 10);

    return res.status(200).json({
      success: true,
      data: {
        period: { from, to, previous: prev },
        workload,
        results,
        previous,
        weekly,
        by_region: byRegion,
        teams,
        lowest_companies: companies,
        by_sector: sectors,
        answers: { distribution: dist, sections: sectionScores, top_not_met: topNotMet, scanned: rows.length, limited: rows.length >= MAX_ANSWER_SCAN },
      },
    });
  } catch (error) {
    console.error("getAnalytics", error);
    return fail(res, 500, "Failed to load the dashboard.");
  }
};

module.exports = { getAnalytics };
