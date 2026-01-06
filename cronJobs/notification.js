const cron = require("node-cron");
const { Notification } = require("../models/Notification");
const notificationService = require("../services/Notification");
const moment = require("moment-timezone");

class NotificationScheduler {
  /**
   * Initialize all scheduled jobs
   */
  init() {
    // Check for scheduled notifications every minute
    cron.schedule("* * * * *", async () => {
      await this.processScheduledNotifications();
    });

    // Process recurring notifications every hour
    cron.schedule("0 * * * *", async () => {
      await this.processRecurringNotifications();
    });

    console.log("Notification scheduler initialized");
  }

  /**
   * Process scheduled notifications that are due
   */
  async processScheduledNotifications() {
    try {
      const now = new Date();
      const User = require("../models/Player");

      // Find scheduled notifications that are due
      const dueNotifications = await Notification.find({
        status: "scheduled",
        sendType: "scheduled",
        scheduledDate: { $lte: now },
        $or: [
          { scheduledTime: { $lte: now } },
          { scheduledTime: { $exists: false } },
        ],
      });

      for (const notification of dueNotifications) {
        try {
          // Check if timezone-aware
          if (notification.timezoneAware) {
            // Will be handled in the service layer for each user
            await notificationService.sendNotifications(notification._id, User);
          } else {
            // Send to all users at once
            await notificationService.sendNotifications(notification._id, User);
          }

          console.log(
            `Scheduled notification ${notification._id} sent successfully`
          );
        } catch (error) {
          console.error(
            `Error sending scheduled notification ${notification._id}:`,
            error
          );

          // Mark as failed
          notification.status = "failed";
          await notification.save();
        }
      }
    } catch (error) {
      console.error("Error processing scheduled notifications:", error);
    }
  }

  /**
   * Process recurring notifications
   */
  async processRecurringNotifications() {
    try {
      const now = new Date();
      const User = require("../models/Player");

      // Find active recurring notifications
      const recurringNotifications = await Notification.find({
        isRecurring: true,
        status: { $in: ["scheduled", "completed"] },
        "recurringConfig.startDate": { $lte: now },
        $or: [
          { "recurringConfig.endDate": { $gte: now } },
          { "recurringConfig.endDate": { $exists: false } },
        ],
      });

      for (const notification of recurringNotifications) {
        try {
          const { frequency, lastPlayedDate, customInterval } =
            notification.recurringConfig;

          // Check if it's time to send
          let shouldSend = false;

          if (lastPlayedDate) {
            const lastSent = moment(lastPlayedDate);
            const hoursSinceLastSent = moment().diff(lastSent, "hours");

            switch (frequency) {
              case "daily":
                shouldSend = hoursSinceLastSent >= 24;
                break;
              case "weekly":
                shouldSend = hoursSinceLastSent >= 168;
                break;
              case "monthly":
                shouldSend = moment().diff(lastSent, "months") >= 1;
                break;
              case "custom":
                shouldSend = hoursSinceLastSent >= (customInterval || 24);
                break;
            }
          } else {
            // First send
            shouldSend = true;
          }

          if (shouldSend) {
            await notificationService.sendNotifications(notification._id, User);

            // Update last played date
            notification.recurringConfig.lastPlayedDate = new Date();
            await notification.save();

            console.log(
              `Recurring notification ${notification._id} sent successfully`
            );
          }
        } catch (error) {
          console.error(
            `Error sending recurring notification ${notification._id}:`,
            error
          );
        }
      }
    } catch (error) {
      console.error("Error processing recurring notifications:", error);
    }
  }

  /**
   * Clean up old notification logs (optional, as TTL index handles this)
   */
  async cleanupOldLogs() {
    try {
      const sevenDaysAgo = moment().subtract(7, "days").toDate();
      const {
        NotificationDeliveryLog,
      } = require("../models/Notification");

      const result = await NotificationDeliveryLog.deleteMany({
        createdAt: { $lt: sevenDaysAgo },
      });

      console.log(`Cleaned up ${result.deletedCount} old notification logs`);
    } catch (error) {
      console.error("Error cleaning up old logs:", error);
    }
  }
}

module.exports = new NotificationScheduler();
