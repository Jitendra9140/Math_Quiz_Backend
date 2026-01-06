// controllers/pvpChallengeController.js
const Player = require("../models/Player");
const PVPGame = require("../models/PVPGame");
const admin = require("firebase-admin");

class PVPChallengeController {
  constructor(io, playerManager, gameRoomManager, questionService) {
    this.io = io;
    this.playerManager = playerManager;
    this.gameRoomManager = gameRoomManager;
    this.questionService = questionService;

    // Store active challenges: challengeId -> challenge object
    this.activeChallenges = new Map();

    // Track pending challenges per player: playerId -> Set of challengeIds
    this.playerChallenges = new Map();

    // Cleanup expired challenges every 2 minutes
    this.cleanupInterval = setInterval(
      () => this.cleanupExpiredChallenges(),
      120000
    );
  }

  /**
   * Send Firebase notification
   */
  async sendNotification(fcmToken, title, body, data = {}) {
    if (!fcmToken) {
      console.log("⚠️ No FCM token available");
      return null;
    }

    try {
      const payload = {
        token: fcmToken,
        notification: {
          title,
          body,
        },
        data: {
          ...data,
          timestamp: Date.now().toString(),
        },
      };

      const response = await admin.messaging().send(payload);
      console.log("📲 Notification sent successfully:", response);
      return response;
    } catch (error) {
      console.error("❌ Error sending notification:", error);
      return null;
    }
  }

  /**
   * Get player from database with FCM token
   */
  async getPlayerFromDB(playerId) {
    try {
      return await Player.findById(playerId);
    } catch (error) {
      console.error("❌ Error fetching player from DB:", error);
      return null;
    }
  }

  /**
   * Generate unique challenge ID
   */
  generateChallengeId(challengerId, challengedId) {
    return `challenge_${challengerId}_${challengedId}_${Date.now()}`;
  }

