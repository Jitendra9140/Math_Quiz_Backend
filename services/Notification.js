const admin = require("../config/firebase");
const {
  Notification,
  NotificationDeliveryLog,
  UserNotificationCounter,
  NotificationConfig,
} = require("../models/Notification");
const moment = require("moment-timezone");

class NotificationService {
  /**
   * Get eligible users based on audience filters
   */
  async getEligibleUsers(audienceConfig, User) {
    let query = {};

    if (audienceConfig.targetType === "all") {
      query = {};
    } else {
      const filters = audienceConfig.filters;

      // User Type Filter
      if (filters.userType && filters.userType.length > 0) {
        query.status = { $in: filters.userType };
      }

      // User Rating Filter
      if (filters.userRating && filters.userRating.length > 0) {
        const ratingConditions = filters.userRating.map((range) => ({
          rating: { $gte: range.min, $lte: range.max },
        }));
        query.$or = ratingConditions;
      }

      // Country Filter
      if (filters.countries && filters.countries.length > 0) {
        query.country = { $in: filters.countries };
      }

      // Joining Date Filter
      if (filters.joiningDateRange) {
        query.createdAt = {
          $gte: new Date(filters.joiningDateRange.startDate),
          $lte: new Date(filters.joiningDateRange.endDate),
        };
      }
    }

    // Get users with FCM tokens
    query.fcmToken = { $exists: true, $ne: null };

    return await User.find(query).select("_id fcmToken timezone country");
  }

  /**
   * Check daily notification limit
   */
  async checkDailyLimit(userId) {
    const config = await NotificationConfig.findOne();
    const maxLimit = config?.maxPushNotificationsPerDay || 5;

    const today = moment().format("YYYY-MM-DD");

    const counter = await UserNotificationCounter.findOne({
      userId,
      date: today,
    });

    return !counter || counter.count < maxLimit;
  }

  /**
   * Increment user notification counter
   */
  async incrementUserCounter(userId) {
    const today = moment().format("YYYY-MM-DD");

    await UserNotificationCounter.findOneAndUpdate(
      { userId, date: today },
      { $inc: { count: 1 } },
      { upsert: true, new: true }
    );
  }

  /**
   * Send push notification via Firebase
   */
  async sendPushNotification(fcmToken, message, notificationId, userId) {
    try {
      const payload = {
        token: fcmToken,
        notification: {
          title: message.title,
          body: message.body,
        },
        data: {
          notificationId: notificationId.toString(),
          ...(message.ctaLink && { ctaLink: message.ctaLink }),
          ...(message.imageUrl && { imageUrl: message.imageUrl }),
        },
        android: {
          priority: "high",
          notification: {
            sound: "default",
            ...(message.imageUrl && { imageUrl: message.imageUrl }),
          },
        },
        apns: {
          payload: {
            aps: {
              sound: "default",
              ...(message.imageUrl && { "mutable-content": 1 }),
            },
          },
          ...(message.imageUrl && {
            fcm_options: {
              image: message.imageUrl,
            },
          }),
        },
      };

      const response = await admin.messaging().send(payload);

      // Log successful delivery
      await NotificationDeliveryLog.create({
        notificationId,
        userId,
        fcmToken,
        status: "delivered",
        fcmResponse: response,
        deliveredAt: new Date(),
      });

      return { success: true, response };
    } catch (error) {
      // Log failed delivery
      await NotificationDeliveryLog.create({
        notificationId,
        userId,
        fcmToken,
        status: "failed",
        failureReason: error.message,
        fcmResponse: error,
      });

      return { success: false, error: error.message };
    }
  }

  /**
   * Send notifications to users
   */
  async sendNotifications(notificationId, User) {
    const notification = await Notification.findById(notificationId);

    if (!notification) {
      throw new Error("Notification not found");
    }

    // Update status to sending
    notification.status = "sending";
    await notification.save();

    // Get eligible users
    const users = await this.getEligibleUsers(notification.audience, User);

    let sentCount = 0;
    let deliveredCount = 0;
    let failedCount = 0;

    // Send notifications in batches
    const batchSize = 500;
    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);

      const sendPromises = batch.map(async (user) => {
        // Check daily limit
        const canSend = await this.checkDailyLimit(user._id);

        if (!canSend) {
          await NotificationDeliveryLog.create({
            notificationId,
            userId: user._id,
            status: "failed",
            failureReason: "Daily limit exceeded",
          });
          failedCount++;
          return;
        }

        // Send notification based on timezone if enabled
        if (notification.timezoneAware && user.timezone) {
          const userTime = moment.tz(user.timezone);
          const scheduledTime = moment(notification.scheduledTime);

          // Check if it's the right time in user's timezone
          if (userTime.hour() !== scheduledTime.hour()) {
            // Schedule for later
            return;
          }
        }

        // Send push notification
        const result = await this.sendPushNotification(
          user.fcmToken,
          notification.message,
          notificationId,
          user._id
        );

        if (result.success) {
          await this.incrementUserCounter(user._id);
          deliveredCount++;
        } else {
          failedCount++;
        }

        sentCount++;
      });

      await Promise.allSettled(sendPromises);
    }

    // Update notification analytics
    notification.analytics.totalSent = sentCount;
    notification.analytics.totalDelivered = deliveredCount;
    notification.analytics.totalFailed = failedCount;
    notification.status = "completed";
    await notification.save();

    return {
      sentCount,
      deliveredCount,
      failedCount,
    };
  }

  /**
   * Track notification open
   */
  async trackNotificationOpen(notificationId, userId) {
    const log = await NotificationDeliveryLog.findOne({
      notificationId,
      userId,
    });

    if (log && log.status === "delivered") {
      log.status = "opened";
      log.openedAt = new Date();
      await log.save();

      // Update notification analytics
      await Notification.findByIdAndUpdate(notificationId, {
        $inc: { "analytics.totalOpened": 1 },
      });

      // Recalculate open rate
      const notification = await Notification.findById(notificationId);
      if (notification.analytics.totalDelivered > 0) {
        notification.analytics.openRate =
          (notification.analytics.totalOpened /
            notification.analytics.totalDelivered) *
          100;
        await notification.save();
      }
    }
  }

  /**
   * Retry failed notifications
   */
  async retryFailedNotifications(notificationId, maxRetries = 3) {
    const failedLogs = await NotificationDeliveryLog.find({
      notificationId,
      status: "failed",
      retryCount: { $lt: maxRetries },
    }).populate("userId", "fcmToken");

    for (const log of failedLogs) {
      if (log.userId && log.userId.fcmToken) {
        const notification = await Notification.findById(notificationId);

        const result = await this.sendPushNotification(
          log.userId.fcmToken,
          notification.message,
          notificationId,
          log.userId._id
        );

        log.retryCount += 1;
        log.lastRetryAt = new Date();

        if (result.success) {
          log.status = "delivered";
          log.deliveredAt = new Date();
        }

        await log.save();
      }
    }
  }

  /**
   * Get notification analytics
   */
  async getNotificationAnalytics(notificationId) {
    const notification = await Notification.findById(notificationId);

    const logs = await NotificationDeliveryLog.aggregate([
      { $match: { notificationId: notification._id } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const analytics = {
      totalSent: notification.analytics.totalSent,
      totalDelivered: notification.analytics.totalDelivered,
      totalOpened: notification.analytics.totalOpened,
      totalFailed: notification.analytics.totalFailed,
      openRate: notification.analytics.openRate,
      statusBreakdown: logs,
    };

    return analytics;
  }
}

module.exports = new NotificationService();
