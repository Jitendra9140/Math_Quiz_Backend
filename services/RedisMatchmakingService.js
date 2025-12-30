// handlers/socketHandler.js
const {
  RedisMatchmakingService,
} = require("../services/RedisMatchmakingService");
const { GameRoomManager } = require("../services/GameRoomManager");
const { PlayerManager } = require("../services/PlayerManager");
const { QuestionService } = require("../services/QuestionService");
const { getRedisClient } = require("../config/redis");

module.exports = function registerSocketHandlers(io) {
  const playerManager = new PlayerManager();
  const questionService = new QuestionService();
  const gameRoomManager = new GameRoomManager(questionService, io);
  const matchmakingService = new RedisMatchmakingService(
    playerManager,
    gameRoomManager
  );

  io.on("connection", async (socket) => {
    console.log(`✅ Player connected: ${socket.id}`);

    // Test Redis connection
    try {
      const redis = await getRedisClient();
      await redis.ping();
      console.log("✅ Redis connection verified");
    } catch (err) {
      console.error("❌ Redis connection failed:", err);
    }

    /* ========================================
       JOIN LOBBY & START MATCHMAKING
    ======================================== */
    socket.on("join-lobby", async (playerData) => {
      try {
        if (!playerData.userId) {
          throw new Error("userId (MongoDB ID) is required");
        }

        socket.join(socket.id);

        const player = playerManager.addPlayer(socket.id, {
          id: playerData.userId,
          username: playerData.username,
          email: playerData.email,
          rating: playerData.rating,
          diff: playerData.diff,
          timer: playerData.timer,
          symbol: playerData.symbol,
        });

        socket.emit("lobby-joined", {
          success: true,
          player: {
            id: player.id,
            socketId: player.socketId,
            username: player.username,
            rating: player.rating,
          },
        });

        console.log(
          `✅ ${player.username} joined lobby (Rating: ${player.rating})`
        );
        console.log(`✅ Socket ${socket.id} joined room ${socket.id}`);

        const queueStatus = await matchmakingService.getQueueStatus();
        console.log(
          `📊 Queue status: ${queueStatus.totalInQueue} players waiting`
        );

        // Start Redis-based matchmaking
        await matchmakingService.findMatch(player, (gameRoom) => {
          console.log(`🎮 Match found: ${player.username} vs opponent`);

          const opponent = gameRoom.getOpposingPlayer(player.id);

          // Notify both players about the match
          const players = gameRoom.getPlayers();
          players.forEach((p) => {
            const otherPlayer = players.find((pl) => pl.id !== p.id);

            console.log(
              `📤 Sending match-found to ${p.username} (${p.socketId})`
            );

            io.to(p.socketId).emit("match-found", {
              gameRoom: gameRoom.getPublicData(),
              opponent: {
                id: otherPlayer.id,
                username: otherPlayer.username,
                rating: otherPlayer.rating,
              },
              myPlayerId: p.id,
              initialQuestionMeter: gameRoom.questionMeter,
            });
          });

          // Start the game after a brief delay
          setTimeout(() => {
            gameRoom.startGame();
            console.log(`🚀 GAME STARTED: ${gameRoom.id}`);

            players.forEach((p) => {
              console.log(`📤 Sending game-started to ${p.username}`);

              io.to(p.socketId).emit("game-started", {
                gameState: gameRoom.getGameState(),
                currentQuestion: gameRoom.getCurrentQuestion(),
                myPlayerId: p.id,
              });
            });
          }, 3000);
        });
      } catch (error) {
        console.error("❌ join-lobby error:", error);
        socket.emit("error", { message: error.message });
      }
    });

    /* ========================================
       CANCEL MATCHMAKING SEARCH
    ======================================== */
    socket.on("cancel_search", async () => {
      try {
        const player = playerManager.getPlayer(socket.id);
        if (player) {
          await matchmakingService.removeFromQueue(player);
          console.log(`❌ ${player.username} cancelled search`);

          socket.emit("search-cancelled", {
            message: "Matchmaking cancelled",
          });
        }
      } catch (error) {
        console.error("❌ cancel_search error:", error);
      }
    });

    /* ========================================
       SUBMIT ANSWER
    ======================================== */
    socket.on("submit-answer", (data) => {
      try {
        const player = playerManager.getPlayer(socket.id);
        if (!player) throw new Error("Player not found");

        const gameRoom = gameRoomManager.getPlayerGameRoom(player.id);
        if (!gameRoom) throw new Error("Game room not found");

        gameRoom.submitAnswer(player.id, data.answer, data.timeSpent);

        const opponent = gameRoom.getOpposingPlayer(player.id);
        if (opponent) {
          const playerScore = gameRoom.playerScores.get(player.id);
          io.to(opponent.socketId).emit("opponent-score-update", {
            opponentId: player.id,
            score: playerScore.score,
            correctAnswers: playerScore.correctAnswers,
          });
        }

        gameRoom.emitNextQuestion(player.id);
      } catch (err) {
        console.error("❌ submit-answer error:", err);
        socket.emit("error", { message: err.message });
      }
    });

    /* ========================================
       GET GAME STATE
    ======================================== */
    socket.on("get-game-state", () => {
      try {
        const player = playerManager.getPlayer(socket.id);
        if (!player) throw new Error("Player not found");

        const gameRoom = gameRoomManager.getPlayerGameRoom(player.id);
        if (!gameRoom) throw new Error("Game room not found");

        socket.emit("game-state-update", {
          gameState: gameRoom.getGameState(),
          currentQuestion: gameRoom.getCurrentQuestion(),
          questionMeter: gameRoom.questionMeter,
          myPlayerId: player.id,
        });
      } catch (error) {
        socket.emit("error", { message: error.message });
      }
    });

    /* ========================================
       GAME ENDED (NORMAL OR TIME EXPIRED)
    ======================================== */
    socket.on("game-ended", async () => {
      try {
        const player = playerManager.getPlayer(socket.id);
        if (!player) {
          console.log("❌ Player not found for game-ended");
          return;
        }

        const gameRoom = gameRoomManager.getPlayerGameRoom(player.id);
        if (!gameRoom) {
          console.log("❌ Game room not found for game-ended");
          return;
        }

        console.log(`🏁 Game ended for room: ${gameRoom.id}`);

        // End the game if not already ended
        if (gameRoom.gameState !== "completed") {
          await gameRoom.endGame();
        }

        // ✅ CRITICAL: Clean up the game room
        gameRoomManager.removeGameRoom(gameRoom.id);

        console.log(`✅ Game cleanup complete for ${player.username}`);
      } catch (error) {
        console.error("❌ game-ended error:", error);
      }
    });

    /* ========================================
       GET QUEUE STATUS (ADMIN/DEBUG)
    ======================================== */
    socket.on("get-queue-status", async () => {
      try {
        const status = await matchmakingService.getQueueStatus();
        const avgWaitTime = await matchmakingService.getAverageWaitTime();

        socket.emit("queue-status", {
          ...status,
          averageWaitTime: avgWaitTime,
        });
      } catch (error) {
        console.error("❌ get-queue-status error:", error);
        socket.emit("error", { message: error.message });
      }
    });

    /* ========================================
       DISCONNECT HANDLER
    ======================================== */
    socket.on("disconnect", async () => {
      console.log(`👋 Player disconnected: ${socket.id}`);

      const player = playerManager.getPlayer(socket.id);
      if (!player) {
        return;
      }

      console.log(`🔍 Handling disconnect for ${player.username}`);

      // 1. REMOVE FROM MATCHMAKING QUEUE
      await matchmakingService.removeFromQueue(player);
      console.log("✅ Removed from matchmaking queue");

      // 2. HANDLE GAME ROOM DISCONNECTION
      const gameRoom = gameRoomManager.getPlayerGameRoom(player.id);

      if (gameRoom) {
        console.log(`🎮 ${player.username} was in game room: ${gameRoom.id}`);

        // Handle the disconnect in the game room
        const gameResults = await gameRoom.handlePlayerDisconnect(player.id);

        // Get the remaining player
        const remainingPlayer = gameRoom
          .getPlayers()
          .find((p) => p.id !== player.id);

        if (remainingPlayer && gameResults) {
          console.log(`🏆 ${remainingPlayer.username} wins by disconnect`);

          io.to(remainingPlayer.socketId).emit("game-ended", {
            reason: "opponent-disconnect",
            gameResults: gameResults,
            message: `${player.username} disconnected. You win!`,
          });

          console.log(`📤 Sent game-ended to ${remainingPlayer.username}`);
        }

        // ✅ CRITICAL: Remove the game room
        gameRoomManager.removeGameRoom(gameRoom.id);
        console.log(`🗑️ Game room removed: ${gameRoom.id}`);
      }

      // 3. REMOVE PLAYER (with grace period for reconnect)
      playerManager.removePlayer(socket.id);
      console.log(`🗑️ Player removed: ${player.username}`);
    });
  });

  // Cleanup on server shutdown
  process.on("SIGTERM", async () => {
    console.log("🛑 Server shutting down, cleaning up matchmaking...");
    await matchmakingService.destroy();
  });

  process.on("SIGINT", async () => {
    console.log("🛑 Server interrupted, cleaning up matchmaking...");
    await matchmakingService.destroy();
  });
};
