const {
  User,
  Role,
  RolePermission,
  Permission,
  SectorNode,
} = require("../../models");
const { Op } = require("sequelize");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { ROOT_SECTOR_ID } = require("../../utils/sectorConstants");
const sessions = require("../../services/sessionService");
const { accountNotice } = require("../../services/accountNotifications");

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const cleanEmail = (email || "").trim();

    if (!cleanEmail || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const user = await User.findOne({
      where: {
        email: {
          [Op.iLike]: cleanEmail,
        },
      },
      include: [
        // {
        //   model: UserType,
        //   as: "userType",
        //   attributes: ["user_type_id", "name"],
        // },
        {
          model: Role,
          as: "roles",
          through: { attributes: [] },
          include: [
            {
              model: RolePermission,
              as: "rolePermissions",
              include: [
                // {
                //   model: Permission,
                //   as: "permission",
                //   attributes: ["permission_id", "resource", "action"],
                // },
              ],
            },
          ],
        },
        {
          model: SectorNode,
          as: "sectorNode",
          attributes: ["sector_node_id", "name", "name_am", "level"],
        },
        {
          model: SectorNode,
          as: "department",
          attributes: ["sector_node_id", "name", "level"],
        },
      ],
    });

    if (!user)
      return res.status(401).json({ message: "Invalid email or password" });
    // Audit log: a failed attempt on a real account is linked to it
    const attempted = { user_id: user.user_id, full_name: user.full_name, email: user.email, sector_node_id: user.sector_node_id };
    if (!user.is_active) {
      res.locals.audit = { actor: attempted, message: "Sign-in refused: account inactive" };
      return res.status(403).json({ message: "User is inactive" });
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      res.locals.audit = { actor: attempted, message: "Sign-in failed: wrong password" };
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // ===== Clean roles + permissions for token use =====
    const userRoles = user.roles.map((role) => ({
      role_id: role.role_id,
      name: role.name,
      permissions: [],
      // permissions: role.rolePermissions.map((rp) => ({
      //   permission_id: rp.permission_id,
      //   resource: rp.permission?.resource,
      //   action: rp.permission?.action,
      // })),
    }));

    // ===== A session for this sign-in (its id goes in the token; see services/sessionService.js) =====
    const { session, newDevice } = await sessions.startSession(user.user_id, req);
    // Audit log: who signed in (the request has no signed-in person yet)
    res.locals.audit = {
      action: "auth.login",
      actor: { user_id: user.user_id, full_name: user.full_name, email: user.email, sector_node_id: user.sector_node_id },
      session_id: session.session_id,
      entity_type: "users",
      entity_id: user.user_id,
      entity_label: user.full_name,
      message: `Signed in on ${session.device}`,
    };
    if (newDevice)
      accountNotice(user.user_id, {
        type: "ACCOUNT_NEW_SIGNIN",
        title: "New sign-in to your account",
        message: `Your account was signed in on ${session.device}${session.ip ? ` (${session.ip})` : ""}. If this was not you, change your password and sign out the other devices in your profile.`,
      });

    // ===== Generate JWT Token =====
    const token = jwt.sign(
      {
        user_id: user.user_id,
        email: user.email,
        roles: userRoles.map((r) => r.name),
        sid: session.session_id,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" },
    );

    // Update last login
    await User.update(
      { last_login_at: new Date() },
      { where: { user_id: user.user_id } },
    );

    const result = {
      user: {
        user_id: user.user_id,
        full_name: user.full_name,
        email: user.email,
        phone_number: user.phone_number,
        profile_image: user.profile_image,
        is_first_logged_in: user.is_first_logged_in,
        sector: user.sectorNode ? user.sectorNode.get({ plain: true }) : null,
        // Central users (root sector) manage every sector; everyone else only their own
        is_central: user.sector_node_id === ROOT_SECTOR_ID,
        department: user.department ? user.department.get({ plain: true }) : null,
      },
      roles: userRoles,
      // permissions removed to reduce session payload size
    };
    // console.log("to be returned: ", result);

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      data: result,
    });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

// Logout (token invalidation example using a blacklist)
/** Ends the session of the token (if it is valid); never fails, so the app can always sign out. */
const logout = async (req, res) => {
  try {
    const token = String(req.headers.authorization || "").split(" ")[1];
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded.sid) await sessions.endSession(decoded.sid, decoded.user_id, "signed_out", decoded.user_id);
      } catch {
        /* expired or invalid token: nothing to end */
      }
    }
    res.status(200).json({ message: "Logout successful" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

// Get Current User Permissions
const getMePermissions = async (req, res) => {
  try {
    const userId = req.user.user_id;

    // Same rules as the API checks (permissionService): only active links count
    const user = await User.findOne({
      where: { user_id: userId },
      include: [
        {
          model: Role,
          as: "roles",
          where: { is_active: true },
          required: false,
          through: { attributes: [], where: { is_active: true } },
          include: [
            {
              model: RolePermission,
              as: "rolePermissions",
              where: { is_active: true },
              required: false,
              include: [
                {
                  model: Permission,
                  as: "permission",
                  where: { is_active: true },
                  required: false,
                  attributes: ["permission_id", "resource", "action"],
                },
              ],
            },
          ],
        },
      ],
    });

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const userRoles = user.roles.map((role) => ({
      role_id: role.role_id,
      name: role.name,
      permissions: role.rolePermissions
        .filter((rp) => rp.permission)
        .map((rp) => ({
          permission_id: rp.permission_id,
          resource: rp.permission.resource,
          action: rp.permission.action,
        })),
    }));

    const permissions = userRoles.flatMap((r) => r.permissions);

    return res.status(200).json({
      success: true,
      data: permissions,
    });
  } catch (error) {
    console.error("Error fetching my permissions:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.user_id;

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: "Incorrect current password" });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update user
    await user.update({
      password: hashedPassword,
      is_first_logged_in: false,
      password_changed_at: new Date(),
    });

    return res.status(200).json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    console.error("Error changing password:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

/* =================== Sessions of the signed-in person =================== */
const sessionView = (s, currentId) => ({ ...s.get({ plain: true }), current: s.session_id === currentId });

/** GET /api/auth/sessions — my open sessions and my recent sign-ins. */
const getMySessions = async (req, res) => {
  try {
    const [open, recent] = await Promise.all([sessions.openSessions(req.user.user_id), sessions.recentSessions(req.user.user_id)]);
    return res.status(200).json({ success: true, data: { open: open.map((s) => sessionView(s, req.session_id)), recent: recent.map((s) => sessionView(s, req.session_id)) } });
  } catch (error) {
    console.error("getMySessions", error);
    return res.status(500).json({ success: false, message: "Failed to load your sessions." });
  }
};

/** DELETE /api/auth/sessions/:id — sign out one of my devices. */
const endMySession = async (req, res) => {
  try {
    const [n] = await sessions.endSession(req.params.id, req.user.user_id, "signed_out_by_user", req.user.user_id);
    return res.status(n ? 200 : 404).json({ success: !!n, message: n ? "Signed out." : "Session not found." });
  } catch (error) {
    console.error("endMySession", error);
    return res.status(500).json({ success: false, message: "Failed to sign out that device." });
  }
};

/** POST /api/auth/sessions/sign-out-others — sign out all my other devices. */
const endMyOtherSessions = async (req, res) => {
  try {
    const [n] = await sessions.endAllSessions(req.user.user_id, "signed_out_by_user", { exceptSessionId: req.session_id, byUserId: req.user.user_id });
    return res.status(200).json({ success: true, message: n ? `Signed out ${n} other device${n === 1 ? "" : "s"}.` : "No other devices were signed in." });
  } catch (error) {
    console.error("endMyOtherSessions", error);
    return res.status(500).json({ success: false, message: "Failed to sign out the other devices." });
  }
};

module.exports = { login, logout, getMePermissions, changePassword, getMySessions, endMySession, endMyOtherSessions };
