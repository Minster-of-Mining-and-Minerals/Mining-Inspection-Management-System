const {
  User,
  UserType,
  UserPosition,
  Role,
  UserRoles,
  SectorNode,
  Team,
  TeamMember,
  sequelize,
} = require("../../models");
const { v4: uuidv4, validate: isUuid } = require("uuid");
const { Op, literal } = require("sequelize");
const { likeContains } = require("../../utils/search");
const bcrypt = require("bcrypt");
const { generateRandomPassword } = require("../../utils/password");
const { addUserToTeam } = require("../../services/teamMembershipService");
const { scopeWhere, isDataSector } = require("../../services/sectorScope");
const { assertAssignableRoles, assertCanManageUser, userSectorFor } = require("../../services/userAccessService");
const { ROOT_SECTOR_ID } = require("../../utils/sectorConstants");

/** A user in the request's sector (central: any), or null. */
const findUserInScope = (id, options = {}) => (req) =>
  User.findOne({ ...options, where: { user_id: id, ...scopeWhere(req) } });

// Returns true when the email went out; never throws.
const trySendEmail = async (...args) => {
  try {
    await sendEmail(...args);
    return true;
  } catch (err) {
    console.error("Email not sent:", err.message);
    return false;
  }
};
const { sendEmail } = require("../../utils/sendEmail");

const getUserTypes = async (req, res) => {
  try {
    const userTypes = await UserType.findAll({
      attributes: [
        "user_type_id",
        "name",
        "description",
        "created_at",
        "updated_at",
      ],
      order: [["name", "ASC"]],
    });

    return res.status(200).json({
      success: true,
      message: "User types fetched successfully",
      data: userTypes,
    });
  } catch (error) {
    console.error("Error fetching user types:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch user types",
      error: error.message,
    });
  }
};
const getUserPositions = async (req, res) => {
  try {
    const userPositions = await UserPosition.findAll({
      attributes: [
        "user_position_id",
        "name",
        "description",
        "created_at",
        "updated_at",
      ],
      order: [["name", "ASC"]],
    });

    return res.status(200).json({
      success: true,
      message: "User positions fetched successfully",
      data: userPositions,
    });
  } catch (error) {
    console.error("Error fetching user positions:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch user positions",
      error: error.message,
    });
  }
};

