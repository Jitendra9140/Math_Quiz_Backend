// const { v4 : uuidv4 } = require('uuid');

// class GameRoom {
//   constructor(players, questionService) {
//     this.id = uuidv4();
//     this.players = players;
//     this.questionService = questionService;
//     this.createdAt = Date.now();
//     this.gameState = 'waiting'; // waiting, active, completed
//     this.currentQuestionIndex = 0;
//     this.questions = []; // Shared questions for both players
//     this.playerAnswers = new Map(); // questionIndex -> Map(playerId -> answer data)
//     this.playerScores = new Map(); // playerId -> score data
//     this.gameTimer = null;
//     this.questionTimer = null;

//     // Question Meter System
//     this.questionMeter = 0; // Current QM value
//     this.questionMeterController = null; // Player ID who controls QM (first to answer)
//     this.difficulty = 'medium'; // Game difficulty
//     this.symbols = ['sum', 'difference', 'product', 'quotient']; // Math symbols for questions

//     this.gameSettings = {
//       questionsPerGame: 10,
//       timePerQuestion: 30000, // 30 seconds
//       totalGameTime: 600000 // 10 minutes max
//     };

//     // Initialize player scores
//     this.players.forEach(player => {
//       this.playerScores.set(player.id, {
//         score: 0,
//         correctAnswers: 0,
//         totalTime: 0,
//         streak: 0,
//         maxStreak: 0,
//         questionsAnswered: 0
//       });
//     });

//     // Set initial question meter based on lower player rating
//     this.questionMeter = this.questionService.getInitialQuestionMeter(
//       this.players[0].rating,
//       this.players[1].rating
//     );
//   }

//   startGame() {
//     this.gameState = 'active';

//     // Generate first question based on initial QM
//     this.generateNextQuestion();

//     this.startGameTimer();
//     this.startQuestionTimer();
//   }

//   generateNextQuestion() {
//     try {
//       // Use the lower player rating for question generation
//       const lowerRating = Math.min(this.players[0].rating, this.players[1].rating);

//       const question = this.questionService.generateQuestion(
//         this.difficulty,
//         this.symbols,
//         lowerRating,
//         this.questionMeter
//       );

//       this.questions.push(question);
//       console.log(`Generated question ${this.questions.length} with QM: ${this.questionMeter}, Level: ${question.finalLevel}`);
//     } catch (error) {
//       console.error("Error generating question:", error);
//       // Fallback to a basic question structure
//       this.questions.push({
//         question: "What is 2 + 2?",
//         input1: "2",
//         input2: "2",
//         answer: "4",
//         symbol: "+",
//         difficulty: this.difficulty,
//         finalLevel: 1,
//         qm: this.questionMeter
//       });
//     }
//   }

//   startGameTimer() {
//     this.gameTimer = setTimeout(() => {
//       this.endGame();
//     }, this.gameSettings.totalGameTime);
//   }

//   startQuestionTimer() {
//     this.questionTimer = setTimeout(() => {
//       this.completeQuestion();
//     }, this.gameSettings.timePerQuestion);
//   }

//   getCurrentQuestion() {
//     return this.questions[this.currentQuestionIndex];
//   }

//   submitAnswer(playerId, answer, timeSpent) {
//     if (this.gameState !== 'active') {
//       throw new Error('Game is not active');
//     }

//     const currentQuestion = this.getCurrentQuestion();
//     if (!currentQuestion) {
//       throw new Error('No current question');
//     }

//     // Initialize answers map for current question if not exists
//     if (!this.playerAnswers.has(this.currentQuestionIndex)) {
//       this.playerAnswers.set(this.currentQuestionIndex, new Map());
//     }

//     const questionAnswers = this.playerAnswers.get(this.currentQuestionIndex);

//     // Check if player already answered
//     if (questionAnswers.has(playerId)) {
//       throw new Error('Player already answered this question');
//     }

