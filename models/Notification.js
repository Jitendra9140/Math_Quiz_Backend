const mongoose = require("mongoose");

// Notification Configuration Schema
const notificationConfigSchema = new mongoose.Schema({
  maxPushNotificationsPerDay: {
    type: Number,
    default: 5,
    required: true,
  },
  lastUpdated: {
    type: Date,
    default: Date.now,
  },
});

// Notification Template Schema
const notificationSchema = new mongoose.Schema({
  // Type Configuration
  type: {
    type: String,
    enum: ["in-app", "push", "popup"],
    required: true,
  },

  // Scheduling Configuration
  sendType: {
    type: String,
    enum: ["now", "scheduled"],
    required: true,
  },
  scheduledTime: Date,
  scheduledDate: Date,
  timezoneAware: {
    type: Boolean,
    default: false,
  },

  // Recurring Configuration
  isRecurring: {
    type: Boolean,
    default: false,
  },
  recurringConfig: {
    frequency: {
      type: String,
      enum: ["daily", "weekly", "monthly", "custom"],
    },
    startDate: Date,
    endDate: Date,
    lastPlayedDate: Date,
    customInterval: Number, // in hours
  },

  // Audience Targeting
  audience: {
    targetType: {
      type: String,
      enum: ["all", "filtered"],
      default: "all",
    },
    filters: {
      userType: [
        {
          type: String,
          enum: ["active", "inactive"],
        },
      ],
      userRating: [
        {
          min: Number,
          max: Number,
        },
      ],
      countries: [String],
      joiningDateRange: {
        startDate: Date,
        endDate: Date,
      },
    },
  },

  // Message Details
  message: {
    title: {
      type: String,
      required: true,
      maxlength: 100,
    },
    body: {
      type: String,
      required: true,
      maxlength: 500,
    },
    ctaLink: String,
    imageUrl: String,
    language: {
      type: String,
      default: "en",
    },
  },

  // Status
  status: {
    type: String,
    enum: ["draft", "scheduled", "sending", "completed", "failed", "stopped"],
    default: "draft",
  },

  // Analytics
  analytics: {
    totalSent: {
      type: Number,
      default: 0,
    },
    totalDelivered: {
      type: Number,
      default: 0,
    },
    totalOpened: {
      type: Number,
      default: 0,
    },
    totalFailed: {
      type: Number,
      default: 0,
    },
    openRate: {
      type: Number,
      default: 0,
    },
  },

  // Metadata
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Player",
    required: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Notification Delivery Log Schema (Auto-delete after 7 days)
const notificationDeliveryLogSchema = new mongoose.Schema({
  notificationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Notification",
    required: true,
    index: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Player",
    required: true,
    index: true,
  },

  // Delivery Details
  status: {
    type: String,
    enum: ["pending", "delivered", "opened", "failed"],
    default: "pending",
    index: true,
  },

  // FCM Details
  fcmToken: String,
  fcmResponse: mongoose.Schema.Types.Mixed,

  // Failure Details
  failureReason: String,
  retryCount: {
    type: Number,
    default: 0,
  },
  lastRetryAt: Date,

  // Tracking
  deliveredAt: Date,
  openedAt: Date,

  // User Context
  userTimezone: String,
  userCountry: String,

  createdAt: {
    type: Date,
    default: Date.now,
    expires: 604800, // Auto-delete after 7 days (in seconds)
  },
});

// User Daily Notification Counter (Auto-delete after 1 day)
const userNotificationCounterSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Player",
    required: true,
    index: true,
  },
  date: {
    type: String, // Format: YYYY-MM-DD
    required: true,
    index: true,
  },
  count: {
    type: Number,
    default: 0,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 86400, // Auto-delete after 1 day
  },
});

// Compound index for efficient queries
userNotificationCounterSchema.index({ userId: 1, date: 1 }, { unique: true });
notificationDeliveryLogSchema.index({ notificationId: 1, userId: 1 });
notificationDeliveryLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 604800 }
);

// Models
const NotificationConfig = mongoose.model(
  "NotificationConfig",
  notificationConfigSchema
);
const Notification = mongoose.model("Notification", notificationSchema);
const NotificationDeliveryLog = mongoose.model(
  "NotificationDeliveryLog",
  notificationDeliveryLogSchema
);
const UserNotificationCounter = mongoose.model(
  "UserNotificationCounter",
  userNotificationCounterSchema
);

module.exports = {
  NotificationConfig,
  Notification,
  NotificationDeliveryLog,
  UserNotificationCounter,
};