const createUser = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const {
      full_name,
      email,
      user_type_id,
      sector_node_id,
      department_id,
      role_ids,
      phone_number,
    } = req.body;

    // ====== Check existing email ======
    const existingUser = await User.findOne({
      where: { email },
      transaction: t,
    });
    if (existingUser) {
      await t.rollback();
      return res
        .status(400)
        .json({ success: false, message: "User already exists." });
    }

    // ====== Validate user type ======
    const userType = await UserType.findByPk(user_type_id, { transaction: t });
    if (!userType) {
      await t.rollback();
      return res
        .status(400)
        .json({ success: false, message: "Invalid user type." });
    }

    // ====== Sector: sector users create users in their own sector; central users choose ======
    const targetSectorId = await userSectorFor(req, sector_node_id, t);

    // ====== Validate department if provided (the organization tree is optional) ======
    if (department_id) {
      const department = await SectorNode.findByPk(department_id, {
        transaction: t,
      });
      if (!department) {
        await t.rollback();
        return res
          .status(400)
          .json({ success: false, message: "Invalid department." });
      }
    }

    // ====== MULTIPLE ROLE VALIDATION (global or this sector's roles; no escalation) ======
    if (role_ids && Array.isArray(role_ids) && role_ids.length > 0) {
      await assertAssignableRoles(req, role_ids, targetSectorId, t);
    }

    // ====== Generate a random temporary password (changed on first login) ======
    // const password = generateRandomPassword(12);
    const password = "password";
    const hashedPassword = await bcrypt.hash(password, 10);

    // ====== Create User ======
    const user = await User.create(
      {
        user_id: uuidv4(),
        full_name,
        email,
        password: hashedPassword,
        phone_number: phone_number || null,
        user_type_id,
        sector_node_id: targetSectorId,
        department_id: department_id || null,
        is_first_logged_in: true,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
      { transaction: t },
    );

    // =======================================================
    // 🔵 MULTIPLE ROLE ASSIGNMENT
    // =======================================================
    if (role_ids && Array.isArray(role_ids) && role_ids.length > 0) {
      const roleAssignments = role_ids.map((rid) => ({
        user_role_id: uuidv4(),
        user_id: user.user_id,
        role_id: rid,
        assigned_by: req.user?.user_id || null,
        assigned_at: new Date(),
        is_active: true,
      }));

      await UserRoles.bulkCreate(roleAssignments, { transaction: t });
    }

    // ====== Optional: put the new user straight into a team ======
    // (also gives the inspector role, and team_leader when leading)
    if (req.body.team_id) {
      if (!req.user?.permissions?.includes("teams:manage_members")) {
        await t.rollback();
        return res.status(403).json({ success: false, message: "Access denied: Required permission teams:manage_members" });
      }
      await addUserToTeam({
        teamId: req.body.team_id,
        userId: user.user_id,
        role: req.body.team_role || "member",
        createdBy: req.user?.user_id || null,
        transaction: t,
      });
    }

    await t.commit();

    // ====== Send welcome email ======
    // The account exists even if email delivery fails; the admin then gets the
    // temporary password once in the response to hand over.
    const emailSent = await trySendEmail(
      email,
      `Welcome to ${process.env.APP_NAME}!`,
      `
      Dear ${full_name},
      Your account has been successfully created.
      Email: ${email}
      Temporary Password: ${password}
      Please change your password after first login.
    `,
    );

    const { password: _hash, otp, otp_expiry, ...safeUser } = user.get({ plain: true });
    return res.status(201).json({
      success: true,
      message: emailSent
        ? "User created. The temporary password was sent by email."
        : "User created, but the email could not be sent. Give the temporary password to the user.",
      data: safeUser,
      email_sent: emailSent,
      ...(emailSent ? {} : { temporary_password: password }),
    });
  } catch (error) {
    if (!t.finished) await t.rollback();
    // Team problems (full team leader slot, inactive team, …) come with a message for the user
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    console.error("Error creating user:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// =============== Update user ===============
const updateUser = async (req, res) => {
  // console.log("update user reached")

  const t = await sequelize.transaction();
  try {
    const { id: user_id } = req.params;
    const {
      full_name,
      email,
      user_type_id,
      phone_number,
      is_active,
      role_ids,
      sector_node_id,
      department_id,
    } = req.body;

    // ====== Find user (in the request's sector) ======
    if (!isUuid(user_id)) {
      await t.rollback();
      return res.status(400).json({ success: false, message: "Invalid user id." });
    }
    const user = await findUserInScope(user_id, { transaction: t })(req);
    if (!user) {
      await t.rollback();
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }
    await assertCanManageUser(req, user.user_id);

    // ====== Check for email duplication ======
    if (email && email !== user.email) {
      const existingEmail = await User.findOne({
        where: { email },
        transaction: t,
      });
      if (existingEmail) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: "Email is already in use by another user.",
        });
      }
    }

    // ====== Validate user type ======
    if (user_type_id) {
      const userType = await UserType.findByPk(user_type_id, {
        transaction: t,
      });
      if (!userType) {
        await t.rollback();
        return res
          .status(400)
          .json({ success: false, message: "Invalid user type." });
      }
    }

    // ====== Moving to another sector: central users only ======
    const newSectorId = sector_node_id && sector_node_id !== user.sector_node_id ? sector_node_id : user.sector_node_id;
    if (newSectorId !== user.sector_node_id) {
      if (!req.scope.isCentral) {
        await t.rollback();
        return res.status(403).json({ success: false, message: "Only the central administrator can move a user to another sector." });
      }
      if (newSectorId !== ROOT_SECTOR_ID && !(await isDataSector(newSectorId, t))) {
        await t.rollback();
        return res.status(400).json({ success: false, message: "Invalid sector." });
      }
      // Teams belong to a sector
      const inTeam = await TeamMember.count({ where: { user_id: user.user_id, left_on: null }, transaction: t });
      if (inTeam) {
        await t.rollback();
        return res.status(409).json({ success: false, message: "Remove this user from their team before moving them to another sector." });
      }
      // Their current roles must still fit (unless new roles are given in the same request)
      if (!Array.isArray(role_ids)) {
        const current = await UserRoles.findAll({ where: { user_id: user.user_id }, attributes: ["role_id"], transaction: t });
        await assertAssignableRoles(req, current.map((r) => r.role_id), newSectorId, t);
      }
    }

    // ====== Validate department if provided ======
    if (department_id) {
      const department = await SectorNode.findByPk(department_id, {
        transaction: t,
      });
      if (!department) {
        await t.rollback();
        return res
          .status(400)
          .json({ success: false, message: "Invalid department." });
      }
    }

    // ====== Update user ======
    await user.update(
      {
        full_name: full_name ?? user.full_name,
        email: email ?? user.email,
        phone_number: phone_number ?? user.phone_number,
        user_type_id: user_type_id ?? user.user_type_id,
        is_active: is_active ?? user.is_active,
        sector_node_id: newSectorId,
        department_id: department_id ?? user.department_id,
        updated_at: new Date(),
      },
      { transaction: t },
    );

    // ====== Update roles if provided ======
    if (role_ids && Array.isArray(role_ids)) {
      // Global or this sector's roles, with no permissions beyond the editor's own
      await assertAssignableRoles(req, role_ids, newSectorId, t);

      // Delete old roles
      await UserRoles.destroy({
        where: { user_id },
        transaction: t,
      });

      // Assign new roles
      const roleAssignments = role_ids.map((rid) => ({
        user_role_id: uuidv4(),
        user_id,
        role_id: rid,
        assigned_by: req.user?.user_id || null,
        assigned_at: new Date(),
        is_active: true,
      }));
      await UserRoles.bulkCreate(roleAssignments, { transaction: t });
    }

    await t.commit();

    return res.status(200).json({
      success: true,
      message: "User updated successfully.",
      data: user,
    });
  } catch (error) {
    if (!t.finished) await t.rollback();
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    console.error("Error updating user:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ============Get all users=====================
const getUsers = async (req, res) => {
  try {
    const {
      // institute_id,
      sector_node_id,
      department_id,
      user_type_id,
      is_active,
      search, // optional: for name/email search
      page = 1,
      limit = 10,
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const limitInt = parseInt(limit);

    // console.log("sector_node_id: ", sector_node_id, req.query)
    // ====== Build filters dynamically ======
    const whereClause = {};

    // if (institute_id) whereClause.institute_id = institute_id;
    if (user_type_id) whereClause.user_type_id = user_type_id;
    // Sector filter: central users may pick any sector; everyone else is limited to theirs
    if (sector_node_id && req.scope.isCentral && !req.scope.sectorId) {
      if (!isUuid(sector_node_id)) return res.status(400).json({ success: false, message: "Invalid sector_node_id." });
      whereClause.sector_node_id = sector_node_id;
    }
    Object.assign(whereClause, scopeWhere(req));
    if (department_id) whereClause.department_id = department_id;
    if (is_active !== undefined) whereClause.is_active = is_active === "true";

    if (search) {
      const term = likeContains(search);
      whereClause[Op.or] = [
        { full_name: { [Op.iLike]: term } },
        { email: { [Op.iLike]: term } },
        { phone_number: { [Op.iLike]: term } },
        // To search in associated fields, we can use the following pattern:
        { "$sectorNode.name$": { [Op.iLike]: term } },
        { "$department.name$": { [Op.iLike]: term } },
        { "$userType.name$": { [Op.iLike]: term } },
        { "$teamMemberships.team.name$": { [Op.iLike]: term } },
      ];
    }

    // ====== Team filter: team id, or "none" for people not in any team ======
    const { team_id } = req.query;
    if (team_id === "none") {
      whereClause[Op.and] = [literal(`NOT EXISTS (SELECT 1 FROM team_members tm WHERE tm.user_id = "User"."user_id" AND tm.left_on IS NULL)`)];
    } else if (team_id) {
      if (!isUuid(team_id)) return res.status(400).json({ success: false, message: "Invalid team_id." });
      whereClause[Op.and] = [
        literal(`EXISTS (SELECT 1 FROM team_members tm WHERE tm.user_id = "User"."user_id" AND tm.left_on IS NULL AND tm.team_id = ${sequelize.escape(team_id)})`),
      ];
    }

    // ====== Fetch users with associations and count ======
    const { count, rows: users } = await User.findAndCountAll({
      where: whereClause,
      // Never send password hashes or one-time codes to the browser
      attributes: { exclude: ["password", "otp", "otp_expiry"] },
      subQuery: false, // Required when filtering by associated models with limit/offset
      distinct: true,
      include: [
        // Current team (a person is in at most one team at a time)
        {
          model: TeamMember,
          as: "teamMemberships",
          required: false,
          where: { left_on: null },
          attributes: ["team_member_id", "role", "joined_on"],
          include: [{ model: Team, as: "team", attributes: ["team_id", "name", "code"] }],
        },
        {
          model: UserType,
          as: "userType",
          attributes: ["user_type_id", "name"],
        },
        {
          model: SectorNode,
          as: "sectorNode",
          attributes: ["sector_node_id", "name"],
        },
        {
          model: SectorNode,
          as: "department",
          attributes: ["sector_node_id", "name"],
        },
      ],
      order: [["created_at", "DESC"]],
      limit: limitInt,
      offset: offset,
    });

    const data = users.map((u) => {
      const { teamMemberships, ...rest } = u.toJSON();
      const m = teamMemberships?.[0];
      return { ...rest, current_team: m ? { ...m.team, member_role: m.role, joined_on: m.joined_on } : null };
    });

    return res.status(200).json({
      success: true,
      message: "Users fetched successfully.",
      data,
      meta: {
        totalItems: count,
        totalPages: Math.ceil(count / limitInt),
        currentPage: parseInt(page),
        itemsPerPage: limitInt,
      },
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch users.",
      error: error.message,
    });
  }
};


const getUserById = async (req, res) => {
  try {
    const { id: user_id } = req.params;

    // console.log("user_id: ", user_id);

    if (!isUuid(user_id)) {
      return res.status(400).json({ success: false, message: "Invalid user id." });
    }

    // ====== Find user with relations (in the request's sector) ======
    const user = await User.findOne({
      where: { user_id, ...scopeWhere(req) },
      // Never send password hashes or one-time codes to the browser
      attributes: { exclude: ["password", "otp", "otp_expiry"] },
      include: [
        {
          model: UserType,
          as: "userType",
          attributes: ["user_type_id", "name"],
        },
        {
          model: Role,
          as: "roles",
          through: { attributes: [] },
        },
        { model: SectorNode, as: "sectorNode", attributes: ["sector_node_id", "name", "name_am", "parent_id"] },
        // Team history: current team first, then past teams
        {
          model: TeamMember,
          as: "teamMemberships",
          required: false,
          attributes: ["team_member_id", "role", "joined_on", "left_on"],
          include: [{ model: Team, as: "team", attributes: ["team_id", "name", "code", "is_active"] }],
        },
      ],
      order: [[{ model: TeamMember, as: "teamMemberships" }, "left_on", "DESC NULLS FIRST"]],
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "User fetched successfully.",
      data: user,
    });
  } catch (error) {
    console.error("Error fetching user:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch user.",
      error: error.message,
    });
  }
};

const deleteUser = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;

    if (!isUuid(id)) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: "Invalid user ID format.",
      });
    }

    const user = await findUserInScope(id, { transaction: t })(req);
    if (!user) {
      await t.rollback();
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }
    await assertCanManageUser(req, user.user_id);

    // Soft delete (deactivate)
    await user.update(
      { is_active: false, updated_at: new Date() },
      { transaction: t },
    );
    await t.commit();

    return res.status(200).json({
      success: true,
      message: "User deactivated successfully.",
    });
  } catch (error) {
    if (!t.finished) await t.rollback();
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    return res.status(500).json({
      success: false,
      message: "Error deactivating user",
      error: error.message,
    });
  }
};
const toggleUserActiveStatus = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { is_active } = req.body; // expect boolean true/false

    if (!isUuid(id)) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: "Invalid user ID format.",
      });
    }

    if (typeof is_active !== "boolean") {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: "is_active must be a boolean value.",
      });
    }

    const user = await findUserInScope(id, { transaction: t })(req);
    if (!user) {
      await t.rollback();
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }
    await assertCanManageUser(req, user.user_id);

    await user.update(
      { is_active, updated_at: new Date() },
      { transaction: t },
    );
    await t.commit();

    return res.status(200).json({
      success: true,
      message: `User ${is_active ? "activated" : "deactivated"} successfully.`,
      data: { user_id: id, is_active },
    });
  } catch (error) {
    if (!t.finished) await t.rollback();
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    return res.status(500).json({
      success: false,
      message: "Error toggling user status",
      error: error.message,
    });
  }
};