//     const isCorrect = this.questionService.checkAnswer(currentQuestion, answer);
//     const answerData = {
//       answer,
//       isCorrect,
//       timeSpent,
//       submittedAt: Date.now()
//     };

//     questionAnswers.set(playerId, answerData);

//     // Update player score and streak
//     this.updatePlayerScore(playerId, answerData, currentQuestion);

//     // Handle Question Meter control (first to answer controls QM)
//     const isFirstToAnswer = questionAnswers.size === 1;
//     if (isFirstToAnswer) {
//       this.questionMeterController = playerId;

//       // Update question meter based on this player's answer
//       const player = this.players.find(p => p.id === playerId);
//       const qmChange = this.questionService.calculateQMChange(
//         isCorrect,
//         player.rating,
//         currentQuestion.finalLevel
//       );

//       this.questionMeter = Math.max(0, this.questionMeter + qmChange);

//       console.log(`Player ${playerId} controls QM. Change: ${qmChange}, New QM: ${this.questionMeter}`);
//     }

//     return {
//       isCorrect,
//       timeSpent,
//       currentScore: this.playerScores.get(playerId),
//       isFirstToAnswer,
//       questionMeter: this.questionMeter,
//       questionMeterController: this.questionMeterController
//     };
//   }

//   updatePlayerScore(playerId, answerData, question) {
//     const playerScore = this.playerScores.get(playerId);

//     playerScore.questionsAnswered++;

//     if (answerData.isCorrect) {
//       playerScore.streak++;
//       playerScore.maxStreak = Math.max(playerScore.maxStreak, playerScore.streak);
//       playerScore.correctAnswers++;

//       // Calculate score using the question service method
//       playerScore.score = this.questionService.calculateScore(
//         playerScore.score,
//         true,
//         playerScore.streak
//       );
//     } else {
//       playerScore.streak = 0;
//     }

//     playerScore.totalTime += answerData.timeSpent;
//   }

//   isQuestionComplete() {
//     if (!this.playerAnswers.has(this.currentQuestionIndex)) {
//       return false;
//     }

//     const questionAnswers = this.playerAnswers.get(this.currentQuestionIndex);
//     return questionAnswers.size === this.players.length;
//   }

//   completeQuestion() {
//     if (this.questionTimer) {
//       clearTimeout(this.questionTimer);
//       this.questionTimer = null;
//     }

//     const currentQuestion = this.getCurrentQuestion();
//     const questionAnswers = this.playerAnswers.get(this.currentQuestionIndex) || new Map();

//     // Handle players who didn't answer (timeout)
//     this.players.forEach(player => {
//       if (!questionAnswers.has(player.id)) {
//         const timeoutAnswerData = {
//           answer: null,
//           isCorrect: false,
//           timeSpent: this.gameSettings.timePerQuestion,
//           submittedAt: Date.now()
//         };

//         questionAnswers.set(player.id, timeoutAnswerData);

//         // Update score for timeout (breaks streak)
//         const playerScore = this.playerScores.get(player.id);
//         playerScore.streak = 0;
//         playerScore.totalTime += this.gameSettings.timePerQuestion;
//         playerScore.questionsAnswered++;

//         // If this player was supposed to control QM but timed out
//         if (questionAnswers.size === 1) { // First player timed out
//           this.questionMeterController = player.id;
//           // Decrease QM for timeout
//           const qmChange = this.questionService.calculateQMChange(
//             false,
//             player.rating,
//             currentQuestion.finalLevel
//           );
//           this.questionMeter = Math.max(0, this.questionMeter + qmChange);
//         }
//       }
//     });

//     return {
//       questionIndex: this.currentQuestionIndex,
//       question: currentQuestion,
//       answers: Object.fromEntries(questionAnswers),
//       correctAnswer: currentQuestion.answer,
//       explanation: currentQuestion.explanation || `The correct answer is ${currentQuestion.answer}`,
//       playerScores: Object.fromEntries(this.playerScores),
//       questionMeter: this.questionMeter,
//       questionMeterController: this.questionMeterController
//     };
//   }

