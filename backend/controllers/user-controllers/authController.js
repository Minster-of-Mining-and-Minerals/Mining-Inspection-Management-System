const {
  User,
  Role,
  RolePermission,
  Permission,
  SectorNode,
} = require("../../models");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    // console.log("login called: ", req.body);

    const user = await User.findOne({
      where: { email },
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
          attributes: ["sector_node_id", "name", "level"],
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
    if (!user.is_active)
      return res.status(403).json({ message: "User is inactive" });

    // Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(401).json({ message: "Invalid email or password" });

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

    // ===== Generate JWT Token =====
    const token = jwt.sign(
      {
        user_id: user.user_id,
        email: user.email,
        roles: userRoles.map((r) => r.name),
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
const logout = async (req, res) => {
  try {
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

module.exports = { login, logout, getMePermissions, changePassword };
