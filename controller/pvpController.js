// const { MatchmakingService } = require("../services/MatchmakingService");
// const { GameRoomManager } = require("../services/GameRoomManager");
// const { PlayerManager } = require("../services/PlayerManager");
// const { QuestionService } = require("../services/QuestionService");
// const RedisClient=require("../config/redis")

// module.exports =function registerSocketHandlers(io) {
//   const playerManager = new PlayerManager();
//   const questionService = new QuestionService();
//   const gameRoomManager = new GameRoomManager(questionService, io);
//   const matchmakingService = new MatchmakingService(
//     playerManager,
//     gameRoomManager
//   );

// io.on("connection", async (socket) => {
//     console.log(`Player connected: ${socket.id}`);
    
//     try {
//       const result = await RedisClient.get("foo");
//       console.log("Redis result io:", result);
//     } catch (err) {
//       console.error("Redis failed on connect:", err);
//     }

//     socket.on("join-lobby", (playerData) => {
//       try {
//         // ✅ Ensure userId (MongoDB ID) is present
//         if (!playerData.userId) {
//           throw new Error("userId (MongoDB ID) is required");
//         }
        
//         const player = playerManager.addPlayer(socket.id, {
//           id: playerData.userId, // ✅ Use MongoDB ID as primary ID
//           username: playerData.username,
//           email: playerData.email,
//           rating: playerData.rating,
//           diff: playerData.diff,
//           timer: playerData.timer,
//           symbol: playerData.symbol,
//         });

//         // ✅ Send back MongoDB ID explicitly
//         socket.emit("lobby-joined", {
//           success: true,
//           player: {
//             id: player.id, // MongoDB ID
//             socketId: player.socketId,
//             username: player.username,
//             rating: player.rating,
//           },
//         });

//         console.log("✅ Player joined lobby:", player.id);
//         console.log(
//           "📊 Current queue status:",
//           matchmakingService.getQueueStatus()
//         ); // DEBUG

//         // Start matchmaking
//         matchmakingService.findMatch(player, (gameRoom) => {
//           console.log("🎮 Match found for:", player.id);

//           matchmakingService.removeFromQueue(player);
//           const opponent = gameRoom.getOpposingPlayer(player.id);
//           matchmakingService.removeFromQueue(opponent);

//           // Notify both players about the match
//           const players = gameRoom.getPlayers();
//           players.forEach((p) => {
//             const otherPlayer = players.find((pl) => pl.id !== p.id);

//             console.log(
//               `📤 Sending match-found to ${p.username} (${p.socketId})`
//             ); // DEBUG

//             // ✅ Send complete player data with MongoDB IDs
//             io.to(p.socketId).emit("match-found", {
//               gameRoom: gameRoom.getPublicData(),
//               opponent: {
//                 id: otherPlayer.id, // MongoDB ID
//                 username: otherPlayer.username,
//                 rating: otherPlayer.rating,
//               },
//               myPlayerId: p.id, // ✅ Add this for clarity
//               initialQuestionMeter: gameRoom.questionMeter,
//             });
//           });

//           // Start the game after a brief delay
//           setTimeout(() => {
//             gameRoom.startGame();
//             console.log("🚀 GAME STARTED");

//             players.forEach((p) => {
//               console.log(
//                 `📤 Sending game-started to ${p.username} (${p.socketId})`
//               ); // DEBUG

//               io.to(p.socketId).emit("game-started", {
//                 gameState: gameRoom.getGameState(),
//                 currentQuestion: gameRoom.getCurrentQuestion(),
//                 myPlayerId: p.id, // ✅ Explicitly send MongoDB ID
//               });
//             });
//           }, 3000);
//         });
//       } catch (error) {
//         console.error("❌ join-lobby error:", error);
//         socket.emit("error", { message: error.message });
//       }
//     });

//     socket.on("cancel_search", () => {
//       try {
//         const player = playerManager.getPlayer(socket.id);
//         if (player) {
//           matchmakingService.removeFromQueue(player);
//           console.log("❌ Player cancelled search:", player.id);
//           console.log(
//             "📊 Queue after cancellation:",
//             matchmakingService.getQueueStatus()
//           ); // DEBUG
//         }
//       } catch (error) {
//         console.error("❌ cancel_search error:", error);
//       }
//     });

//     socket.on("submit-answer", (data) => {
//       try {
//         console.log("📝 submit-answer:", data);

