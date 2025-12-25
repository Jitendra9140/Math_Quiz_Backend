const { MatchmakingService } = require("../services/MatchmakingService");
const { GameRoomManager } = require("../services/GameRoomManager");
const { PlayerManager } = require("../services/PlayerManager");
const { QuestionService } = require("../services/QuestionService");

module.exports = function registerSocketHandlers(io) {
  const playerManager = new PlayerManager();
  const questionService = new QuestionService();
  const gameRoomManager = new GameRoomManager(questionService, io);
  const matchmakingService = new MatchmakingService(
    playerManager,
    gameRoomManager
  );

  io.on("connection", (socket) => {
    console.log(`Player connected: ${socket.id}`);

    socket.on("join-lobby", (playerData) => {
      try {
        // ✅ Ensure userId (MongoDB ID) is present
        if (!playerData.userId) {
          throw new Error("userId (MongoDB ID) is required");
        }
        
        const player = playerManager.addPlayer(socket.id, {
          id: playerData.userId, // ✅ Use MongoDB ID as primary ID
          username: playerData.username,
          email: playerData.email,
          rating: playerData.rating,
          diff: playerData.diff,
          timer: playerData.timer,
          symbol: playerData.symbol,
        });

        // ✅ Send back MongoDB ID explicitly
        socket.emit("lobby-joined", {
          success: true,
          player: {
            id: player.id, // MongoDB ID
            socketId: player.socketId,
            username: player.username,
            rating: player.rating,
          },
        });

        console.log("✅ Player joined lobby:", player.id);
        console.log(
          "📊 Current queue status:",
          matchmakingService.getQueueStatus()
        ); // DEBUG

        // Start matchmaking
        matchmakingService.findMatch(player, (gameRoom) => {
          console.log("🎮 Match found for:", player.id);

          matchmakingService.removeFromQueue(player);
          const opponent = gameRoom.getOpposingPlayer(player.id);
          matchmakingService.removeFromQueue(opponent);

          // Notify both players about the match
          const players = gameRoom.getPlayers();
          players.forEach((p) => {
            const otherPlayer = players.find((pl) => pl.id !== p.id);

            console.log(
              `📤 Sending match-found to ${p.username} (${p.socketId})`
            ); // DEBUG

            // ✅ Send complete player data with MongoDB IDs
            io.to(p.socketId).emit("match-found", {
              gameRoom: gameRoom.getPublicData(),
              opponent: {
                id: otherPlayer.id, // MongoDB ID
                username: otherPlayer.username,
                rating: otherPlayer.rating,
              },
              myPlayerId: p.id, // ✅ Add this for clarity
              initialQuestionMeter: gameRoom.questionMeter,
            });
          });

          // Start the game after a brief delay
          setTimeout(() => {
            gameRoom.startGame();
            console.log("🚀 GAME STARTED");

            players.forEach((p) => {
              console.log(
                `📤 Sending game-started to ${p.username} (${p.socketId})`
              ); // DEBUG

              io.to(p.socketId).emit("game-started", {
                gameState: gameRoom.getGameState(),
                currentQuestion: gameRoom.getCurrentQuestion(),
                myPlayerId: p.id, // ✅ Explicitly send MongoDB ID
              });
            });
          }, 3000);
        });
      } catch (error) {
        console.error("❌ join-lobby error:", error);
        socket.emit("error", { message: error.message });
      }
    });

    socket.on("cancel_search", () => {
      try {
        const player = playerManager.getPlayer(socket.id);
        if (player) {
          matchmakingService.removeFromQueue(player);
          console.log("❌ Player cancelled search:", player.id);
          console.log(
            "📊 Queue after cancellation:",
            matchmakingService.getQueueStatus()
          ); // DEBUG
        }
      } catch (error) {
        console.error("❌ cancel_search error:", error);
      }
    });

    socket.on("submit-answer", (data) => {
      try {
        console.log("📝 submit-answer:", data);

        // ✅ Get player by socket ID
        const player = playerManager.getPlayer(socket.id);
        if (!player) throw new Error("Player not found");

        console.log("✅ Player found:", player.id);

        const gameRoom = gameRoomManager.getPlayerGameRoom(player.id);
        if (!gameRoom) throw new Error("Game room not found");

        console.log("✅ Game room found:", gameRoom.id);

        // Record the answer
        const result = gameRoom.submitAnswer(
          player.id,
          data.answer,
          data.timeSpent
        );

        console.log("✅ Answer submitted, result:", result);

        // ✅ Broadcast score update to opponent
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
          myPlayerId: player.id, // ✅ Include MongoDB ID
        });
      } catch (error) {
        socket.emit("error", { message: error.message });
      }
    });

    socket.on("disconnect", () => {
      console.log(`👋 Player disconnected: ${socket.id}`);

      const player = playerManager.getPlayer(socket.id);
      if (player) {
        // Remove from matchmaking queue
        matchmakingService.removeFromQueue(player);
        console.log(
          "📊 Queue after disconnect:",
          matchmakingService.getQueueStatus()
        ); // DEBUG

        // Handle game room disconnection
        const gameRoom = gameRoomManager.getPlayerGameRoom(player.id);
        if (gameRoom) {
          gameRoom.handlePlayerDisconnect(player.id);
          const remainingPlayer = gameRoom
            .getPlayers()
            .find((p) => p.id !== player.id);
          if (remainingPlayer) {
            io.to(remainingPlayer.socketId).emit("opponent-disconnected", {
              message: "Your opponent has disconnected. You win by default!",
              finalQuestionMeter: gameRoom.questionMeter,
            });
          }
          gameRoomManager.removeGameRoom(gameRoom.id);
        }

        // Remove player
        playerManager.removePlayer(socket.id);
      }
    });
  });
};