const {
  Notification,
  NotificationDeliveryLog,
  NotificationConfig,
} = require("../models/Notification");
const notificationService = require("../services/Notification");
const moment = require("moment-timezone");

/**
 * Create or save notification as draft
 */
const createNotification = async (req, res) => {
  try {
    const {
      type,
      sendType,
      scheduledTime,
      scheduledDate,
      timezoneAware,
      isRecurring,
      recurringConfig,
      audience,
      message,
      status = "draft",
    } = req.body;
    console.log(req.body);
    // Validation
    if (!type || !["in-app", "push", "popup"].includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Invalid notification type",
      });
    }

    if (!message?.title || !message?.body) {
      return res.status(400).json({
        success: false,
        message: "Title and body are required",
      });
    }

    // Get user count for audience
    const User = require("../models/Player"); // Import your User model
    const users = await notificationService.getEligibleUsers(
      audience || { targetType: "all" },
      User
    );

    const notification = await Notification.create({
      type,
      sendType,
      scheduledTime: scheduledTime ? new Date(scheduledTime) : null,
      scheduledDate: scheduledDate ? new Date(scheduledDate) : null,
      timezoneAware: timezoneAware || false,
      isRecurring: isRecurring || false,
      recurringConfig: isRecurring ? recurringConfig : null,
      audience: audience || { targetType: "all" },
      message,
      status,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // If send type is 'now' and status is not draft, send immediately
    if (sendType === "now" && status !== "draft") {
      await notificationService.sendNotifications(notification._id, User);
    }

    return res.status(201).json({
      success: true,
      message:
        status === "draft"
          ? "Notification saved as draft"
          : "Notification created successfully",
      data: {
        notification,
        targetedUsers: users.length,
      },
    });
  } catch (error) {
    console.error("Create notification error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create notification",
      error: error.message,
    });
  }
};

/**
 * Send notification immediately
 */



const sendNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const User = require("./models/Player");

    const result = await notificationService.sendNotifications(
      notificationId,
      User
    );

    return res.status(200).json({
      success: true,
      message: "Notification sent successfully",
      data: result,
    });
  } catch (error) {
    console.error("Send notification error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to send notification",
      error: error.message,
    });
  }
};

/**
 * Get all in-app notifications with filters
 */
const getInAppNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({
      type: "in-app",
      status: "completed", // optional but recommended
    })
      .sort({ createdAt: -1 })
      .select({
        "message.title": 1,
        "message.body": 1,
        "message.imageUrl": 1,
        createdAt: 1,
        _id: 0, // remove if you want id
      });

    // Transform response (clean output)
    const response = notifications.map((n) => ({
      title: n.message.title,
      body: n.message.body,
      imageUrl: n.message.imageUrl || null,
      date: n.createdAt,
    }));

    return res.status(200).json({
      success: true,
      data: response,
    });
  } catch (error) {
    console.error("Get in-app notifications error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch in-app notifications",
      error: error.message,
    });
  }
};



/**
 * Get notification analytics
 */

const getAnalytics = async (req, res) => {
  try {
    const { notificationId } = req.params;

    const analytics = await notificationService.getNotificationAnalytics(
      notificationId
    );

    return res.status(200).json({
      success: true,
      data: analytics,
    });
  } catch (error) {
    console.error("Get analytics error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch analytics",
      error: error.message,
    });
  }
};

/**
 * Get overall analytics
 */
const getOverallAnalytics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const matchQuery = {
      status: { $in: ["completed", "sending"] },
    };

    if (startDate && endDate) {
      matchQuery.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const notifications = await Notification.find(matchQuery);

    const totalSent = notifications.reduce(
      (sum, n) => sum + n.analytics.totalSent,
      0
    );
    const totalDelivered = notifications.reduce(
      (sum, n) => sum + n.analytics.totalDelivered,
      0
    );
    const totalOpened = notifications.reduce(
      (sum, n) => sum + n.analytics.totalOpened,
      0
    );
    const totalUsers = await Notification.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          uniqueUsers: { $addToSet: "$audience" },
        },
      },
    ]);

    // Get scheduled notifications
    const scheduledToday = await Notification.countDocuments({
      status: "scheduled",
      scheduledDate: {
        $gte: moment().startOf("day").toDate(),
        $lte: moment().endOf("day").toDate(),
      },
    });

    const scheduledTomorrow = await Notification.countDocuments({
      status: "scheduled",
      scheduledDate: {
        $gte: moment().add(1, "day").startOf("day").toDate(),
        $lte: moment().add(1, "day").endOf("day").toDate(),
      },
    });

    const scheduledDayAfter = await Notification.countDocuments({
      status: "scheduled",
      scheduledDate: {
        $gte: moment().add(2, "days").startOf("day").toDate(),
        $lte: moment().add(2, "days").endOf("day").toDate(),
      },
    });

    return res.status(200).json({
      success: true,
      data: {
        totalNotificationsSent: totalSent,
        avgNotificationsPerUser:
          totalUsers.length > 0
            ? (totalSent / totalUsers.length).toFixed(2)
            : 0,
        totalUsersReceiving: totalDelivered,
        totalOpened: totalOpened,
        overallOpenRate:
          totalDelivered > 0
            ? ((totalOpened / totalDelivered) * 100).toFixed(2)
            : 0,
        scheduledToday,
        scheduledTomorrow,
        scheduledDayAfter,
      },
    });
  } catch (error) {
    console.error("Get overall analytics error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch overall analytics",
      error: error.message,
    });
  }
};

