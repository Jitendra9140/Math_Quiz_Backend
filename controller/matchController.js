// io.on('connection', (socket) => {
//   console.log(`Player connected: ${socket.id}`);

//   // Player joins the lobby
//   socket.on('join-lobby', (playerData) => {
//     try {
//       const player = addPlayer(socket.id, playerData);
//       socket.emit('lobby-joined', { success: true, player });
      
//       // Start matchmaking
//       findMatch(player, (gameRoom) => {
//         // Notify both players about the match
//         const players = gameRoom.players;
//         players.forEach(p => {
//           io.to(p.socketId).emit('match-found', {
//             gameRoom: {
//               id: gameRoom.id,
//               players: gameRoom.players.map(player => ({
//                 id: player.id,
//                 username: player.username,
//                 rating: player.rating
//               })),
//               createdAt: gameRoom.createdAt,
//               gameState: gameRoom.gameState,
//               questionMeter: gameRoom.questionMeter,
//               difficulty: gameRoom.difficulty
//             },
//             opponent: players.find(player => player.id !== p.id),
//             initialQuestionMeter: gameRoom.questionMeter
//           });
//         });
        
//         // Start the game after a brief delay
//         setTimeout(() => {
//           gameRoom.gameState = 'active';
//           players.forEach(p => {
//             io.to(p.socketId).emit('game-started', {
//               gameState: {
//                 gameId: gameRoom.id,
//                 state: gameRoom.gameState,
//                 currentQuestionIndex: gameRoom.currentQuestionIndex,
//                 totalQuestions: gameRoom.gameSettings.questionsPerGame,
//                 playerScores: gameRoom.playerScores,
//                 timeRemaining: gameRoom.gameSettings.totalGameTime,
//                 questionMeter: gameRoom.questionMeter,
//                 questionMeterController: gameRoom.questionMeterController,
//                 difficulty: gameRoom.difficulty
//               },
//               currentQuestion: gameRoom.questions[gameRoom.currentQuestionIndex]
//             });
//           });
//         }, 3000);
//       });
//     } catch (error) {
//       socket.emit('error', { message: error.message });
//     }
//   });

//   // Player submits an answer
//   socket.on('submit-answer', (data) => {
//     try {
//       const player = getPlayer(socket.id);
//       if (!player) throw new Error('Player not found');

//       const gameRoom = getPlayerGameRoom(player.id);
//       if (!gameRoom) throw new Error('Game room not found');

//       if (gameRoom.gameState !== 'active') {
//         throw new Error('Game is not active');
//       }

//       const currentQuestion = gameRoom.questions[gameRoom.currentQuestionIndex];
//       if (!currentQuestion) {
//         throw new Error('No current question');
//       }

//       // Initialize answers map for current question if not exists
//       if (!gameRoom.playerAnswers.has(gameRoom.currentQuestionIndex)) {
//         gameRoom.playerAnswers.set(gameRoom.currentQuestionIndex, new Map());
//       }

//       const questionAnswers = gameRoom.playerAnswers.get(gameRoom.currentQuestionIndex);
      
//       // Check if player already answered
//       if (questionAnswers.has(player.id)) {
//         throw new Error('Player already answered this question');
//       }

//       const isCorrect = String(data.answer).trim() === String(currentQuestion.answer).trim();
//       const answerData = {
//         answer: data.answer,
//         isCorrect,
//         timeSpent: data.timeSpent,
//         submittedAt: Date.now()
//       };

//       questionAnswers.set(player.id, answerData);

//       // Update player score and streak
//       const playerScore = gameRoom.playerScores.get(player.id);
//       playerScore.questionsAnswered++;
      
//       if (answerData.isCorrect) {
//         playerScore.streak++;
//         playerScore.maxStreak = Math.max(playerScore.maxStreak, playerScore.streak);
//         playerScore.correctAnswers++;
        