//   nextQuestion() {
//     this.currentQuestionIndex++;
//     if (this.hasMoreQuestions()) {
//       // Generate next question based on updated QM
//       this.generateNextQuestion();
//       this.startQuestionTimer();

//       // Reset QM controller for next question
//       this.questionMeterController = null;
//     }
//   }

//   hasMoreQuestions() {
//     return this.currentQuestionIndex < this.gameSettings.questionsPerGame - 1;
//   }

//   endGame() {
//     this.gameState = 'completed';

//     if (this.gameTimer) {
//       clearTimeout(this.gameTimer);
//       this.gameTimer = null;
//     }

//     if (this.questionTimer) {
//       clearTimeout(this.questionTimer);
//       this.questionTimer = null;
//     }

//     // Calculate final results and rating changes
//     const results = this.calculateGameResults();

//     return {
//       gameId: this.id,
//       finalScores: Object.fromEntries(this.playerScores),
//       winner: results.winner,
//       ratingChanges: results.ratingChanges,
//       gameStats: results.gameStats,
//       players: results.players,
//       finalQuestionMeter: this.questionMeter
//     };
//   }

//   calculateGameResults() {
//     const playerResults = this.players.map(player => {
//       const score = this.playerScores.get(player.id);
//       return {
//         playerId: player.id,
//         username: player.username,
//         currentRating: player.rating,
//         finalScore: score.score,
//         correctAnswers: score.correctAnswers,
//         totalTime: score.totalTime,
//         maxStreak: score.maxStreak,
//         questionsAnswered: score.questionsAnswered
//       };
//     });

//     // Determine winner (highest score, then least time if tied)
//     const winner = playerResults.reduce((best, current) => {
//       if (current.finalScore > best.finalScore) return current;
//       if (current.finalScore === best.finalScore && current.totalTime < best.totalTime) return current;
//       return best;
//     });

//     // Calculate rating changes using ELO-like system
//     const ratingChanges = this.calculateRatingChanges(playerResults, winner);

//     return {
//       winner,
//       ratingChanges,
//       gameStats: {
//         duration: Date.now() - this.createdAt,
//         totalQuestions: this.gameSettings.questionsPerGame,
//         questionsAnswered: this.currentQuestionIndex + 1,
//         finalQuestionMeter: this.questionMeter
//       },
//       players: playerResults.map((result, index) => ({
//         ...result,
//         won: result.playerId === winner.playerId,
//         newRating: result.currentRating + ratingChanges[index]
//       }))
//     };
//   }

//   calculateRatingChanges(playerResults, winner) {
//     const K = 32; // ELO K-factor
//     const changes = [];

//     for (let i = 0; i < playerResults.length; i++) {
//       const player = playerResults[i];
//       const opponent = playerResults[1 - i]; // Assumes 2 players

//       const expectedScore = 1 / (1 + Math.pow(10, (opponent.currentRating - player.currentRating) / 400));
//       const actualScore = player.playerId === winner.playerId ? 1 : 0;

//       const ratingChange = Math.round(K * (actualScore - expectedScore));
//       changes.push(ratingChange);
//     }

//     return changes;
//   }

//   handlePlayerDisconnect(playerId) {
//     // Mark game as completed due to disconnect
//     this.gameState = 'completed';

//     if (this.gameTimer) {
//       clearTimeout(this.gameTimer);
//     }
//     if (this.questionTimer) {
//       clearTimeout(this.questionTimer);
//     }
//   }

//   getPlayers() {
//     return this.players;
//   }

//   getGameState() {
//     return {
//       gameId: this.id,
//       state: this.gameState,
//       currentQuestionIndex: this.currentQuestionIndex,
//       totalQuestions: this.gameSettings.questionsPerGame,
//       playerScores: Object.fromEntries(this.playerScores),
//       timeRemaining: this.getTimeRemaining(),
//       questionMeter: this.questionMeter,
//       questionMeterController: this.questionMeterController,
//       difficulty: this.difficulty
//     };
//   }