  /**
   * Send a challenge from one player to another
   */
  async sendChallenge(
    challengerSocketId,
    targetIdentifier,
    customSettings = null
  ) {
    try {
      // Get challenger
      const challenger = this.playerManager.getPlayer(challengerSocketId);
      if (!challenger) {
        throw new Error("Challenger not found");
      }

      // Prevent challenging if already in game
      if (challenger.isInGame) {
        throw new Error("You are already in a game");
      }

      // Find target player by username or userId
      let targetPlayer = null;

      // Try to find by userId first
      if (targetIdentifier.userId) {
        targetPlayer = this.playerManager.getPlayerById(
          targetIdentifier.userId
        );
      }

      // If not found, try by username
      if (!targetPlayer && targetIdentifier.username) {
        const allPlayers = this.playerManager.getAllPlayers();
        targetPlayer = allPlayers.find(
          (p) =>
            p.username.toLowerCase() === targetIdentifier.username.toLowerCase()
        );
      }

      if (!targetPlayer) {
        throw new Error("Player not found or offline");
      }

      // Prevent self-challenge
      if (challenger.id === targetPlayer.id) {
        throw new Error("You cannot challenge yourself");
      }

      // Check if target is in game
      if (targetPlayer.isInGame) {
        throw new Error(`${targetPlayer.username} is currently in a game`);
      }

      // Check if challenge already exists
      const existingChallenge = Array.from(this.activeChallenges.values()).find(
        (c) =>
          (c.challenger.id === challenger.id &&
            c.challenged.id === targetPlayer.id) ||
          (c.challenger.id === targetPlayer.id &&
            c.challenged.id === challenger.id)
      );

      if (existingChallenge) {
        throw new Error(
          "A challenge already exists between you and this player"
        );
      }

      // Use custom settings if provided, otherwise use challenger's settings
      const settings = customSettings || {
        diff: challenger.diff,
        timer: challenger.timer,
        symbol: challenger.symbol,
      };

      // Create challenge
      const challengeId = this.generateChallengeId(
        challenger.id,
        targetPlayer.id
      );

      const challenge = {
        id: challengeId,
        challenger: {
          id: challenger.id,
          username: challenger.username,
          rating: challenger.rating,
          socketId: challenger.socketId,
        },
        challenged: {
          id: targetPlayer.id,
          username: targetPlayer.username,
          rating: targetPlayer.rating,
          socketId: targetPlayer.socketId,
        },
        settings: settings,
        status: "pending",
        createdAt: Date.now(),
        expiresAt: Date.now() + 60000, // 1 minute expiration
      };

      // Store challenge
      this.activeChallenges.set(challengeId, challenge);

      // Track challenges per player
      if (!this.playerChallenges.has(challenger.id)) {
        this.playerChallenges.set(challenger.id, new Set());
      }
      if (!this.playerChallenges.has(targetPlayer.id)) {
        this.playerChallenges.set(targetPlayer.id, new Set());
      }
      this.playerChallenges.get(challenger.id).add(challengeId);
      this.playerChallenges.get(targetPlayer.id).add(challengeId);

      // Notify challenger via socket
      this.io.to(challenger.socketId).emit("challenge-sent", {
        challengeId,
        challenged: {
          id: targetPlayer.id,
          username: targetPlayer.username,
          rating: targetPlayer.rating,
        },
        settings: challenge.settings,
        expiresAt: challenge.expiresAt,
      });

      // Notify challenged player via socket
      this.io.to(targetPlayer.socketId).emit("challenge-received", {
        challengeId,
        challenger: {
          id: challenger.id,
          username: challenger.username,
          rating: challenger.rating,
        },
        settings: challenge.settings,
        expiresAt: challenge.expiresAt,
      });

      // 📲 Send Firebase notification to challenged player
      const targetPlayerDB = await this.getPlayerFromDB(targetPlayer.id);
      if (targetPlayerDB?.fcmToken) {
        await this.sendNotification(
          targetPlayerDB.fcmToken,
          "⚔️ New Challenge!",
          `${challenger.username} challenges you to a PVP match!`,
          {
            type: "CHALLENGE_RECEIVED",
            challengeId,
            challengerId: challenger.id,
            challengerUsername: challenger.username,
            challengerRating: challenger.rating.toString(),
            difficulty: challenge.settings.diff,
            timer: challenge.settings.timer.toString(),
          }
        );
      }

      console.log(
        `⚔️ Challenge sent: ${challenger.username} → ${targetPlayer.username} (${challengeId})`
      );
      console.log(`   Settings: ${JSON.stringify(challenge.settings)}`);

      // Auto-expire challenge after 1 minute
      setTimeout(() => this.expireChallenge(challengeId), 60000);

      return {
        success: true,
        challengeId,
        message: `Challenge sent to ${targetPlayer.username}`,
      };
    } catch (error) {
      console.error("❌ Error sending challenge:", error);
      throw error;
    }
  }

  /**
   * Accept a challenge
   */
  async acceptChallenge(accepterSocketId, challengeId) {
    try {
      const challenge = this.activeChallenges.get(challengeId);

      if (!challenge) {
        throw new Error("Challenge not found or expired");
      }

      if (challenge.status !== "pending") {
        throw new Error("Challenge is no longer available");
      }

      // Get accepter
      const accepter = this.playerManager.getPlayer(accepterSocketId);
      if (!accepter) {
        throw new Error("Player not found");
      }

      // Verify accepter is the challenged player
      if (accepter.id !== challenge.challenged.id) {
        throw new Error("You are not the challenged player");
      }

      // Check if either player is in game
      const challenger = this.playerManager.getPlayerById(
        challenge.challenger.id
      );
      if (!challenger) {
        throw new Error("Challenger is no longer online");
      }

      if (challenger.isInGame) {
        throw new Error("Challenger is now in a game");
      }

      if (accepter.isInGame) {
        throw new Error("You are already in a game");
      }

      // Mark challenge as accepted
      challenge.status = "accepted";
      challenge.acceptedAt = Date.now();

      console.log(
        `✅ Challenge accepted: ${challenge.challenged.username} accepted ${challenge.challenger.username}'s challenge`
      );

      // 📲 Send Firebase notification to challenger
      const challengerDB = await this.getPlayerFromDB(challenge.challenger.id);
      if (challengerDB?.fcmToken) {
        await this.sendNotification(
          challengerDB.fcmToken,
          "✅ Challenge Accepted!",
          `${accepter.username} accepted your challenge. Game starting soon!`,
          {
            type: "CHALLENGE_ACCEPTED",
            challengeId,
            accepterId: accepter.id,
            accepterUsername: accepter.username,
            accepterRating: accepter.rating.toString(),
          }
        );
      }

      // Create game room
      const gameRoom = await this.createChallengeGame(
        challenger,
        accepter,
        challenge.settings
      );

      // Remove challenge after game creation
      this.removeChallenge(challengeId);

      return {
        success: true,
        gameRoom: gameRoom.getPublicData(),
        message: "Challenge accepted! Starting game...",
      };
    } catch (error) {
      console.error("❌ Error accepting challenge:", error);
      throw error;
    }
  }