//         // ✅ Get player by socket ID
//         const player = playerManager.getPlayer(socket.id);
//         if (!player) throw new Error("Player not found");

//         console.log("✅ Player found:", player.id);

//         const gameRoom = gameRoomManager.getPlayerGameRoom(player.id);
//         if (!gameRoom) throw new Error("Game room not found");

//         console.log("✅ Game room found:", gameRoom.id);

//         // Record the answer
//         const result = gameRoom.submitAnswer(
//           player.id,
//           data.answer,
//           data.timeSpent
//         );

//         console.log("✅ Answer submitted, result:", result);

//         // ✅ Broadcast score update to opponent
//         const opponent = gameRoom.getOpposingPlayer(player.id);
//         if (opponent) {
//           const playerScore = gameRoom.playerScores.get(player.id);
//           io.to(opponent.socketId).emit("opponent-score-update", {
//             opponentId: player.id,
//             score: playerScore.score,
//             correctAnswers: playerScore.correctAnswers,
//           });
//         }

//         // Generate next question for answerer
//         gameRoom.emitNextQuestion(player.id);
//       } catch (err) {
//         console.error("❌ submit-answer error:", err);
//         socket.emit("error", { message: err.message });
//       }
//     });

//     socket.on("get-game-state", () => {
//       try {
//         const player = playerManager.getPlayer(socket.id);
//         if (!player) throw new Error("Player not found");

//         const gameRoom = gameRoomManager.getPlayerGameRoom(player.id);
//         if (!gameRoom) throw new Error("Game room not found");

//         socket.emit("game-state-update", {
//           gameState: gameRoom.getGameState(),
//           currentQuestion: gameRoom.getCurrentQuestion(),
//           questionMeter: gameRoom.questionMeter,
//           myPlayerId: player.id, // ✅ Include MongoDB ID
//         });
//       } catch (error) {
//         socket.emit("error", { message: error.message });
//       }
//     });

//     socket.on("disconnect", () => {
//       console.log(`👋 Player disconnected: ${socket.id}`);

//       const player = playerManager.getPlayer(socket.id);
//       if (player) {
//         // Remove from matchmaking queue
//         matchmakingService.removeFromQueue(player);
//         console.log(
//           "📊 Queue after disconnect:",
//           matchmakingService.getQueueStatus()
//         ); // DEBUG

//         // Handle game room disconnection
//         const gameRoom = gameRoomManager.getPlayerGameRoom(player.id);
//         if (gameRoom) {
//           gameRoom.handlePlayerDisconnect(player.id);
//           const remainingPlayer = gameRoom
//             .getPlayers()
//             .find((p) => p.id !== player.id);
//           if (remainingPlayer) {
//             io.to(remainingPlayer.socketId).emit("opponent-disconnected", {
//               message: "Your opponent has disconnected. You win by default!",
//               finalQuestionMeter: gameRoom.questionMeter,
//             });
//           }
//           gameRoomManager.removeGameRoom(gameRoom.id);
//         }

//         // Remove player
//         playerManager.removePlayer(socket.id);
//       }
//     });
//   });
// };
// handlers/socketHandler.js
const { RedisMatchmakingService } = require("../services/RedisMatchmakingService");
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

        console.log(`✅ ${player.username} joined lobby (Rating: ${player.rating})`);

        // Get current queue status
        const queueStatus = await matchmakingService.getQueueStatus();
        console.log(`📊 Queue status: ${queueStatus.totalInQueue} players waiting`);

        // Start Redis-based matchmaking
        await matchmakingService.findMatch(player, (gameRoom) => {
          console.log(`🎮 Match found: ${player.username} vs opponent`);

          const opponent = gameRoom.getOpposingPlayer(player.id);

          // Notify both players about the match
          const players = gameRoom.getPlayers();
          players.forEach((p) => {
            const otherPlayer = players.find((pl) => pl.id !== p.id);

            console.log(`📤 Sending match-found to ${p.username} (${p.socketId})`);

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

        // Record the answer
        gameRoom.submitAnswer(player.id, data.answer, data.timeSpent);

        // Broadcast score update to opponent
        const opponent = gameRoom.getOpposingPlayer(player.id);
        if (opponent) {
          const playerScore = gameRoom.playerScores.get(player.id);
          io.to(opponent.socketId).emit("opponent-score-update", {
            opponentId: player.id,
            score: playerScore.score,
            correctAnswers: playerScore.correctAnswers,
          });
        }

        // Generate next question for answerer
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

        // Remove the game room
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