//   getTimeRemaining() {
//     if (this.gameState !== 'active') return 0;

//     const elapsed = Date.now() - this.createdAt;
//     return Math.max(0, this.gameSettings.totalGameTime - elapsed);
//   }

//   getPublicData() {
//     return {
//       id: this.id,
//       players: this.players.map(p => ({
//         id: p.id,
//         username: p.username,
//         rating: p.rating
//       })),
//       createdAt: this.createdAt,
//       gameState: this.gameState,
//       questionMeter: this.questionMeter,
//       difficulty: this.difficulty
//     };
//   }
// }

// module.exports = {GameRoom}

// services/GameRoom.js
const Player = require("../models/Player");
const PVPGame = require("../models/PVPGame");

/* ================================
   DATABASE HELPERS (PLAYER ID)
================================ */

async function updatePlayerRatingInDatabase(playerId, delta, diff) {
  try {
    const player = await Player.findById(playerId);
    if (!player) throw new Error(`Player not found: ${playerId}`);

    player.pr.pvp[diff] += delta;
    await player.save();

    return player;
  } catch (err) {
    console.error("Error updating PvP rating:", err);
    throw err;
  }
}

async function savePVPGameToDatabase(gameData) {
  try {
    const { player1Id, player2Id, player1Score, player2Score, gameDuration } =
      gameData;

    let result = "Draw";
    let winner = null;

    if (player1Score > player2Score) {
      result = "Player1Won";
      winner = player1Id;
    } else if (player2Score > player1Score) {
      result = "Player2Won";
      winner = player2Id;
    }

    const pvpGame = new PVPGame({
      player1: player1Id,
      player2: player2Id,
      scorePlayer1: player1Score,
      scorePlayer2: player2Score,
      winner,
      result,
      gameDuration: Math.floor(gameDuration / 1000),
      playedAt: new Date(),
    });

    await pvpGame.save();
    return pvpGame;
  } catch (err) {
    console.error("Error saving PVP game:", err);
    throw err;
  }
}

/* ================================
   GAME ROOM
================================ */

class GameRoom {
  constructor(players, questionService) {
    // ✅ NO UUID — playerId based room id
    this.id = `${players[0].id}_${players[1].id}_${Date.now()}`;

    this.players = players;
    this.questionService = questionService;
    this.createdAt = Date.now();
    this.gameState = "waiting";

    this.playerProgress = new Map(players.map((p) => [p.id, 0]));
    this.playerAnswers = new Map();
    this.playerScores = new Map();
    this.questions = [];

    this.gameTimer = null;
    this.questionTimer = null;

    this.questionMeter = questionService.getInitialQuestionMeter(
      players[0].rating,
      players[1].rating
    );

    this.questionMeterController = null;
    this.difficulty =
      players[0].rating > players[1].rating ? players[1].diff : players[0].diff;

    this.symbols = ["sum", "difference", "product", "quotient"];

    this.gameSettings = {
      questionsPerGame: 10,
      timePerQuestion: 30000,
      totalGameTime: 60000,
    };

    players.forEach((player) => {
      this.playerScores.set(player.id, {
        score: 0,
        correctAnswers: 0,
        totalTime: 0,
        streak: 0,
        maxStreak: 0,
        questionsAnswered: 0,
      });
    });
  }

  bindIO(io) {
    this.io = io;
  }

  startGame() {
    this.gameState = "active";
    this.gameTimer = setTimeout(
      () => this.endGame(),
      this.gameSettings.totalGameTime
    );
    this.players.forEach((p) => this.emitNextQuestion(p.id));
  }

