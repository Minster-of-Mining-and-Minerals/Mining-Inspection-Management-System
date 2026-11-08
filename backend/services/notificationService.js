const { v4: uuidv4 } = require("uuid");
const {
  Notification,
  User,
  Role,
} = require("../models");
const { sendEmail } = require("../utils/sendEmail");

class NotificationService {
  /**
   * Helper to fetch all users with 'admin' role
   */
  static async getAdminUsers(transaction = null) {
    return await User.findAll({
      include: [
        {
          model: Role,
          as: "roles",
          where: { name: "admin" },
          required: true,
        },
      ],
      where: { is_active: true },
      transaction,
    });
  }

  /**
   * Base method to create a notification and send email
   */
  static async createNotification(data, transaction = null) {
    const {
      recipient_id,
      recipient_type,
      type,
      title,
      message,
      related_entity_type,
      related_entity_id,
      email,
    } = data;

    const notification = await Notification.create({
      notification_id: uuidv4(),
      recipient_id,
      recipient_type,
      type,
      title,
      message,
      related_entity_type,
      related_entity_id,
      is_read: false,
    }, { transaction });

    if (email) {
      try {
        await sendEmail(email, title, message);
      } catch (err) {
        console.error(`Failed to send email to ${email}:`, err.message);
      }
    }

    return notification;
  }

  /**
   * Create the same notification for several users (e.g. every member of a team)
   */
  static async notifyUsers(users, data, transaction = null) {
    const results = [];
    for (const user of users) {
      if (!user) continue;
      results.push(
        await this.createNotification(
          { recipient_type: "internal", ...data, recipient_id: user.user_id, email: data.sendEmail ? user.email : undefined },
          transaction,
        ),
      );
    }
    return results;
  }
}

module.exports = NotificationService;