const resetUserPassword = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;

    if (!isUuid(id)) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: "Invalid user ID format.",
      });
    }

    const user = await findUserInScope(id, { transaction: t })(req);
    if (!user) {
      await t.rollback();
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }
    await assertCanManageUser(req, user.user_id);

    // Reset to "password" or requested password, and require change on next login
    const newPassword = req.body?.new_password || "password";
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await user.update(
      {
        password: hashedPassword,
        is_first_logged_in: true,
        password_changed_at: null,
        updated_at: new Date(),
      },
      { transaction: t },
    );

    await t.commit();

    // Send email notification (the reset stands even if the email fails)
    const emailSent = await trySendEmail(
      user.email,
      `Password Reset - ${process.env.APP_NAME || "MIMS"}`,
      `
      Dear ${user.full_name},
      Your password has been reset successfully.
      Email: ${user.email}
      New Temporary Password: ${newPassword}
      Please change your password after logging in.
      `,
    );

    return res.status(200).json({
      success: true,
      message: `Password has been reset to '${newPassword}'. The user will be required to change it on their next login.`,
      email_sent: emailSent,
      temporary_password: newPassword,
    });
  } catch (error) {
    if (!t.finished) await t.rollback();
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    return res.status(500).json({
      success: false,
      message: "Error resetting user password",
      error: error.message,
    });
  }
};

const getProfile = async (req, res) => {
  try {
    const userId = req.user.user_id;

    const user = await User.findOne({
      where: { user_id: userId },
      attributes: [
        "user_id",
        "full_name",
        "email",
        "phone_number",
        "position",
        "profile_image",
        "is_first_logged_in",
        "last_login_at",
        "password_changed_at",
        "is_active",
        "created_at",
        "updated_at",
      ],
      include: [
        {
          model: UserType,
          as: "userType",
          attributes: ["user_type_id", "name", "description"],
        },
      ],
    });

    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    return res.status(200).json({ success: true, data: user });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

module.exports = {
  createUser,
  getUsers,
  getUserById,
  updateUser,
  deleteUser,
  toggleUserActiveStatus,
  resetUserPassword,
  getProfile,
  getUserTypes,
  getUserPositions,
};