  /**
   * Decline a challenge
   */
  async declineChallenge(declinerSocketId, challengeId) {
    try {
      const challenge = this.activeChallenges.get(challengeId);

      if (!challenge) {
        throw new Error("Challenge not found or expired");
      }

      // Get decliner
      const decliner = this.playerManager.getPlayer(declinerSocketId);
      if (!decliner) {
        throw new Error("Player not found");
      }

      // Verify decliner is the challenged player
      if (decliner.id !== challenge.challenged.id) {
        throw new Error("You are not the challenged player");
      }

      challenge.status = "declined";

      // Notify challenger via socket
      this.io.to(challenge.challenger.socketId).emit("challenge-declined", {
        challengeId,
        decliner: {
          id: decliner.id,
          username: decliner.username,
        },
        message: `${decliner.username} declined your challenge`,
      });

      // Notify decliner via socket
      this.io.to(decliner.socketId).emit("challenge-declined-by-you", {
        challengeId,
        message: "Challenge declined",
      });

      // 📲 Send Firebase notification to challenger
      const challengerDB = await this.getPlayerFromDB(challenge.challenger.id);
      if (challengerDB?.fcmToken) {
        await this.sendNotification(
          challengerDB.fcmToken,
          "❌ Challenge Declined",
          `${decliner.username} declined your challenge.`,
          {
            type: "CHALLENGE_DECLINED",
            challengeId,
            declinerId: decliner.id,
            declinerUsername: decliner.username,
          }
        );
      }

      console.log(
        `❌ Challenge declined: ${challenge.challenged.username} declined ${challenge.challenger.username}'s challenge`
      );

      // Remove challenge
      this.removeChallenge(challengeId);

      return {
        success: true,
        message: "Challenge declined",
      };
    } catch (error) {
      console.error("❌ Error declining challenge:", error);
      throw error;
    }
  }

  /**
   * Cancel a challenge (by challenger)
   */
  async cancelChallenge(cancellerSocketId, challengeId) {
    try {
      const challenge = this.activeChallenges.get(challengeId);

      if (!challenge) {
        throw new Error("Challenge not found or expired");
      }

      // Get canceller
      const canceller = this.playerManager.getPlayer(cancellerSocketId);
      if (!canceller) {
        throw new Error("Player not found");
      }

      // Verify canceller is the challenger
      if (canceller.id !== challenge.challenger.id) {
        throw new Error("You are not the challenger");
      }

      challenge.status = "cancelled";

      // Notify challenged player via socket
      this.io.to(challenge.challenged.socketId).emit("challenge-cancelled", {
        challengeId,
        canceller: {
          id: canceller.id,
          username: canceller.username,
        },
        message: `${canceller.username} cancelled the challenge`,
      });

      // Notify canceller via socket
      this.io.to(canceller.socketId).emit("challenge-cancelled-by-you", {
        challengeId,
        message: "Challenge cancelled",
      });

      // 📲 Send Firebase notification to challenged player
      const challengedDB = await this.getPlayerFromDB(challenge.challenged.id);
      if (challengedDB?.fcmToken) {
        await this.sendNotification(
          challengedDB.fcmToken,
          "🚫 Challenge Cancelled",
          `${canceller.username} cancelled the challenge.`,
          {
            type: "CHALLENGE_CANCELLED",
            challengeId,
            cancellerId: canceller.id,
            cancellerUsername: canceller.username,
          }
        );
      }

      console.log(
        `🚫 Challenge cancelled: ${challenge.challenger.username} cancelled challenge to ${challenge.challenged.username}`
      );

      // Remove challenge
      this.removeChallenge(challengeId);

      return {
        success: true,
        message: "Challenge cancelled",
      };
    } catch (error) {
      console.error("❌ Error cancelling challenge:", error);
      throw error;
    }
  }

