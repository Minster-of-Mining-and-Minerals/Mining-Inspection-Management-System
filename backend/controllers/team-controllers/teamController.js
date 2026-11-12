const { Op, literal } = require("sequelize");
const { validate: isUuid } = require("uuid");
const { sequelize, Team, TeamMember, TeamLicense, User, Role, Company, CompanyLicense, SectorNode } = require("../../models");
const { scopeWhere, inScope, findInScope, sectorForCreate } = require("../../services/sectorScope");
const { licenseAreasInclude, licenseMineralsInclude, pageParams, pageMeta } = require("../../services/companyQueryService");
const { addUserToTeam, ensureRole } = require("../../services/teamMembershipService");
const { likeContains, escapeLike } = require("../../utils/search");
const { naturalOrderSql } = require("../../utils/naturalOrder");

const fail = (res, status, message) => res.status(status).json({ success: false, message });
const today = () => new Date().toISOString().slice(0, 10);

const handleError = (res, error, fallback) => {
  if (error.status) return fail(res, error.status, error.message);
  if (error.name === "SequelizeUniqueConstraintError") {
    const constraint = error.parent?.constraint || "";
    if (constraint.includes("one_active_team")) return fail(res, 409, "This person is already in a team. A person can be in only one team.");
    // Unique per sector: the constraint lists sector_node_id first
    const field = Object.keys(error.fields || {}).find((f) => f !== "sector_node_id");
    return fail(res, 409, `A team with this ${field === "code" ? "code" : "name"} already exists.`);
  }
  console.error(fallback, error);
  return fail(res, 500, fallback);
};

const USER_ATTRS = ["user_id", "full_name", "email", "phone_number", "is_active"];

const memberInclude = (where) => ({
  model: TeamMember,
  as: "members",
  required: false,
  ...(where && { where }),
  include: [{ model: User, as: "user", attributes: USER_ATTRS }],
});

const sectorInclude = { model: SectorNode, as: "sector", attributes: ["sector_node_id", "name", "name_am"] };

const loadTeam = async (id, transaction) => {
  const team = await Team.findByPk(id, {
    include: [memberInclude(), sectorInclude],
    order: [
      [{ model: TeamMember, as: "members" }, "left_on", "DESC NULLS FIRST"],
      [{ model: TeamMember, as: "members" }, "role", "ASC"],
      [{ model: TeamMember, as: "members" }, "joined_on", "ASC"],
    ],
    transaction,
  });
  if (!team) return null;
  const licenses = await CompanyLicense.findAll({
    include: [
      { model: Team, as: "teams", where: { team_id: id }, attributes: [], through: { attributes: [] } },
      { model: Company, as: "company", attributes: ["company_id", "name", "name_am", "is_active"] },
      licenseMineralsInclude,
      licenseAreasInclude,
    ],
    order: [[{ model: Company, as: "company" }, "name", "ASC"], ["license_number", "ASC"]],
    transaction,
  });
  return { ...team.toJSON(), licenses };
};

/* =================== Teams =================== */
const getTeams = async (req, res) => {
  try {
    const { page, limit, offset } = pageParams(req.query, 50);
    const where = { ...scopeWhere(req) };
    if (req.query.is_active === "true" || req.query.is_active === "false") where.is_active = req.query.is_active === "true";
    if (req.query.search?.trim()) {
      const term = likeContains(req.query.search);
      // Team name / code, or the name of anyone currently in it
      where[Op.or] = [
        { name: { [Op.iLike]: term } },
        { code: { [Op.iLike]: term } },
        literal(`EXISTS (SELECT 1 FROM team_members tm JOIN users u ON u.user_id = tm.user_id
                 WHERE tm.team_id = "Team"."team_id" AND tm.left_on IS NULL AND u.full_name ILIKE ${sequelize.escape(term)})`),
      ];
    }
    const { count, rows } = await Team.findAndCountAll({
      where,
      attributes: {
        include: [[literal(`(SELECT COUNT(*)::int FROM team_licenses tl WHERE tl.team_id = "Team"."team_id")`), "license_count"]],
      },
      include: [memberInclude({ left_on: null }), sectorInclude],
      // By name, "Team 2" before "Team 10"
      order: [[literal(naturalOrderSql(`"Team"."name"`)), "ASC"]],
      distinct: true,
      limit,
      offset,
    });
    return res.status(200).json({ success: true, data: rows, meta: pageMeta(count, page, limit) });
  } catch (error) {
    return handleError(res, error, "Failed to fetch teams.");
  }
};