//         // Calculate score
//         if (playerScore.streak <= 2) {
//           playerScore.score += 1;
//         } else if (playerScore.streak === 3) {
//           playerScore.score += 3;
//         } else if (playerScore.streak === 5) {
//           playerScore.score += 5;
//         } else if (playerScore.streak === 10) {
//           playerScore.score += 10;
//         } else if (playerScore.streak % 10 === 0) {
//           playerScore.score += 10;
//         } else {
//           playerScore.score += 1;
//         }
//       } else {
//         playerScore.streak = 0;
//       }
      
//       playerScore.totalTime += answerData.timeSpent;

//       // Handle Question Meter control (first to answer controls QM)
//       const isFirstToAnswer = questionAnswers.size === 1;
//       if (isFirstToAnswer) {
//         gameRoom.questionMeterController = player.id;
        
//         // Update question meter based on this player's answer
//         const tiers = [
//           { max: 400, thresh: 1 },
//           { max: 800, thresh: 2 },
//           { max: 1200, thresh: 2 },
//           { max: 1600, thresh: 3 },
//           { max: 2000, thresh: 4 },
//           { max: Infinity, thresh: 5 },
//         ];

//         let qmChange = 0;
//         for (const tier of tiers) {
//           if (player.rating <= tier.max) {
//             qmChange = currentQuestion.finalLevel <= tier.thresh 
//               ? (isCorrect ? 2 : -1) 
//               : (isCorrect ? 1 : -1);
//             break;
//           }
//         }
        
//         gameRoom.questionMeter = Math.max(0, gameRoom.questionMeter + qmChange);
        
//         console.log(`Player ${player.id} controls QM. Change: ${qmChange}, New QM: ${gameRoom.questionMeter}`);
//       }

//       const result = {
//         isCorrect,
//         timeSpent: data.timeSpent,
//         currentScore: gameRoom.playerScores.get(player.id),
//         isFirstToAnswer,
//         questionMeter: gameRoom.questionMeter,
//         questionMeterController: gameRoom.questionMeterController
//       };
      
//       // Notify both players about the answer submission
//       const players = gameRoom.players;
//       players.forEach(p => {
//         io.to(p.socketId).emit('answer-submitted', {
//           playerId: player.id,
//           result: result,
//           gameState: {
//             gameId: gameRoom.id,
//             state: gameRoom.gameState,
//             currentQuestionIndex: gameRoom.currentQuestionIndex,
//             totalQuestions: gameRoom.gameSettings.questionsPerGame,
//             playerScores: Object.fromEntries(gameRoom.playerScores),
//             timeRemaining: Math.max(0, gameRoom.gameSettings.totalGameTime - (Date.now() - gameRoom.createdAt)),
//             questionMeter: gameRoom.questionMeter,
//             questionMeterController: gameRoom.questionMeterController,
//             difficulty: gameRoom.difficulty
//           },
//           questionMeterUpdate: {
//             newQM: result.questionMeter,
//             controller: result.questionMeterController,
//             isFirstToAnswer: result.isFirstToAnswer
//           }
//         });
//       });

//       // Check if question is complete (both players answered or time up)
//       const isQuestionComplete = questionAnswers.size === players.length;
      
//       if (isQuestionComplete) {
//         // Complete question
//         if (gameRoom.questionTimer) {
//           clearTimeout(gameRoom.questionTimer);
//           gameRoom.questionTimer = null;
//         }

//         const questionResult = {
//           questionIndex: gameRoom.currentQuestionIndex,
//           question: currentQuestion,
//           answers: Object.fromEntries(questionAnswers),
//           correctAnswer: currentQuestion.answer,
//           explanation: currentQuestion.explanation || `The correct answer is ${currentQuestion.answer}`,
//           playerScores: Object.fromEntries(gameRoom.playerScores),
//           questionMeter: gameRoom.questionMeter,
//           questionMeterController: gameRoom.questionMeterController
//         };

//         players.forEach(p => {
//           io.to(p.socketId).emit('question-completed', {
//             ...questionResult,
//             questionMeterInfo: {
//               currentQM: gameRoom.questionMeter,
//               controller: gameRoom.questionMeterController
//             }
//           });
//         });

