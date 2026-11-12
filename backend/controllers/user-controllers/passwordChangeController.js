const bcrypt = require("bcrypt");
const { User } = require("../../models");
const { endAllSessions } = require("../../services/sessionService");
const { accountNotice } = require("../../services/accountNotifications");

exports.changePassword = async (req, res) => {
  const t = await User.sequelize.transaction();
  try {
    const userId = req.user.user_id;
    const { current_password, new_password, confirm_password, confirm_change } =
      req.body;

    
    const user = await User.findOne({
      where: { user_id: userId, is_active: true },
      transaction: t,
    });
    if (!user) {
      await t.rollback();
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const isFirstLogin = Boolean(user.is_first_logged_in);

    // DEBUG LOGGING
    console.log("====== PASSWORD CHANGE DEBUG ======");
    console.log("User ID:", userId);
    console.log("DB is_first_logged_in raw:", user.is_first_logged_in);
    console.log("Parsed isFirstLogin:", isFirstLogin);
    console.log("Body current_password provided:", !!current_password);
    console.log("===================================");

    // First login: set new password without verifying current (no email is sent)
    if (!isFirstLogin) {
      if (!current_password) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: "Current password is required. (If you think this is your first login, please click 'Logout' at the top left, log back in, and try again!)",
        });
      }

      const isMatch = await bcrypt.compare(current_password, user.password);
      if (!isMatch) {
        await t.rollback();
        return res
          .status(400)
          .json({ success: false, message: "Incorrect current password" });
      }
    }

    if (!new_password || !confirm_password) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: "New and confirm passwords are required",
      });
    }
    // Require explicit confirmation
    if (confirm_change !== true) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message:
          "Password change not confirmed. Please confirm before proceeding.",
      });
    }

    if (new_password !== confirm_password) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: "New password and confirm password do not match",
      });
    }

    // Prevent reusing the same password (skip on first login — temp password is replaced)
    if (!isFirstLogin) {
      const isSame = await bcrypt.compare(new_password, user.password);
      if (isSame) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: "New password cannot be same as old password",
        });
      }
    }

    const hashedPassword = await bcrypt.hash(new_password, 10);
    await user.update(
      {
        password: hashedPassword,
        password_changed_at: new Date(),
        is_first_logged_in: false,
        updated_at: new Date(),
      },
      { transaction: t }
    );

    await t.commit();
    // Signed out on the other devices; the account owner is told
    await endAllSessions(req.user.user_id, "password_changed", { exceptSessionId: req.session_id, byUserId: req.user.user_id });
    accountNotice(req.user.user_id, { type: "ACCOUNT_PASSWORD_CHANGED", title: "Your password was changed", message: "Your password was changed. Your other devices were signed out. If this was not you, contact your administrator." });
    return res.status(200).json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    if (!t.finished) await t.rollback();
    console.error("Change password error:", error);
    return res.status(500).json({
      success: false,
      message: "Error changing password",
      error: error.message,
    });
  }
};