const getTeamById = async (req, res) => {
  try {
    if (!isUuid(req.params.id)) return fail(res, 400, "Invalid team id.");
    const team = await loadTeam(req.params.id);
    if (!team || !inScope(req, team.sector_node_id)) return fail(res, 404, "Team not found.");
    return res.status(200).json({ success: true, data: team });
  } catch (error) {
    return handleError(res, error, "Failed to fetch team.");
  }
};

/** Another team in the sector with the same name or code, ignoring case and extra spaces. */
const teamClash = async ({ name, code }, sectorId, exceptId) => {
  const tidy = (s) => String(s || "").replace(/\s+/g, " ").trim();
  const conditions = [];
  if (name !== undefined && tidy(name)) conditions.push({ name: { [Op.iLike]: escapeLike(tidy(name)) } });
  if (code !== undefined && tidy(code)) conditions.push({ code: { [Op.iLike]: escapeLike(tidy(code)) } });
  if (!conditions.length) return null;
  const other = await Team.findOne({
    where: { [Op.or]: conditions, sector_node_id: sectorId, ...(exceptId && { team_id: { [Op.ne]: exceptId } }) },
  });
  if (!other) return null;
  return tidy(other.name).toLowerCase() === tidy(name).toLowerCase()
    ? `A team called "${other.name}" already exists.`
    : `Team code "${other.code}" is already used by ${other.name}.`;
};

const createTeam = async (req, res) => {
  try {
    const sector_node_id = await sectorForCreate(req);
    const clash = await teamClash(req.body, sector_node_id);
    if (clash) return fail(res, 409, clash);
    const team = await Team.create({
      sector_node_id,
      name: req.body.name.trim().replace(/\s+/g, " "),
      code: req.body.code?.trim() || null,
      description: req.body.description?.trim() || null,
      created_by: req.user.user_id,
    });
    return res.status(201).json({ success: true, message: "Team created.", data: await loadTeam(team.team_id) });
  } catch (error) {
    return handleError(res, error, "Failed to create team.");
  }
};

const updateTeam = async (req, res) => {
  try {
    if (!isUuid(req.params.id)) return fail(res, 400, "Invalid team id.");
    const team = await findInScope(Team, req.params.id, req);
    if (!team) return fail(res, 404, "Team not found.");
    const clash = await teamClash(req.body, team.sector_node_id, team.team_id);
    if (clash) return fail(res, 409, clash);
    await team.update({
      ...(req.body.name !== undefined && { name: req.body.name.trim().replace(/\s+/g, " ") }),
      ...(req.body.code !== undefined && { code: req.body.code?.trim() || null }),
      ...(req.body.description !== undefined && { description: req.body.description?.trim() || null }),
      ...(req.body.is_active !== undefined && { is_active: req.body.is_active }),
    });
    return res.status(200).json({ success: true, message: "Team updated.", data: await loadTeam(team.team_id) });
  } catch (error) {
    return handleError(res, error, "Failed to update team.");
  }
};

/* =================== Members (always user accounts) =================== */
const findActiveMember = async (id, req) => {
  if (!isUuid(id)) throw Object.assign(new Error("Invalid member id."), { status: 400 });
  const member = await TeamMember.findByPk(id, {
    include: [
      { model: User, as: "user", attributes: USER_ATTRS },
      { model: Team, as: "team", attributes: ["team_id", "sector_node_id"] },
    ],
  });
  if (!member || !inScope(req, member.team?.sector_node_id)) throw Object.assign(new Error("Member not found."), { status: 404 });
  if (member.left_on) throw Object.assign(new Error("This person has already left the team."), { status: 400 });
  return member;
};

const addMember = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    if (!isUuid(req.params.id)) {
      await t.rollback();
      return fail(res, 400, "Invalid team id.");
    }
    if (!(await findInScope(Team, req.params.id, req, { transaction: t }))) {
      await t.rollback();
      return fail(res, 404, "Team not found.");
    }
    const { user_id, role = "member", joined_on } = req.body;
    await addUserToTeam({ teamId: req.params.id, userId: user_id, role, joinedOn: joined_on, createdBy: req.user.user_id, transaction: t });
    await t.commit();
    return res.status(201).json({ success: true, message: "Member added.", data: await loadTeam(req.params.id) });
  } catch (error) {
    if (!t.finished) await t.rollback();
    return handleError(res, error, "Failed to add member.");
  }
};