//         // Move to next question or end game
//         setTimeout(() => {
//           gameRoom.currentQuestionIndex++;
//           const hasMoreQuestions = gameRoom.currentQuestionIndex < gameRoom.gameSettings.questionsPerGame;
          
//           if (hasMoreQuestions) {
//             // Generate next question based on updated QM
//             import('./services/questionService.js').then(({ generateQuestion }) => {
//               try {
//                 const lowerRating = Math.min(gameRoom.players[0].rating, gameRoom.players[1].rating);
//                 const nextQuestion = generateQuestion(
//                   gameRoom.difficulty,
//                   gameRoom.symbols,
//                   lowerRating,
//                   gameRoom.questionMeter
//                 );
                
//                 gameRoom.questions.push(nextQuestion);
//                 console.log(`Generated question ${gameRoom.questions.length} with QM: ${gameRoom.questionMeter}, Level: ${nextQuestion.finalLevel}`);
                
//                 // Reset QM controller for next question
//                 gameRoom.questionMeterController = null;
                
//                 // Start question timer
//                 gameRoom.questionTimer = setTimeout(() => {
//                   // Handle timeout logic here if needed
//                 }, gameRoom.gameSettings.timePerQuestion);
                
//                 players.forEach(p => {
//                   io.to(p.socketId).emit('next-question', {
//                     question: nextQuestion,
//                     gameState: {
//                       gameId: gameRoom.id,
//                       state: gameRoom.gameState,
//                       currentQuestionIndex: gameRoom.currentQuestionIndex,
//                       totalQuestions: gameRoom.gameSettings.questionsPerGame,
//                       playerScores: Object.fromEntries(gameRoom.playerScores),
//                       timeRemaining: Math.max(0, gameRoom.gameSettings.totalGameTime - (Date.now() - gameRoom.createdAt)),
//                       questionMeter: gameRoom.questionMeter,
//                       questionMeterController: gameRoom.questionMeterController,
//                       difficulty: gameRoom.difficulty
//                     },
//                     questionMeter: gameRoom.questionMeter
//                   });
//                 });
//               } catch (error) {
//                 console.error("Error generating next question:", error);
//               }
//             });
//           } else {
//             // End game
//             gameRoom.gameState = 'completed';
            
//             if (gameRoom.gameTimer) {
//               clearTimeout(gameRoom.gameTimer);
//               gameRoom.gameTimer = null;
//             }
            
//             if (gameRoom.questionTimer) {
//               clearTimeout(gameRoom.questionTimer);
//               gameRoom.questionTimer = null;
//             }

//             // Calculate final results
//             const playerResults = gameRoom.players.map(player => {
//               const score = gameRoom.playerScores.get(player.id);
//               return {
//                 playerId: player.id,
//                 username: player.username,
//                 currentRating: player.rating,
//                 finalScore: score.score,
//                 correctAnswers: score.correctAnswers,
//                 totalTime: score.totalTime,
//                 maxStreak: score.maxStreak,
//                 questionsAnswered: score.questionsAnswered
//               };
//             });

//             // Determine winner
//             const winner = playerResults.reduce((best, current) => {
//               if (current.finalScore > best.finalScore) return current;
//               if (current.finalScore === best.finalScore && current.totalTime < best.totalTime) return current;
//               return best;
//             });

//             // Calculate rating changes
//             const K = 32; // ELO K-factor
//             const ratingChanges = [];

//             for (let i = 0; i < playerResults.length; i++) {
//               const player = playerResults[i];
//               const opponent = playerResults[1 - i];
              
//               const expectedScore = 1 / (1 + Math.pow(10, (opponent.currentRating - player.currentRating) / 400));
//               const actualScore = player.playerId === winner.playerId ? 1 : 0;
              
//               const ratingChange = Math.round(K * (actualScore - expectedScore));
//               ratingChanges.push(ratingChange);
//             }

