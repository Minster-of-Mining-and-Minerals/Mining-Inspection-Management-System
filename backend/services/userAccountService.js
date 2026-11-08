/**
 * Creates a staff account with a random temporary password and emails it.
 * If the email can't be sent, the account still exists and the caller gets the
 * temporary password once, to hand over in person.
 */
const bcrypt = require("bcrypt");
const { v4: uuidv4 } = require("uuid");
const { User, UserType, Role, UserRoles } = require("../models");
const { generateRandomPassword } = require("../utils/password");
const { sendEmail } = require("../utils/sendEmail");

const trySendEmail = async (...args) => {
  try {
    await sendEmail(...args);
    return true;
  } catch (err) {
    console.error("Email not sent:", err.message);
    return false;
  }
};

const fail = (status, message) => Object.assign(new Error(message), { status });

/**
 * @param {{ full_name: string, email: string, phone_number?: string|null, role_names: string[] }} data
 * @param {{ createdBy?: string|null, transaction?: object }} options
 * @returns {Promise<{ user: object, temporaryPassword: string, sendWelcomeEmail: () => Promise<boolean> }>}
 *   Call sendWelcomeEmail() after the transaction commits.
 */
const createStaffAccount = async ({ full_name, email, phone_number, role_names }, { createdBy = null, transaction } = {}) => {
  const normalizedEmail = String(email).trim().toLowerCase();
  if (await User.findOne({ where: { email: normalizedEmail }, transaction })) {
    throw fail(409, "A user with this email already exists.");
  }
  const internal = await UserType.findOne({ where: { name: "internal" }, transaction });
  if (!internal) throw fail(500, "User type 'internal' is missing; run the seeders.");

  const roles = await Role.findAll({ where: { name: role_names, is_active: true }, transaction });
  if (roles.length !== new Set(role_names).size) throw fail(500, `Role(s) missing: ${role_names.join(", ")}. Run the seeders.`);

  const temporaryPassword = generateRandomPassword(12);
  const now = new Date();
  const user = await User.create(
    {
      user_id: uuidv4(),
      full_name: full_name.trim(),
      email: normalizedEmail,
      password: await bcrypt.hash(temporaryPassword, 10),
      phone_number: phone_number || null,
      user_type_id: internal.user_type_id,
      is_first_logged_in: true,
      is_active: true,
      created_at: now,
      updated_at: now,
    },
    { transaction },
  );
  await UserRoles.bulkCreate(
    roles.map((r) => ({
      user_role_id: uuidv4(),
      user_id: user.user_id,
      role_id: r.role_id,
      assigned_by: createdBy,
      assigned_at: now,
      is_active: true,
    })),
    { transaction },
  );

  const sendWelcomeEmail = () =>
    trySendEmail(
      normalizedEmail,
      `Welcome to ${process.env.APP_NAME || "the Mining Inspection Management System"}`,
      `
      Dear ${user.full_name},
      An account has been created for you.
      Email: ${normalizedEmail}
      Temporary Password: ${temporaryPassword}
      Please change your password when you first sign in.
    `,
    );

  return { user, temporaryPassword, sendWelcomeEmail };
};

module.exports = { createStaffAccount };