const updateMember = async (req, res) => {
  try {
    const member = await findActiveMember(req.params.memberId, req);
    await member.update({ role: req.body.role });
    if (req.body.role === "leader") await ensureRole(member.user_id, "team_leader", req.user.user_id);
    return res.status(200).json({ success: true, message: "Member updated.", data: await loadTeam(member.team_id) });
  } catch (error) {
    return handleError(res, error, "Failed to update member.");
  }
};

/** Leave the team: kept as history with the date they left. */
const removeMember = async (req, res) => {
  try {
    const member = await findActiveMember(req.params.memberId, req);
    const leftOn = req.body?.left_on || today();
    if (leftOn < member.joined_on) return fail(res, 400, "The leaving date can't be before the joining date.");
    await member.update({ left_on: leftOn, role: "member" });
    return res.status(200).json({ success: true, message: `${member.user?.full_name} removed from the team.`, data: await loadTeam(member.team_id) });
  } catch (error) {
    return handleError(res, error, "Failed to remove member.");
  }
};

/* =================== Licenses the team covers =================== */
const addTeamLicenses = async (req, res) => {
  try {
    if (!isUuid(req.params.id)) return fail(res, 400, "Invalid team id.");
    const team = await findInScope(Team, req.params.id, req);
    if (!team) return fail(res, 404, "Team not found.");
    const ids = [...new Set(req.body.license_ids)];
    // Only the team's own sector's licenses
    const found = await CompanyLicense.count({ where: { license_id: ids, sector_node_id: team.sector_node_id } });
    if (found !== ids.length) return fail(res, 400, "One or more licenses were not found.");
    await TeamLicense.bulkCreate(
      ids.map((license_id) => ({ team_id: team.team_id, license_id, created_by: req.user.user_id })),
      { ignoreDuplicates: true },
    );
    return res.status(200).json({ success: true, message: "Licenses added to the team.", data: await loadTeam(team.team_id) });
  } catch (error) {
    return handleError(res, error, "Failed to add licenses.");
  }
};

const removeTeamLicense = async (req, res) => {
  try {
    if (!isUuid(req.params.id) || !isUuid(req.params.licenseId)) return fail(res, 400, "Invalid id.");
    if (!(await findInScope(Team, req.params.id, req))) return fail(res, 404, "Team not found.");
    const removed = await TeamLicense.destroy({ where: { team_id: req.params.id, license_id: req.params.licenseId } });
    if (!removed) return fail(res, 404, "This license is not assigned to the team.");
    return res.status(200).json({ success: true, message: "License removed from the team.", data: await loadTeam(req.params.id) });
  } catch (error) {
    return handleError(res, error, "Failed to remove license.");
  }
};

/* =================== People who can be added: active internal staff, with their current team =================== */
const getAssignableUsers = async (req, res) => {
  try {
    // People of the team's sector (?team_id=), else of the request's sector
    let sectorWhere = scopeWhere(req);
    if (req.query.team_id) {
      if (!isUuid(req.query.team_id)) return fail(res, 400, "Invalid team id.");
      const team = await findInScope(Team, req.query.team_id, req);
      if (!team) return fail(res, 404, "Team not found.");
      sectorWhere = { sector_node_id: team.sector_node_id };
    }
    const where = { is_active: true, ...sectorWhere };
    if (req.query.search?.trim()) {
      const term = likeContains(req.query.search);
      where[Op.or] = [{ full_name: { [Op.iLike]: term } }, { email: { [Op.iLike]: term } }];
    }
    const users = await User.findAll({
      where,
      attributes: USER_ATTRS,
      include: [
        // Not the admin account(s): only people who do field work or supervise it
        {
          model: Role,
          as: "roles",
          attributes: ["name"],
          through: { attributes: [], where: { is_active: true } },
          where: { name: ["inspector", "team_leader", "supervisor"], is_active: true },
        },
        {
          model: TeamMember,
          as: "teamMemberships",
          required: false,
          where: { left_on: null },
          attributes: ["team_member_id", "role"],
          include: [{ model: Team, as: "team", attributes: ["team_id", "name"] }],
        },
      ],
      order: [["full_name", "ASC"]],
      limit: 300,
    });
    const data = users.map((u) => {
      const { teamMemberships, roles, ...rest } = u.toJSON();
      return { ...rest, current_team: teamMemberships?.[0]?.team ?? null };
    });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return handleError(res, error, "Failed to fetch users.");
  }
};

module.exports = {
  getTeams,
  getTeamById,
  createTeam,
  updateTeam,
  addMember,
  updateMember,
  removeMember,
  addTeamLicenses,
  removeTeamLicense,
  getAssignableUsers,
};