  /**
   * Create game room for challenge match
   */
  async createChallengeGame(player1, player2, settings) {
    try {
      // Update player settings to match challenge settings
      player1.diff = settings.diff;
      player1.timer = settings.timer;
      player1.symbol = settings.symbol;

      player2.diff = settings.diff;
      player2.timer = settings.timer;
      player2.symbol = settings.symbol;

      // Create game room
      const gameRoom = this.gameRoomManager.createGameRoom([player1, player2]);

      // Mark players as in game
      player1.isInGame = true;
      player2.isInGame = true;

      // Notify both players via socket
      const players = [player1, player2];
      players.forEach((p) => {
        const opponent = players.find((pl) => pl.id !== p.id);

        this.io.to(p.socketId).emit("match-found", {
          gameRoom: gameRoom.getPublicData(),
          opponent: {
            id: opponent.id,
            username: opponent.username,
            rating: opponent.rating,
          },
          myPlayerId: p.id,
          initialQuestionMeter: gameRoom.questionMeter,
          isChallenge: true,
        });
      });

      // 📲 Send Firebase notifications to both players
      for (const player of players) {
        const opponent = players.find((pl) => pl.id !== player.id);
        const playerDB = await this.getPlayerFromDB(player.id);

        if (playerDB?.fcmToken) {
          await this.sendNotification(
            playerDB.fcmToken,
            "🎮 Match Starting!",
            `Your challenge match vs ${opponent.username} is about to begin!`,
            {
              type: "MATCH_STARTING",
              gameRoomId: gameRoom.id,
              opponentId: opponent.id,
              opponentUsername: opponent.username,
              isChallenge: "true",
            }
          );
        }
      }

      console.log(
        `🎮 Challenge game created: ${player1.username} vs ${player2.username}`
      );

      // Start game after 3 seconds
      setTimeout(() => {
        gameRoom.startGame();
        console.log(`🚀 Challenge game started: ${gameRoom.id}`);

        players.forEach((p) => {
          this.io.to(p.socketId).emit("game-started", {
            gameState: gameRoom.getGameState(),
            currentQuestion: gameRoom.getCurrentQuestion(),
            myPlayerId: p.id,
            isChallenge: true,
          });
        });
      }, 3000);

      return gameRoom;
    } catch (error) {
      console.error("❌ Error creating challenge game:", error);
      throw error;
    }
  }

  /**
   * Get pending challenges for a player
   */
  getPlayerChallenges(playerId) {
    const challengeIds = this.playerChallenges.get(playerId) || new Set();
    const challenges = [];

    for (const challengeId of challengeIds) {
      const challenge = this.activeChallenges.get(challengeId);
      if (challenge && challenge.status === "pending") {
        challenges.push({
          id: challenge.id,
          type: challenge.challenger.id === playerId ? "sent" : "received",
          opponent:
            challenge.challenger.id === playerId
              ? challenge.challenged
              : challenge.challenger,
          settings: challenge.settings,
          expiresAt: challenge.expiresAt,
          timeRemaining: Math.max(0, challenge.expiresAt - Date.now()),
        });
      }
    }

    return challenges;
  }

