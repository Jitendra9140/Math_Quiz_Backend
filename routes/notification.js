const express = require("express");
const router = express.Router();
const {
  createNotification,
  sendNotification,
  getAnalytics,
  getOverallAnalytics,
  getHistory,
  updateNotification,
  stopNotification,
  getDeliveryLogs,
  trackOpen,
  getInAppNotifications,
  retryFailed,
  updateConfig,
} = require("../controller/Notification");

// Configuration Routes
router.put("/notifications/config", updateConfig);

// Notification CRUD Routes
router.post("/notifications", createNotification);

router.put("/notifications/:notificationId", updateNotification);

router.post("/notifications/:notificationId/send", sendNotification);

router.post("/notifications/:notificationId/stop", stopNotification);

router.post("/notifications/:notificationId/retry", retryFailed);


router.get("/notifications/in-app", getInAppNotifications);

// Analytics Routes
router.get("/analytics/overall", getOverallAnalytics);

router.get("/notifications/:notificationId/analytics", getAnalytics);

// History Routes
router.get("/notifications/history", getHistory);

router.get("/notifications/:notificationId/logs", getDeliveryLogs);

// Tracking Routes (can be called from client app)
router.post("/track/open", trackOpen);

module.exports = router;
