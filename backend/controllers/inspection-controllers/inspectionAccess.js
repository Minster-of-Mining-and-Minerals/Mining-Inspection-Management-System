/** Who may see and do what with an inspection (task). Shared by the inspection and file controllers. */
const { validate: isUuid } = require("uuid");
const { Inspection } = require("../../models");
const { currentMembership } = require("../../services/teamMembershipService");

const can = (req, action) => req.user.permissions.includes(`inspections:${action}`);

/** The signed-in user's current team id (cached on the request). */
const myTeamId = async (req) => {
  if (req._teamId === undefined) req._teamId = (await currentMembership(req.user.user_id))?.team_id ?? null;
  return req._teamId;
};

/**
 * Load a task the user may see; also says what they may do with it.
 * Seen by: inspections:read_all, or members of the task's team.
 */
const loadTask = async (req, id) => {
  if (!isUuid(id)) throw Object.assign(new Error("Invalid inspection id."), { status: 400 });
  const task = await Inspection.findByPk(id);
  if (!task) throw Object.assign(new Error("Inspection not found."), { status: 404 });
  const team = await myTeamId(req);
  const inTeam = !!team && task.team_id === team;
  if (!can(req, "read_all") && !inTeam) throw Object.assign(new Error("This inspection belongs to another team."), { status: 403 });
  return {
    task,
    rights: {
      fill: inTeam && can(req, "conduct") && task.status !== "submitted",
      return: can(req, "review") && task.status === "submitted",
      reassign: can(req, "assign") && task.status !== "submitted",
    },
  };
};

module.exports = { can, myTeamId, loadTask };