  /**
   * Expire a challenge
   */
  async expireChallenge(challengeId) {
    const challenge = this.activeChallenges.get(challengeId);

    if (!challenge || challenge.status !== "pending") {
      return;
    }

    challenge.status = "expired";

    // Notify both players via socket
    this.io.to(challenge.challenger.socketId).emit("challenge-expired", {
      challengeId,
      message: "Challenge expired",
    });

    this.io.to(challenge.challenged.socketId).emit("challenge-expired", {
      challengeId,
      message: "Challenge expired",
    });

    // 📲 Send Firebase notification to both players
    const challengerDB = await this.getPlayerFromDB(challenge.challenger.id);
    const challengedDB = await this.getPlayerFromDB(challenge.challenged.id);

    if (challengerDB?.fcmToken) {
      await this.sendNotification(
        challengerDB.fcmToken,
        "⏱️ Challenge Expired",
        `Your challenge to ${challenge.challenged.username} has expired.`,
        {
          type: "CHALLENGE_EXPIRED",
          challengeId,
          opponentUsername: challenge.challenged.username,
        }
      );
    }

    if (challengedDB?.fcmToken) {
      await this.sendNotification(
        challengedDB.fcmToken,
        "⏱️ Challenge Expired",
        `Challenge from ${challenge.challenger.username} has expired.`,
        {
          type: "CHALLENGE_EXPIRED",
          challengeId,
          opponentUsername: challenge.challenger.username,
        }
      );
    }

    console.log(`⏱️ Challenge expired: ${challengeId}`);

    // Remove challenge
    this.removeChallenge(challengeId);
  }

  /**
   * Remove challenge from storage
   */
  removeChallenge(challengeId) {
    const challenge = this.activeChallenges.get(challengeId);

    if (challenge) {
      // Remove from player tracking
      const challengerChallenges = this.playerChallenges.get(
        challenge.challenger.id
      );
      if (challengerChallenges) {
        challengerChallenges.delete(challengeId);
      }

      const challengedChallenges = this.playerChallenges.get(
        challenge.challenged.id
      );
      if (challengedChallenges) {
        challengedChallenges.delete(challengeId);
      }

      // Remove challenge
      this.activeChallenges.delete(challengeId);
    }
  }

