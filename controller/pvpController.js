// const { MatchmakingService } = require("../services/MatchmakingService");
// const { GameRoomManager } = require("../services/GameRoomManager");
// const { PlayerManager } = require("../services/PlayerManager");
// const { QuestionService } = require("../services/QuestionService");

// module.exports = function registerSocketHandlers(io) {
//   const playerManager = new PlayerManager();
//   const questionService = new QuestionService();
//   const gameRoomManager = new GameRoomManager(questionService, io);
//   const matchmakingService = new MatchmakingService(
//     playerManager,
//     gameRoomManager
//   );

//   io.on("connection", (socket) => {
//     console.log(`Player connected: ${socket.id}`);

//     // Player joins the lobby

//     // challenge player logic
// //     socket.on('join-lobby', (playerData) => {
// //   try {
// //     console.log('socket id and player data in pvp', socket.id, playerData )
// //     const player = playerManager.addPlayer(socket.id, playerData);
// //     socket.emit('lobby-joined', { success: true, player, tese: "pvp" });

// //     // Get list of opponents instead of auto match
// //     const opponents = matchmakingService.findPotentialOpponents(player);
// //     socket.emit('potential-opponents', opponents);

// //   } catch (error) {
// //     socket.emit('error', { message: error.message });
// //   }
// // });

// // auto match logic
//     socket.on("join-lobby", (playerData) => {
//       try {
//         const player = playerManager.addPlayer(socket.id, playerData);
//         socket.emit("lobby-joined", { success: true, player });
//         console.log('player joined lobby', playerData)
//         // Start matchmaking
//         matchmakingService.findMatch(player, (gameRoom) => {
//           console.log('match found')
//           matchmakingService.removeFromQueue(player);
//           console.log(gameRoom.getOpposingPlayer(player.id))
//           matchmakingService.removeFromQueue(
//             gameRoom.getOpposingPlayer(player.id)
//           );

//           console.log('before gameroom player get call');
//           // Notify both players about the match
//           const players = gameRoom.getPlayers();
//           console.log(players)
//           players.forEach((p) => {
//             console.log(p)
//             io.to(p.socketId).emit("match-found", {
//               gameRoom: gameRoom.getPublicData(),
//               opponent: players.find((player) => player.id !== p.id),
//               initialQuestionMeter: gameRoom.questionMeter,
//             });
//             console.log('match found')
//           });

//           // Start the game after a brief delay
//           setTimeout(() => {
//             gameRoom.startGame();
//             console.log('GAME STARTED')
//             players.forEach((p) => {
      
//               io.to(p.socketId).emit("game-started", {
//                 gameState: gameRoom.getGameState(),
//                 currentQuestion: gameRoom.getCurrentQuestion(),
//               });
//             });
//           }, 3000);
//         });
//       } catch (error) {
//         socket.emit("error", { message: error.message });
//       }
//     });

//     // Player submits an answer
//     // socket.on("submit-answer", (data) => {
//     //   try {
//     //     const player = playerManager.getPlayer(socket.id);
//     //     if (!player) throw new Error("Player not found");

//     //     const gameRoom = gameRoomManager.getPlayerGameRoom(player.id);
//     //     if (!gameRoom) throw new Error("Game room not found");

//     //     const result = gameRoom.submitAnswer(
//     //       player.id,
//     //       data.answer,
//     //       data.timeSpent
//     //     );

//     //     // Notify both players about the answer submission
//     //     const players = gameRoom.getPlayers();
//     //     players.forEach((p) => {
//     //       io.to(p.socketId).emit("answer-submitted", {
//     //         playerId: player.id,
//     //         result: result,
//     //         gameState: gameRoom.getGameState(),
//     //         questionMeterUpdate: {
//     //           newQM: result.questionMeter,
//     //           controller: result.questionMeterController,
//     //           isFirstToAnswer: result.isFirstToAnswer,
//     //         },
//     //       });
//     //     });

//     //     // Check if question is complete (both players answered or time up)
//     //     if (gameRoom.isQuestionComplete()) {
//     //       const questionResult = gameRoom.completeQuestion();
//     //       players.forEach((p) => {
//     //         io.to(p.socketId).emit("question-completed", {
//     //           ...questionResult,
//     //           questionMeterInfo: {
//     //             currentQM: gameRoom.questionMeter,
//     //             controller: gameRoom.questionMeterController,
//     //           },
//     //         });
//     //       });

//     //       // Move to next question or end game
//     //       setTimeout(() => {
//     //         if (gameRoom.hasMoreQuestions()) {
//     //           gameRoom.nextQuestion();
//     //           const nextQuestion = gameRoom.getCurrentQuestion();
//     //           players.forEach((p) => {
//     //             io.to(p.socketId).emit("next-question", {
//     //               question: nextQuestion,
//     //               gameState: gameRoom.getGameState(),
//     //               questionMeter: gameRoom.questionMeter,
//     //             });
//     //           });
//     //         } else {
//     //           const finalResult = gameRoom.endGame();
//     //           players.forEach((p) => {
//     //             io.to(p.socketId).emit("game-ended", finalResult);
//     //           });

//     //           // Update player ratings
//     //           playerManager.updatePlayerRatings(finalResult.players);

//     //           // Clean up
//     //           gameRoomManager.removeGameRoom(gameRoom.id);
//     //         }
//     //       }, 2000);
//     //     }
//     //   } catch (error) {
//     //     socket.emit("error", { message: error.message });
//     //   }
//     // });

//     socket.on("submit-answer", (data) => {
     
//       try {
//          console.log(data)
//         // const player = playerManager.getPlayer(data.userName);
//         const player = playerManager.getPlayer(socket.id);
//         console.log('submit answer',player, socket.id)
//         if (!player) throw new Error("Player not found");
        
//         const gameRoom = gameRoomManager.getPlayerGameRoom(player.id);
//         if (!gameRoom) throw new Error("Game room not found");
//         console.log("submit answer game room:", gameRoom)

//         // 1) Record the answer and QM changes
//         const result = gameRoom.submitAnswer(

//           player.id,
//           data.answer,
//           data.timeSpent
//         );

//         // 2) Broadcast “answer-submitted” to both players
//         // gameRoom.getPlayers().forEach((p) => {
//         //   io.to(p.socketId).emit("answer-submitted", {
//         //     playerId: player.id,
//         //     result,
//         //     gameState: gameRoom.getGameState(),
//         //   });
//         // });

//         // 3) Immediately generate and send the next question for the answerer
//         gameRoom.emitNextQuestion(player.id);
//       } catch (err) {
//         socket.emit("error", { message: err.message });
//       }
//     });

//     // Player requests current game state
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
//         });
//       } catch (error) {
//         socket.emit("error", { message: error.message });
//       }
//     });

//     // Player disconnects
//     socket.on("disconnect", () => {
//       console.log(`Player disconnected: ${socket.id}`);

//       const player = playerManager.getPlayer(socket.id);
//       if (player) {
//         // Remove from matchmaking queue
//         matchmakingService.removeFromQueue(player);

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