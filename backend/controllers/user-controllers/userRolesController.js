const { User, Role, UserRoles } = require("../../models");
const { v4: uuidv4, validate: isUuid } = require("uuid");
const { scopeWhere } = require("../../services/sectorScope");
const { assertAssignableRoles, assertCanManageUser } = require("../../services/userAccessService");

/** A user in the request's sector (central: any), or null. */
const findUserInScope = (req, userId) =>
  isUuid(String(userId)) ? User.findOne({ where: { user_id: userId, ...scopeWhere(req) } }) : null;

const assignRolesToUser = async (req, res) => {
  try {
    const { user_id, role_ids } = req.body;
    if (!Array.isArray(role_ids) || role_ids.length === 0) {
      return res.status(400).json({ message: "Choose at least one role." });
    }

    // Validate user (same sector; not someone with more permissions than the assigner)
    const user = await findUserInScope(req, user_id);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }
    await assertCanManageUser(req, user.user_id);

    // Validate roles: global or the user's sector's, with no permissions beyond the assigner's
    const uniqueRoleIds = [...new Set(role_ids)];
    const roles = await assertAssignableRoles(req, uniqueRoleIds, user.sector_node_id);

    // Assign roles: skip ones the user already has, switch removed ones back on.
    // The assigner is whoever is signed in (not taken from the request body).
    const existing = await UserRoles.findAll({ where: { user_id: user.user_id, role_id: uniqueRoleIds } });
    const byRole = new Map(existing.map((ur) => [ur.role_id, ur]));
    for (const role of roles) {
      const current = byRole.get(role.role_id);
      if (current) {
        if (!current.is_active) {
          await current.update({ is_active: true, assigned_by: req.user.user_id, assigned_at: new Date() });
        }
        continue;
      }
      await UserRoles.create({
        user_role_id: uuidv4(),
        user_id: user.user_id,
        role_id: role.role_id,
        assigned_by: req.user.user_id,
        assigned_at: new Date(),
        is_active: true,
      });
    }

    // Fetch user with roles
    const userWithRoles = await User.findOne({
      where: { user_id: user.user_id },
      include: {
        model: Role,
        as: "roles",
        through: { attributes: ["assigned_at", "assigned_by", "is_active"] },
      },
    });

    return res.status(200).json({
      message: "Roles assigned successfully.",
      data: userWithRoles,
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    console.error(error);
    return res.status(500).json({
      message: "Internal server error.",
      error: error.message,
    });
  }
};

const removeRoleFromUser = async (req, res) => {
  try {
    const { user_id, role_id } = req.body;

    const user = await findUserInScope(req, user_id);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }
    await assertCanManageUser(req, user.user_id);

    const assignment = await UserRoles.findOne({
      where: { user_id, role_id, is_active: true },
    });

    if (!assignment) {
      return res.status(404).json({ message: "Role not assigned to user." });
    }

    assignment.is_active = false;
    await assignment.save();

    return res
      .status(200)
      .json({ message: "Role removed from user successfully." });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    console.error(error);
    return res
      .status(500)
      .json({ message: "Internal server error.", error: error.message });
  }
};

module.exports = {
  assignRolesToUser,
  removeRoleFromUser,
};