  /**
   * Cleanup expired challenges
   */
  cleanupExpiredChallenges() {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [challengeId, challenge] of this.activeChallenges) {
      if (challenge.expiresAt < now && challenge.status === "pending") {
        this.expireChallenge(challengeId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned up ${cleanedCount} expired challenges`);
    }
  }

  /**
   * Get challenge statistics
   */
  getStatistics() {
    const stats = {
      totalActive: this.activeChallenges.size,
      byStatus: {
        pending: 0,
        accepted: 0,
        declined: 0,
        cancelled: 0,
        expired: 0,
      },
    };

    for (const challenge of this.activeChallenges.values()) {
      stats.byStatus[challenge.status]++;
    }

    return stats;
  }

  /**
   * Clean up on player disconnect
   */
  async handlePlayerDisconnect(playerId) {
    const challengeIds = this.playerChallenges.get(playerId);

    if (!challengeIds) return;

    for (const challengeId of challengeIds) {
      const challenge = this.activeChallenges.get(challengeId);

      if (challenge && challenge.status === "pending") {
        // Cancel challenge if challenger disconnects
        if (challenge.challenger.id === playerId) {
          challenge.status = "cancelled";

          // Notify via socket
          this.io
            .to(challenge.challenged.socketId)
            .emit("challenge-cancelled", {
              challengeId,
              reason: "disconnect",
              message: `${challenge.challenger.username} disconnected`,
            });

          // 📲 Send Firebase notification
          const challengedDB = await this.getPlayerFromDB(
            challenge.challenged.id
          );
          if (challengedDB?.fcmToken) {
            await this.sendNotification(
              challengedDB.fcmToken,
              "🔌 Challenge Cancelled",
              `${challenge.challenger.username} disconnected. Challenge cancelled.`,
              {
                type: "CHALLENGE_CANCELLED_DISCONNECT",
                challengeId,
                challengerUsername: challenge.challenger.username,
              }
            );
          }

          console.log(
            `🔌 Challenge auto-cancelled due to disconnect: ${challengeId}`
          );

          this.removeChallenge(challengeId);
        }
      }
    }
  }

  /**
   * Destroy controller and cleanup
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Cancel all pending challenges
    for (const challengeId of this.activeChallenges.keys()) {
      this.expireChallenge(challengeId);
    }

    console.log("🛑 PVPChallengeController destroyed");
  }

  /* ========================================
     ROUTE CONTROLLER METHODS (STATIC)
  ======================================== */

  /**
   * GET /api/challenge/online-players
   * Get all online players available for challenge
   */
  static getOnlinePlayers(req, res) {
    try {
      const currentUserId = req.user.id;
      const { playerManager } = req.app.locals;

      if (!playerManager) {
        return res.status(500).json({
          success: false,
          message: "Service unavailable",
        });
      }

      const onlinePlayers = playerManager
        .getAllPlayers()
        .filter((p) => p.id !== currentUserId && !p.isInGame)
        .map((p) => ({
          id: p.id,
          username: p.username,
          rating: p.rating,
          diff: p.diff,
          timer: p.timer,
          gamesPlayed: p.gamesPlayed,
          wins: p.wins,
          losses: p.losses,
        }));

      res.json({
        success: true,
        players: onlinePlayers,
        total: onlinePlayers.length,
      });
    } catch (error) {
      console.error("❌ Error fetching online players:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch online players",
      });
    }
  }

  /**
   * GET /api/challenge/search?query=username
   * Search players by username
   */
  static async searchPlayers(req, res) {
    try {
      const { query, limit = 10 } = req.query;
      const currentUserId = req.user.id;

      if (!query || query.length < 2) {
        return res.json({
          success: true,
          players: [],
          message: "Query too short",
        });
      }

      const players = await Player.find({
        _id: { $ne: currentUserId },
        username: { $regex: query, $options: "i" },
      })
        .limit(parseInt(limit))
        .select("username pr gamesPlayed")
        .lean();

      const { playerManager } = req.app.locals;
      const onlinePlayerIds = new Set(
        playerManager ? playerManager.getAllPlayers().map((p) => p.id) : []
      );

      const results = players.map((player) => ({
        id: player._id,
        username: player.username,
        rating: player.pr?.pvp?.medium || 1200,
        gamesPlayed: player.gamesPlayed || 0,
        isOnline: onlinePlayerIds.has(player._id.toString()),
      }));

      res.json({
        success: true,
        players: results,
        total: results.length,
      });
    } catch (error) {
      console.error("❌ Error searching players:", error);
      res.status(500).json({
        success: false,
        message: "Failed to search players",
      });
    }
  }

  /**
   * GET /api/challenge/player/:username
   * Get specific player by username
   */
  static async getPlayerByUsername(req, res) {
    try {
      const { username } = req.params;
      const currentUserId = req.user.id;

      const player = await Player.findOne({
        username: { $regex: `^${username}$`, $options: "i" },
      })
        .select("username pr gamesPlayed")
        .lean();

      if (!player) {
        return res.status(404).json({
          success: false,
          message: "Player not found",
        });
      }

      if (player._id.toString() === currentUserId) {
        return res.status(400).json({
          success: false,
          message: "Cannot challenge yourself",
        });
      }

      const { playerManager } = req.app.locals;
      const onlinePlayer = playerManager
        ? playerManager.getPlayerById(player._id.toString())
        : null;

      res.json({
        success: true,
        player: {
          id: player._id,
          username: player.username,
          rating: player.pr?.pvp?.medium || 1200,
          gamesPlayed: player.gamesPlayed || 0,
          isOnline: !!onlinePlayer,
          isInGame: onlinePlayer?.isInGame || false,
        },
      });
    } catch (error) {
      console.error("❌ Error fetching player:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch player",
      });
    }
  }

  /**
   * GET /api/challenge/history/:opponentId
   * Get challenge history with specific opponent
   */
  static async getChallengeHistory(req, res) {
    try {
      const currentUserId = req.user.id;
      const { opponentId } = req.params;
      const { limit = 10 } = req.query;

      const games = await PVPGame.find({
        $or: [
          { player1: currentUserId, player2: opponentId },
          { player1: opponentId, player2: currentUserId },
        ],
      })
        .sort({ playedAt: -1 })
        .limit(parseInt(limit))
        .populate("player1", "username")
        .populate("player2", "username")
        .lean();

      let wins = 0;
      let losses = 0;
      let draws = 0;

      games.forEach((game) => {
        if (game.result === "Draw") {
          draws++;
        } else if (game.winner?.toString() === currentUserId) {
          wins++;
        } else {
          losses++;
        }
      });

      res.json({
        success: true,
        history: {
          games: games.map((game) => ({
            id: game._id,
            player1: game.player1.username,
            player2: game.player2.username,
            scorePlayer1: game.scorePlayer1,
            scorePlayer2: game.scorePlayer2,
            result: game.result,
            winner: game.winner,
            duration: game.gameDuration,
            playedAt: game.playedAt,
          })),
          stats: {
            totalGames: games.length,
            wins,
            losses,
            draws,
            winRate:
              games.length > 0 ? ((wins / games.length) * 100).toFixed(1) : 0,
          },
        },
      });
    } catch (error) {
      console.error("❌ Error fetching challenge history:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch challenge history",
      });
    }
  }

  /**
   * GET /api/challenge/leaderboard?difficulty=medium
   * Get leaderboard for challenges
   */
  static async getLeaderboard(req, res) {
    try {
      const { difficulty = "medium", limit = 20 } = req.query;

      const players = await Player.find({
        [`pr.pvp.${difficulty}`]: { $exists: true },
      })
        .sort({ [`pr.pvp.${difficulty}`]: -1 })
        .limit(parseInt(limit))
        .select("username pr gamesPlayed")
        .lean();

      const { playerManager } = req.app.locals;
      const onlinePlayerIds = new Set(
        playerManager ? playerManager.getAllPlayers().map((p) => p.id) : []
      );

      const leaderboard = players.map((player, index) => ({
        rank: index + 1,
        id: player._id,
        username: player.username,
        rating: player.pr?.pvp?.[difficulty] || 1200,
        gamesPlayed: player.gamesPlayed || 0,
        isOnline: onlinePlayerIds.has(player._id.toString()),
      }));

      res.json({
        success: true,
        leaderboard,
        difficulty,
      });
    } catch (error) {
      console.error("❌ Error fetching leaderboard:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch leaderboard",
      });
    }
  }

  /**
   * GET /api/challenge/my-stats
   * Get my challenge statistics
   */
  static async getMyStats(req, res) {
    try {
      const currentUserId = req.user.id;

      const player = await Player.findById(currentUserId)
        .select("username pr gamesPlayed")
        .lean();

      if (!player) {
        return res.status(404).json({
          success: false,
          message: "Player not found",
        });
      }

      // Get recent games
      const recentGames = await PVPGame.find({
        $or: [{ player1: currentUserId }, { player2: currentUserId }],
      })
        .sort({ playedAt: -1 })
        .limit(10)
        .populate("player1", "username")
        .populate("player2", "username")
        .lean();

      // Calculate stats
      let totalWins = 0;
      let totalLosses = 0;
      let totalDraws = 0;

      recentGames.forEach((game) => {
        if (game.result === "Draw") {
          totalDraws++;
        } else if (game.winner?.toString() === currentUserId) {
          totalWins++;
        } else {
          totalLosses++;
        }
      });

      res.json({
        success: true,
        stats: {
          username: player.username,
          rating: player.pr?.pvp?.medium || 1200,
          gamesPlayed: player.gamesPlayed || 0,
          wins: totalWins,
          losses: totalLosses,
          draws: totalDraws,
          winRate:
            recentGames.length > 0
              ? ((totalWins / recentGames.length) * 100).toFixed(1)
              : 0,
          recentGames: recentGames.map((game) => ({
            id: game._id,
            opponent:
              game.player1._id.toString() === currentUserId
                ? game.player2.username
                : game.player1.username,
            result:
              game.result === "Draw"
                ? "Draw"
                : game.winner?.toString() === currentUserId
                ? "Win"
                : "Loss",
            score:
              game.player1._id.toString() === currentUserId
                ? `${game.scorePlayer1} - ${game.scorePlayer2}`
                : `${game.scorePlayer2} - ${game.scorePlayer1}`,
            playedAt: game.playedAt,
          })),
        },
      });
    } catch (error) {
      console.error("❌ Error fetching stats:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch statistics",
      });
    }
  }
}

module.exports = { PVPChallengeController };

