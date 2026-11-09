"use strict";
const express = require("express");
const {
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
} = require("../../controllers/team-controllers/teamController");
const { authorize, authenticateToken } = require("../../middlewares/authMiddleware");
const { getMyTeam, getMyLicenses } = require("../../controllers/team-controllers/myTeamController");
const v = require("../../validators/team-validators/teamValidator");

/**
 * /api/teams
 *   GET    /mine                            the signed-in user's own team and members (any team member)
 *   GET    /mine/licenses                   its companies / licenses, forms scheduled, its results there
 *   GET    /?search=&is_active=            teams with current members
 *   GET    /assignable-users                staff who can be added to a team
 *   GET    /:id                             team, members (incl. history) and licenses
 *   POST   /                                create
 *   PUT    /:id                             name / code / description / is_active
 *   POST   /:id/members                     { user_id, role } add a user (one team per person)
 *   POST   /:id/licenses                    { license_ids } the team covers
 *   DELETE /:id/licenses/:licenseId
 * /api/team-members
 *   PUT    /:memberId                       { role }
 *   DELETE /:memberId                       leave the team (kept as history)
 * New users can also be put in a team directly from Create User (POST /api/users).
 */
const teams = express.Router();
// Own team: only needs a login; always the user's own team
teams.get("/mine", authenticateToken, getMyTeam);
teams.get("/mine/licenses", authenticateToken, getMyLicenses);
teams.get("/", authorize("teams", "read"), getTeams);
teams.get("/assignable-users", authorize("teams", "manage_members"), getAssignableUsers);
teams.get("/:id", authorize("teams", "read"), getTeamById);
teams.post("/", authorize("teams", "create"), v.validateCreateTeam, createTeam);
teams.put("/:id", authorize("teams", "update"), v.validateUpdateTeam, updateTeam);
teams.post("/:id/members", authorize("teams", "manage_members"), v.validateAddMember, addMember);
teams.post("/:id/licenses", authorize("teams", "update"), v.validateTeamLicenses, addTeamLicenses);
teams.delete("/:id/licenses/:licenseId", authorize("teams", "update"), removeTeamLicense);

const members = express.Router();
members.put("/:memberId", authorize("teams", "manage_members"), v.validateUpdateMember, updateMember);
members.delete("/:memberId", authorize("teams", "manage_members"), v.validateRemoveMember, removeMember);

module.exports = { teams, members };