//             const finalResult = {
//               gameId: gameRoom.id,
//               finalScores: Object.fromEntries(gameRoom.playerScores),
//               winner,
//               ratingChanges,
//               gameStats: {
//                 duration: Date.now() - gameRoom.createdAt,
//                 totalQuestions: gameRoom.gameSettings.questionsPerGame,
//                 questionsAnswered: gameRoom.currentQuestionIndex,
//                 finalQuestionMeter: gameRoom.questionMeter
//               },
//               players: playerResults.map((result, index) => ({
//                 ...result,
//                 won: result.playerId === winner.playerId,
//                 newRating: result.currentRating + ratingChanges[index]
//               })),
//               finalQuestionMeter: gameRoom.questionMeter
//             };

//             players.forEach(p => {
//               io.to(p.socketId).emit('game-ended', finalResult);
//             });
            
//             // Update player ratings
//             updatePlayerRatings(finalResult.players);
            
//             // Clean up
//             removeGameRoom(gameRoom.id);
//           }
//         }, 2000);
//       }
//     } catch (error) {
//       socket.emit('error', { message: error.message });
//     }
//   });

//   // Player requests current game state
//   socket.on('get-game-state', () => {
//     try {
//       const player = getPlayer(socket.id);
//       if (!player) throw new Error('Player not found');

//       const gameRoom = getPlayerGameRoom(player.id);
//       if (!gameRoom) throw new Error('Game room not found');

//       socket.emit('game-state-update', {
//         gameState: {
//           gameId: gameRoom.id,
//           state: gameRoom.gameState,
//           currentQuestionIndex: gameRoom.currentQuestionIndex,
//           totalQuestions: gameRoom.gameSettings.questionsPerGame,
//           playerScores: Object.fromEntries(gameRoom.playerScores),
//           timeRemaining: Math.max(0, gameRoom.gameSettings.totalGameTime - (Date.now() - gameRoom.createdAt)),
//           questionMeter: gameRoom.questionMeter,
//           questionMeterController: gameRoom.questionMeterController,
//           difficulty: gameRoom.difficulty
//         },
//         currentQuestion: gameRoom.questions[gameRoom.currentQuestionIndex],
//         questionMeter: gameRoom.questionMeter
//       });
//     } catch (error) {
//       socket.emit('error', { message: error.message });
//     }
//   });

//   // Player disconnects
//   socket.on('disconnect', () => {
//     console.log(`Player disconnected: ${socket.id}`);
    
//     const player = getPlayer(socket.id);
//     if (player) {
//       // Remove from matchmaking queue
//       removeFromQueue(player);
      
//       // Handle game room disconnection
//       const gameRoom = getPlayerGameRoom(player.id);
//       if (gameRoom) {
//         gameRoom.gameState = 'completed';
        
//         if (gameRoom.gameTimer) {
//           clearTimeout(gameRoom.gameTimer);
//         }
//         if (gameRoom.questionTimer) {
//           clearTimeout(gameRoom.questionTimer);
//         }
        
//         const remainingPlayer = gameRoom.players.find(p => p.id !== player.id);
//         if (remainingPlayer) {
//           io.to(remainingPlayer.socketId).emit('opponent-disconnected', {
//             message: 'Your opponent has disconnected. You win by default!',
//             finalQuestionMeter: gameRoom.questionMeter
//           });
//         }
//         removeGameRoom(gameRoom.id);
//       }
      
//       // Remove player
//       removePlayer(socket.id);
//     }
//   });
// });




const { MatchmakingService } = require('../services/MatchmakingService.js');
const { PlayerManager } = require('../services/PlayerManager.js');
const { GameRoomManager } = require('../services/GameRoomManager.js');

