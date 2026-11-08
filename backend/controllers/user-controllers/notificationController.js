const { Notification } = require("../../models");

const getMyNotifications = async (req, res) => {
  try {
    const user_id = req.user.user_id;

    const notifications = await Notification.findAll({
      where: { recipient_id: user_id },
      order: [["created_at", "DESC"]],
    });

    return res.status(200).json({
      success: true,
      data: notifications,
    });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch notifications",
      error: error.message,
    });
  }
};

const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const user_id = req.user.user_id;

    const notification = await Notification.findOne({
      where: { notification_id: id, recipient_id: user_id },
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    await notification.update({ is_read: true });

    return res.status(200).json({
      success: true,
      message: "Notification marked as read",
    });
  } catch (error) {
    console.error("Error marking notification as read:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update notification",
      error: error.message,
    });
  }
};

const markAllAsRead = async (req, res) => {
  try {
    const user_id = req.user.user_id;

    await Notification.update(
      { is_read: true },
      { where: { recipient_id: user_id, is_read: false } }
    );

    return res.status(200).json({
      success: true,
      message: "All notifications marked as read",
    });
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update notifications",
      error: error.message,
    });
  }
};

module.exports = {
  getMyNotifications,
  markAsRead,
  markAllAsRead,
};