  emitNextQuestion(playerId) {
    const idx = this.playerProgress.get(playerId);

    if (this.questions.length <= idx) {
      const lowerRating = Math.min(...this.players.map((p) => p.rating));
      const q = this.questionService.generateQuestion(
        this.difficulty,
        this.symbols,
        lowerRating,
        this.questionMeter
      );

      this.questions.push(q);
      this.playerAnswers.set(`${idx}`, new Map());
    }

    const player = this.players.find((p) => p.id === playerId);

    this.io.to(player.socketId).emit("next-question", {
      question: this.questions[idx],
      gameState: this.getGameState(),
      questionMeter: this.questionMeter,
    });

    this.playerProgress.set(playerId, idx + 1);
  }

  submitAnswer(playerId, answer, timeSpent) {
    if (this.gameState !== "active") return;

    const idx = this.playerProgress.get(playerId) - 1;
    const q = this.questions[idx];
    if (!q) return;

    const answers = this.playerAnswers.get(`${idx}`);
    if (answers.has(playerId)) return;

    const isCorrect = this.questionService.checkAnswer(q, answer);
    answers.set(playerId, { answer, isCorrect, timeSpent });

    const ps = this.playerScores.get(playerId);
    ps.questionsAnswered++;
    ps.totalTime += timeSpent;

    if (isCorrect) {
      ps.correctAnswers++;
      ps.streak++;
      ps.maxStreak = Math.max(ps.maxStreak, ps.streak);
      ps.score += 10;
    } else {
      ps.streak = 0;
    }
  }

  async endGame() {
    this.gameState = "completed";
    clearTimeout(this.gameTimer);
    clearTimeout(this.questionTimer);

    const gameResults = await this.calculateGameResults();
    await this.saveGameToDatabase(gameResults);

    return gameResults;
  }

  async calculateGameResults() {
    const results = this.players.map((player) => {
      const s = this.playerScores.get(player.id);
      return {
        playerId: player.id,
        currentRating: player.rating,
        finalScore: s.score,
        totalTime: s.totalTime,
      };
    });

    const winner = results.reduce((a, b) =>
      b.finalScore > a.finalScore ||
      (b.finalScore === a.finalScore && b.totalTime < a.totalTime)
        ? b
        : a
    );

    const ratingChanges = await this.calculateRatingChanges(results, winner);

    return {
      winner,
      players: results.map((r, i) => ({
        ...r,
        won: r.playerId === winner.playerId,
        newRating: r.currentRating + ratingChanges[i],
      })),
      gameStats: {
        duration: Date.now() - this.createdAt,
      },
    };
  }

  async saveGameToDatabase(gameResults) {
    const [p1, p2] = gameResults.players;

    await savePVPGameToDatabase({
      player1Id: p1.playerId,
      player2Id: p2.playerId,
      player1Score: p1.finalScore,
      player2Score: p2.finalScore,
      gameDuration: gameResults.gameStats.duration,
    });
  }

  async calculateRatingChanges(playerResults, winner) {
    const changes = [];

    for (const p of playerResults) {
      let delta = p.playerId === winner.playerId ? +5 : -5;

      await updatePlayerRatingInDatabase(p.playerId, delta, this.difficulty);

      changes.push(delta);
    }

    return changes;
  }

  getGameState() {
    return {
      gameId: this.id,
      state: this.gameState,
      playerProgress: Object.fromEntries(this.playerProgress),
      playerScores: Object.fromEntries(this.playerScores),
      questionMeter: this.questionMeter,
      timeRemaining: Math.max(
        0,
        this.gameSettings.totalGameTime - (Date.now() - this.createdAt)
      ),
    };
  }

  getPlayers() {
    return this.players;
  }

  getOpposingPlayer(playerId) {
    return this.players.find((p) => p.id !== playerId) || null;
  }

  getCurrentQuestion() {
    return this.questions[this.questions.length - 1] || null;
  }

  getPublicData() {
    return {
      id: this.id,
      players: this.players.map((p) => ({
        id: p.id,
        username: p.username,
        rating: p.rating,
      })),
      createdAt: this.createdAt,
      gameState: this.gameState,
      questionMeter: this.questionMeter,
      difficulty: this.difficulty,
    };
  }
}

module.exports = { GameRoom };

