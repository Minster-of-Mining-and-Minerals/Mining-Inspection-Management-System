const crypto = require("crypto");
const bcrypt = require("bcrypt");
const { User } = require("../../models");
const { sendEmail } = require("../../utils/sendEmail");
const { Op } = require("sequelize");
const { endAllSessions } = require("../../services/sessionService");
const { accountNotice } = require("../../services/accountNotifications");

/**
 * Request OTP for password reset
 */
const requestOTP = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required" });
    }

    const user = await User.findOne({ where: { email, is_active: true } });

    if (!user) {
      // For security reasons, don't reveal if user exists or not
      return res.status(200).json({
        success: true,
        message: "If an account with that email exists, an OTP has been sent."
      });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry

    await user.update({
      otp,
      otp_expiry: otpExpiry,
    });

    // Send email
    const subject = "Password Reset OTP - Plan Management System";
    const text = `Your OTP for password reset is: ${otp}. It will expire in 10 minutes.`;

    await sendEmail(email, subject, text);

    return res.status(200).json({
      success: true,
      message: "If an account with that email exists, an OTP has been sent.",
    });
  } catch (error) {
    console.error("Request OTP error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

/**
 * Verify OTP
 */
const verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ success: false, message: "Email and OTP are required" });
    }

    const user = await User.findOne({
      where: {
        email,
        otp,
        otp_expiry: { [Op.gt]: new Date() },
      },
    });

    if (!user) {
      return res.status(400).json({ success: false, message: "Invalid or expired OTP" });
    }

    return res.status(200).json({
      success: true,
      message: "OTP verified successfully",
    });
  } catch (error) {
    console.error("Verify OTP error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

/**
 * Reset Password
 */
const resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({ success: false, message: "Email, OTP, and new password are required" });
    }

    const user = await User.findOne({
      where: {
        email,
        otp,
        otp_expiry: { [Op.gt]: new Date() },
        is_first_logged_in: false,
      },
    });

    if (!user) {
      return res.status(400).json({ success: false, message: "Invalid or expired OTP" });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await user.update({
      password: hashedPassword,
      otp: null,
      otp_expiry: null,
      password_changed_at: new Date(),
    });
    // A reset password: every device signs in again
    await endAllSessions(user.user_id, "password_changed");
    accountNotice(user.user_id, { type: "ACCOUNT_PASSWORD_CHANGED", title: "Your password was reset", message: "Your password was reset with a code sent to your email. All your devices were signed out. If this was not you, contact your administrator." });

    return res.status(200).json({
      success: true,
      message: "Password reset successfully",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

module.exports = {
  requestOTP,
  verifyOTP,
  resetPassword,
};