const playerManager = new PlayerManager();
const gameRoomManager = new GameRoomManager();
const matchmakingService = new MatchmakingService(playerManager, gameRoomManager);

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Player joins the lobby
socket.on('join-lobby', (playerData) => {
  try {
    const player = playerManager.addPlayer(socket.id, playerData);
    socket.emit('lobby-joined', { success: true, player });

    // Get list of opponents instead of auto match
    const opponents = matchmakingService.findPotentialOpponents(player);
    socket.emit('potential-opponents', opponents);

  } catch (error) {
    socket.emit('error', { message: error.message });
  }
});


  // Player submits an answer
  socket.on('submit-answer', (data) => {
    try {
      const player = getPlayer(socket.id);
      if (!player) throw new Error('Player not found');

      const gameRoom = getPlayerGameRoom(player.id);
      if (!gameRoom) throw new Error('Game room not found');

      if (gameRoom.gameState !== 'active') {
        throw new Error('Game is not active');
      }

      const currentQuestion = gameRoom.questions[gameRoom.currentQuestionIndex];
      if (!currentQuestion) {
        throw new Error('No current question');
      }

      // Initialize answers map for current question if not exists
      if (!gameRoom.playerAnswers.has(gameRoom.currentQuestionIndex)) {
        gameRoom.playerAnswers.set(gameRoom.currentQuestionIndex, new Map());
      }

      const questionAnswers = gameRoom.playerAnswers.get(gameRoom.currentQuestionIndex);
      
      // Check if player already answered
      if (questionAnswers.has(player.id)) {
        throw new Error('Player already answered this question');
      }

      const isCorrect = String(data.answer).trim() === String(currentQuestion.answer).trim();
      const answerData = {
        answer: data.answer,
        isCorrect,
        timeSpent: data.timeSpent,
        submittedAt: Date.now()
      };

      questionAnswers.set(player.id, answerData);

      // Update player score and streak
      const playerScore = gameRoom.playerScores.get(player.id);
      playerScore.questionsAnswered++;
      
      if (answerData.isCorrect) {
        playerScore.streak++;
        playerScore.maxStreak = Math.max(playerScore.maxStreak, playerScore.streak);
        playerScore.correctAnswers++;
        
        // Calculate score
        if (playerScore.streak <= 2) {
          playerScore.score += 1;
        } else if (playerScore.streak === 3) {
          playerScore.score += 3;
        } else if (playerScore.streak === 5) {
          playerScore.score += 5;
        } else if (playerScore.streak === 10) {
          playerScore.score += 10;
        } else if (playerScore.streak % 10 === 0) {
          playerScore.score += 10;
        } else {
          playerScore.score += 1;
        }
      } else {
        playerScore.streak = 0;
      }
      
      playerScore.totalTime += answerData.timeSpent;

      // Handle Question Meter control (first to answer controls QM)
      const isFirstToAnswer = questionAnswers.size === 1;
      if (isFirstToAnswer) {
        gameRoom.questionMeterController = player.id;
        
        // Update question meter based on this player's answer
        const tiers = [
          { max: 400, thresh: 1 },
          { max: 800, thresh: 2 },
          { max: 1200, thresh: 2 },
          { max: 1600, thresh: 3 },
          { max: 2000, thresh: 4 },
          { max: Infinity, thresh: 5 },
        ];

        let qmChange = 0;
        for (const tier of tiers) {
          if (player.rating <= tier.max) {
            qmChange = currentQuestion.finalLevel <= tier.thresh 
              ? (isCorrect ? 2 : -1) 
              : (isCorrect ? 1 : -1);
            break;
          }
        }
        
        gameRoom.questionMeter = Math.max(0, gameRoom.questionMeter + qmChange);
        
        console.log(`Player ${player.id} controls QM. Change: ${qmChange}, New QM: ${gameRoom.questionMeter}`);
      }

      const result = {
        isCorrect,
        timeSpent: data.timeSpent,
        currentScore: gameRoom.playerScores.get(player.id),
        isFirstToAnswer,
        questionMeter: gameRoom.questionMeter,
        questionMeterController: gameRoom.questionMeterController
      };
      
      // Notify both players about the answer submission
      const players = gameRoom.players;
      players.forEach(p => {
        io.to(p.socketId).emit('answer-submitted', {
          playerId: player.id,
          result: result,
          gameState: {
            gameId: gameRoom.id,
            state: gameRoom.gameState,
            currentQuestionIndex: gameRoom.currentQuestionIndex,
            totalQuestions: gameRoom.gameSettings.questionsPerGame,
            playerScores: Object.fromEntries(gameRoom.playerScores),
            timeRemaining: Math.max(0, gameRoom.gameSettings.totalGameTime - (Date.now() - gameRoom.createdAt)),
            questionMeter: gameRoom.questionMeter,
            questionMeterController: gameRoom.questionMeterController,
            difficulty: gameRoom.difficulty
          },
          questionMeterUpdate: {
            newQM: result.questionMeter,
            controller: result.questionMeterController,
            isFirstToAnswer: result.isFirstToAnswer
          }
        });
      });

      // Check if question is complete (both players answered or time up)
      const isQuestionComplete = questionAnswers.size === players.length;
      
      if (isQuestionComplete) {
        // Complete question
        if (gameRoom.questionTimer) {
          clearTimeout(gameRoom.questionTimer);
          gameRoom.questionTimer = null;
        }

        const questionResult = {
          questionIndex: gameRoom.currentQuestionIndex,
          question: currentQuestion,
          answers: Object.fromEntries(questionAnswers),
          correctAnswer: currentQuestion.answer,
          explanation: currentQuestion.explanation || `The correct answer is ${currentQuestion.answer}`,
          playerScores: Object.fromEntries(gameRoom.playerScores),
          questionMeter: gameRoom.questionMeter,
          questionMeterController: gameRoom.questionMeterController
        };

        players.forEach(p => {
          io.to(p.socketId).emit('question-completed', {
            ...questionResult,
            questionMeterInfo: {
              currentQM: gameRoom.questionMeter,
              controller: gameRoom.questionMeterController
            }
          });
        });

        // Move to next question or end game
        setTimeout(() => {
          gameRoom.currentQuestionIndex++;
          const hasMoreQuestions = gameRoom.currentQuestionIndex < gameRoom.gameSettings.questionsPerGame;
          
          if (hasMoreQuestions) {
            // Generate next question based on updated QM
            import('./services/questionService.js').then(({ generateQuestion }) => {
              try {
                const lowerRating = Math.min(gameRoom.players[0].rating, gameRoom.players[1].rating);
                const nextQuestion = generateQuestion(
                  gameRoom.difficulty,
                  gameRoom.symbols,
                  lowerRating,
                  gameRoom.questionMeter
                );
                
                gameRoom.questions.push(nextQuestion);
                console.log(`Generated question ${gameRoom.questions.length} with QM: ${gameRoom.questionMeter}, Level: ${nextQuestion.finalLevel}`);
                
                // Reset QM controller for next question
                gameRoom.questionMeterController = null;
                
                // Start question timer
                gameRoom.questionTimer = setTimeout(() => {
                  // Handle timeout logic here if needed
                }, gameRoom.gameSettings.timePerQuestion);
                
                players.forEach(p => {
                  io.to(p.socketId).emit('next-question', {
                    question: nextQuestion,
                    gameState: {
                      gameId: gameRoom.id,
                      state: gameRoom.gameState,
                      currentQuestionIndex: gameRoom.currentQuestionIndex,
                      totalQuestions: gameRoom.gameSettings.questionsPerGame,
                      playerScores: Object.fromEntries(gameRoom.playerScores),
                      timeRemaining: Math.max(0, gameRoom.gameSettings.totalGameTime - (Date.now() - gameRoom.createdAt)),
                      questionMeter: gameRoom.questionMeter,
                      questionMeterController: gameRoom.questionMeterController,
                      difficulty: gameRoom.difficulty
                    },
                    questionMeter: gameRoom.questionMeter
                  });
                });
              } catch (error) {
                console.error("Error generating next question:", error);
              }
            });
          } else {
            // End game
            gameRoom.gameState = 'completed';
            
            if (gameRoom.gameTimer) {
              clearTimeout(gameRoom.gameTimer);
              gameRoom.gameTimer = null;
            }
            
            if (gameRoom.questionTimer) {
              clearTimeout(gameRoom.questionTimer);
              gameRoom.questionTimer = null;
            }

            // Calculate final results
            const playerResults = gameRoom.players.map(player => {
              const score = gameRoom.playerScores.get(player.id);
              return {
                playerId: player.id,
                username: player.username,
                currentRating: player.rating,
                finalScore: score.score,
                correctAnswers: score.correctAnswers,
                totalTime: score.totalTime,
                maxStreak: score.maxStreak,
                questionsAnswered: score.questionsAnswered
              };
            });

            // Determine winner
            const winner = playerResults.reduce((best, current) => {
              if (current.finalScore > best.finalScore) return current;
              if (current.finalScore === best.finalScore && current.totalTime < best.totalTime) return current;
              return best;
            });

            // Calculate rating changes
            const K = 32; // ELO K-factor
            const ratingChanges = [];

            for (let i = 0; i < playerResults.length; i++) {
              const player = playerResults[i];
              const opponent = playerResults[1 - i];
              
              const expectedScore = 1 / (1 + Math.pow(10, (opponent.currentRating - player.currentRating) / 400));
              const actualScore = player.playerId === winner.playerId ? 1 : 0;
              
              const ratingChange = Math.round(K * (actualScore - expectedScore));
              ratingChanges.push(ratingChange);
            }

            const finalResult = {
              gameId: gameRoom.id,
              finalScores: Object.fromEntries(gameRoom.playerScores),
              winner,
              ratingChanges,
              gameStats: {
                duration: Date.now() - gameRoom.createdAt,
                totalQuestions: gameRoom.gameSettings.questionsPerGame,
                questionsAnswered: gameRoom.currentQuestionIndex,
                finalQuestionMeter: gameRoom.questionMeter
              },
              players: playerResults.map((result, index) => ({
                ...result,
                won: result.playerId === winner.playerId,
                newRating: result.currentRating + ratingChanges[index]
              })),
              finalQuestionMeter: gameRoom.questionMeter
            };

            players.forEach(p => {
              io.to(p.socketId).emit('game-ended', finalResult);
            });
            
            // Update player ratings
            updatePlayerRatings(finalResult.players);
            
            // Clean up
            removeGameRoom(gameRoom.id);
          }
        }, 2000);
      }
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  // Player requests current game state
  socket.on('get-game-state', () => {
    try {
      const player = getPlayer(socket.id);
      if (!player) throw new Error('Player not found');

      const gameRoom = getPlayerGameRoom(player.id);
      if (!gameRoom) throw new Error('Game room not found');

      socket.emit('game-state-update', {
        gameState: {
          gameId: gameRoom.id,
          state: gameRoom.gameState,
          currentQuestionIndex: gameRoom.currentQuestionIndex,
          totalQuestions: gameRoom.gameSettings.questionsPerGame,
          playerScores: Object.fromEntries(gameRoom.playerScores),
          timeRemaining: Math.max(0, gameRoom.gameSettings.totalGameTime - (Date.now() - gameRoom.createdAt)),
          questionMeter: gameRoom.questionMeter,
          questionMeterController: gameRoom.questionMeterController,
          difficulty: gameRoom.difficulty
        },
        currentQuestion: gameRoom.questions[gameRoom.currentQuestionIndex],
        questionMeter: gameRoom.questionMeter
      });
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  // Player disconnects
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    
    const player = getPlayer(socket.id);
    if (player) {
      // Remove from matchmaking queue
      removeFromQueue(player);
      
      // Handle game room disconnection
      const gameRoom = getPlayerGameRoom(player.id);
      if (gameRoom) {
        gameRoom.gameState = 'completed';
        
        if (gameRoom.gameTimer) {
          clearTimeout(gameRoom.gameTimer);
        }
        if (gameRoom.questionTimer) {
          clearTimeout(gameRoom.questionTimer);
        }
        
        const remainingPlayer = gameRoom.players.find(p => p.id !== player.id);
        if (remainingPlayer) {
          io.to(remainingPlayer.socketId).emit('opponent-disconnected', {
            message: 'Your opponent has disconnected. You win by default!',
            finalQuestionMeter: gameRoom.questionMeter
          });
        }
        removeGameRoom(gameRoom.id);
      }
      
      // Remove player
      removePlayer(socket.id);
    }
  });
});