/**
 * Get notification history
 */
const getHistory = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    const query = {};
    if (status) {
      query.status = status;
    }

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Notification.countDocuments(query);

    return res.status(200).json({
      success: true,
      data: {
        notifications,
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error("Get history error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch notification history",
      error: error.message,
    });
  }
};

/**
 * Update notification (only if not sent)
 */
const updateNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const updateData = req.body;

    const notification = await Notification.findById(notificationId);

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    // Check if notification can be edited
    if (
      notification.status === "sending" ||
      notification.status === "completed"
    ) {
      return res.status(400).json({
        success: false,
        message: "Cannot edit notification that is being sent or completed",
      });
    }

    // Update notification
    Object.assign(notification, updateData);
    notification.updatedAt = new Date();
    await notification.save();

    return res.status(200).json({
      success: true,
      message: "Notification updated successfully",
      data: notification,
    });
  } catch (error) {
    console.error("Update notification error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update notification",
      error: error.message,
    });
  }
};

//Stop scheduled notification

const stopNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;

    const notification = await Notification.findById(notificationId);

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    if (
      notification.status !== "scheduled" &&
      notification.status !== "sending"
    ) {
      return res.status(400).json({
        success: false,
        message: "Can only stop scheduled or sending notifications",
      });
    }

    notification.status = "stopped";
    await notification.save();

    return res.status(200).json({
      success: true,
      message: "Notification stopped successfully",
    });
  } catch (error) {
    console.error("Stop notification error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to stop notification",
      error: error.message,
    });
  }
};

// Get delivery logs for a notification
 
const getDeliveryLogs = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const { page = 1, limit = 50, status } = req.query;

    const notification = await Notification.findById(notificationId);

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    const query = { notificationId: notification._id };
    if (status) {
      query.status = status;
    }

    const logs = await NotificationDeliveryLog.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate("userId", "name email country");

    const total = await NotificationDeliveryLog.countDocuments(query);

    // Get failure summary
    const failureSummary = await NotificationDeliveryLog.aggregate([
      { $match: { notificationId: notification._id, status: "failed" } },
      {
        $group: {
          _id: "$failureReason",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);

    return res.status(200).json({
      success: true,
      data: {
        logs,
        failureSummary,
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error("Get delivery logs error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch delivery logs",
      error: error.message,
    });
  }
};

//Track notification open (webhook/client call)
 
const trackOpen = async (req, res) => {
  try {
    const { notificationId, userId } = req.body;

    await notificationService.trackNotificationOpen(notificationId, userId);

    return res.status(200).json({
      success: true,
      message: "Open tracked successfully",
    });
  } catch (error) {
    console.error("Track open error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to track open",
      error: error.message,
    });
  }
};

//Retry failed notifications

const retryFailed = async (req, res) => {
  try {
    const { notificationId } = req.params;

    await notificationService.retryFailedNotifications(notificationId);

    return res.status(200).json({
      success: true,
      message: "Retry initiated for failed notifications",
    });
  } catch (error) {
    console.error("Retry failed error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retry notifications",
      error: error.message,
    });
  }
};

/**
 * Update notification configuration
 */
const updateConfig = async (req, res) => {
  try {
    const { maxPushNotificationsPerDay } = req.body;
    console.log("Jitendra")


    let config = await NotificationConfig.findOne();

    if (!config) {
      config = await NotificationConfig.create({
        maxPushNotificationsPerDay,
      });
    } else {
      config.maxPushNotificationsPerDay = maxPushNotificationsPerDay;
      config.lastUpdated = new Date();
      await config.save();
    }

    return res.status(200).json({
      success: true,
      message: "Configuration updated successfully",
      data: config,
    });
  } catch (error) {
    console.error("Update config error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update configuration",
      error: error.message,
    });
  }
};

module.exports = {
  createNotification,
  sendNotification,
  getAnalytics,
  getOverallAnalytics,
  getHistory,
  updateNotification,
  stopNotification,
  getDeliveryLogs,
  trackOpen,
  retryFailed,
  updateConfig,
  getInAppNotifications,
};
