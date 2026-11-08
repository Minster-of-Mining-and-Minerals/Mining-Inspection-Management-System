/**
 * Adding people to teams, shared by Create User, the team page and the import.
 * Rules:
 *   - a team member is a user account, active, in at most one team at a time;
 *   - joining a team gives the inspector role; leading it also gives team_leader;
 *   - a team has at most one leader.
 */
const { v4: uuidv4 } = require("uuid");
const { Team, TeamMember, User, Role, UserRoles } = require("../models");

const fail = (status, message) => Object.assign(new Error(message), { status });
const today = () => new Date().toISOString().slice(0, 10);

/** Give a user a role if they don't have it (re-activate it if it was switched off). */
const ensureRole = async (userId, roleName, assignedBy, transaction) => {
  const role = await Role.findOne({ where: { name: roleName, is_active: true }, transaction });
  if (!role) return;
  const existing = await UserRoles.findOne({ where: { user_id: userId, role_id: role.role_id }, transaction });
  if (existing) {
    if (!existing.is_active) await existing.update({ is_active: true }, { transaction });
    return;
  }
  await UserRoles.create(
    { user_role_id: uuidv4(), user_id: userId, role_id: role.role_id, assigned_by: assignedBy, assigned_at: new Date(), is_active: true },
    { transaction },
  );
};

/** The user's current (active) membership, with its team, or null. */
const currentMembership = (userId, transaction) =>
  TeamMember.findOne({
    where: { user_id: userId, left_on: null },
    include: [{ model: Team, as: "team", attributes: ["team_id", "name", "code", "is_active"] }],
    transaction,
  });

/**
 * Put a user in a team.
 * @returns {Promise<TeamMember>}
 * @throws {status, message} 400/404/409 with a message for the person using the app
 */
const addUserToTeam = async ({ teamId, userId, role = "member", joinedOn, createdBy = null, transaction }) => {
  const team = await Team.findByPk(teamId, { transaction });
  if (!team) throw fail(404, "Team not found.");
  if (!team.is_active) throw fail(400, `${team.name} is inactive.`);

  const user = await User.findByPk(userId, { attributes: ["user_id", "full_name", "is_active"], transaction });
  if (!user) throw fail(400, "User not found.");
  if (!user.is_active) throw fail(400, `${user.full_name}'s account is inactive.`);

  const current = await currentMembership(userId, transaction);
  if (current) {
    throw current.team_id === teamId
      ? fail(409, `${user.full_name} is already in ${team.name}.`)
      : fail(409, `${user.full_name} is already in ${current.team?.name}. A person can be in only one team; remove them from ${current.team?.name} first.`);
  }
  if (role === "leader") {
    const leader = await TeamMember.findOne({ where: { team_id: teamId, left_on: null, role: "leader" }, transaction });
    if (leader) throw fail(409, `${team.name} already has a leader. Make the current leader a member first.`);
  }

  const member = await TeamMember.create(
    { team_id: teamId, user_id: userId, role, joined_on: joinedOn || today(), created_by: createdBy },
    { transaction },
  );
  await ensureRole(userId, "inspector", createdBy, transaction);
  if (role === "leader") await ensureRole(userId, "team_leader", createdBy, transaction);
  return member;
};

module.exports = { addUserToTeam, ensureRole, currentMembership };
