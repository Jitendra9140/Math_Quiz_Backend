// routes/challengeRoutes.js
const express = require("express");
const router = express.Router();
const pvpChallengeController = require("../controllers/pvpChallengeController");
const auth = require("../middleware/auth");

// Get online players available for challenge
router.get("/online-players", auth, pvpChallengeController.getOnlinePlayers);

// Search players by username
router.get("/search", auth, pvpChallengeController.searchPlayers);

// Get specific player by username
router.get(
  "/player/:username",
  auth,
  pvpChallengeController.getPlayerByUsername
);

// Get challenge history with specific opponent
router.get(
  "/history/:opponentId",
  auth,
  pvpChallengeController.getChallengeHistory
);

// Get leaderboard for challenges
router.get("/leaderboard", auth, pvpChallengeController.getLeaderboard);

// Get my challenge statistics
router.get("/my-stats", auth, pvpChallengeController.getMyStats);

module.exports = router;
