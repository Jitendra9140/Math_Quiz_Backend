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
    const {
      player1Id,
      player2Id,
      player1Score,
      player2Score,
      gameDuration,
      disconnectedPlayerId,
    } = gameData;

    let result = "Draw";
    let winner = null;

    if (disconnectedPlayerId) {
      winner = disconnectedPlayerId === player1Id ? player2Id : player1Id;
      result = disconnectedPlayerId === player1Id ? "Player2Won" : "Player1Won";
    } else {
      if (player1Score > player2Score) {
        result = "Player1Won";
        winner = player1Id;
      } else if (player2Score > player1Score) {
        result = "Player2Won";
        winner = player2Id;
      }
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

    this.disconnectedPlayerId = null;
    this.disconnectedAt = null;

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

      // base score for correct answer
      let points = 1;

      // streak bonuses
      if (ps.streak === 3) points += 2;
      else if (ps.streak === 5) points += 3;
      else if (ps.streak === 7) points += 5;

      ps.score += points;
    } else {
      ps.streak = 0;
    }
  }

  async handlePlayerDisconnect(playerId) {
    console.log(`🔌 Player ${playerId} disconnected from game ${this.id}`);

    if (this.gameState !== "active" && this.gameState !== "waiting") {
      console.log(`Game already ${this.gameState}, ignoring disconnect`);
      return null;
    }

    this.disconnectedPlayerId = playerId;
    this.disconnectedAt = Date.now();
    this.gameState = "completed";

    if (this.gameTimer) {
      clearTimeout(this.gameTimer);
      this.gameTimer = null;
    }
    if (this.questionTimer) {
      clearTimeout(this.questionTimer);
      this.questionTimer = null;
    }

    const remainingPlayer = this.players.find((p) => p.id !== playerId);
    const disconnectedPlayer = this.players.find((p) => p.id === playerId);

    if (!remainingPlayer) {
      console.error("No remaining player found!");
      return null;
    }

    const gameResults = await this.calculateDisconnectResults(
      remainingPlayer,
      disconnectedPlayer
    );

    await this.saveGameToDatabase(gameResults);

    // ✅ CRITICAL: Mark players as NOT in game
    this.markPlayersAsNotInGame();

    if (this.io && remainingPlayer.socketId) {
      this.io.to(remainingPlayer.socketId).emit("opponent-disconnected", {
        message: "Your opponent has disconnected. You win!",
        gameResults: gameResults,
        finalQuestionMeter: this.questionMeter,
        yourPlayerId: remainingPlayer.id,
        disconnectedPlayerId: playerId,
      });

      console.log(
        `📤 Sent opponent-disconnected to ${remainingPlayer.username}`
      );
    }

    return gameResults;
  }

  async calculateDisconnectResults(winner, disconnectedPlayer) {
    const winnerScore = this.playerScores.get(winner.id);
    const disconnectedScore = this.playerScores.get(disconnectedPlayer.id);

    const results = [
      {
        playerId: winner.id,
        username: winner.username,
        currentRating: winner.rating,
        finalScore: winnerScore.score,
        totalTime: winnerScore.totalTime,
        correctAnswers: winnerScore.correctAnswers,
        disconnected: false,
      },
      {
        playerId: disconnectedPlayer.id,
        username: disconnectedPlayer.username,
        currentRating: disconnectedPlayer.rating,
        finalScore: disconnectedScore.score,
        totalTime: disconnectedScore.totalTime,
        correctAnswers: disconnectedScore.correctAnswers,
        disconnected: true,
      },
    ];

    const ratingChanges = await this.calculateDisconnectRatingChanges(
      results,
      winner.id
    );

    return {
      winner: results[0],
      disconnectedPlayer: results[1],
      players: results.map((r, i) => ({
        ...r,
        won: r.playerId === winner.id,
        newRating: r.currentRating + ratingChanges[i],
        ratingChange: ratingChanges[i],
      })),
      gameStats: {
        duration: this.disconnectedAt - this.createdAt,
        endReason: "disconnect",
        disconnectedAt: this.disconnectedAt,
      },
    };
  }

  async calculateDisconnectRatingChanges(playerResults, winnerId) {
    const changes = [];

    for (const p of playerResults) {
      let delta = p.playerId === winnerId ? +5 : -10;
      await updatePlayerRatingInDatabase(p.playerId, delta, this.difficulty);
      changes.push(delta);
    }

    return changes;
  }

  async endGame() {
    if (this.gameState === "completed") {
      console.log("Game already completed, skipping endGame");
      return null;
    }

    this.gameState = "completed";
    clearTimeout(this.gameTimer);
    clearTimeout(this.questionTimer);

    const gameResults = await this.calculateGameResults();
    await this.saveGameToDatabase(gameResults);

    // ✅ CRITICAL: Mark players as NOT in game
    this.markPlayersAsNotInGame();

    return gameResults;
  }

  async calculateGameResults() {
    const results = this.players.map((player) => {
      const s = this.playerScores.get(player.id);
      return {
        playerId: player.id,
        username: player.username,
        currentRating: player.rating,
        finalScore: s.score,
        totalTime: s.totalTime,
        correctAnswers: s.correctAnswers,
        disconnected: false,
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
        ratingChange: ratingChanges[i],
      })),
      gameStats: {
        duration: Date.now() - this.createdAt,
        endReason: "normal",
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
      disconnectedPlayerId: this.disconnectedPlayerId,
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

  // ✅ NEW: Mark all players as not in game
  markPlayersAsNotInGame() {
    console.log(`🔓 Marking players as NOT in game for room ${this.id}`);
    this.players.forEach((player) => {
      player.isInGame = false;
      console.log(
        `   ✅ ${player.username} (${player.id}) - isInGame set to FALSE`
      );
    });
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
      disconnectedPlayerId: this.disconnectedPlayerId,
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
