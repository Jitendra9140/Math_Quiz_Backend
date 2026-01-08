const Player = require("../models/Player");

class PlayerManager {
  constructor() {
    this.players = new Map(); // socketId -> player
    this.playersByRating = new Map(); // rating range -> Set
    this.playersById = new Map(); // playerId -> player
  }

  addPlayer(socketId, playerData) {
    const existingPlayer = this.playersById.get(playerData.id);

    // 🔁 PLAYER RECONNECTED
    if (existingPlayer) {
      console.log("♻️ Player reconnected:", playerData.id);

      // Remove old socket mapping
      this.players.delete(existingPlayer.socketId);

      // Update socket id and metadata
      existingPlayer.socketId = socketId;
      existingPlayer.joinedAt = Date.now();

      // Update settings if changed
      if (playerData.rating !== undefined)
        existingPlayer.rating = playerData.rating;
      if (playerData.diff !== undefined) existingPlayer.diff = playerData.diff;
      if (playerData.timer !== undefined)
        existingPlayer.timer = playerData.timer;
      if (playerData.symbol !== undefined)
        existingPlayer.symbol = playerData.symbol;

      // Re-map
      this.players.set(socketId, existingPlayer);

      return existingPlayer;
    }

    // 🆕 NEW PLAYER
    const player = {
      id: playerData.id, // MongoDB ID
      socketId,
      username: playerData.username,
      email: playerData.email || null,
      rating: playerData.rating || 1200,
      diff: playerData.diff || "medium",
      timer: playerData.timer || 60, // ✅ Add timer support
      symbol: playerData.symbol || ["sum", "difference", "product", "quotient"], // ✅ Add symbol support
      gamesPlayed: playerData.gamesPlayed || 0,
      wins: playerData.wins || 0,
      losses: playerData.losses || 0,
      joinedAt: Date.now(),
      isInGame: false,
      lastActivity: Date.now(),
    };

    this.players.set(socketId, player);
    this.playersById.set(player.id, player);
    this.addToRatingGroup(player);

    console.log(`✅ Player registered: ${player.username} (${player.id})`);
    return player;
  }

  removePlayer(socketId) {
    const player = this.players.get(socketId);
    if (!player) return;

    this.players.delete(socketId);

    // ❗ DO NOT delete playersById immediately - allow reconnection
    setTimeout(() => {
      // Only remove if they haven't reconnected with a different socket
      if (player.socketId === socketId) {
        this.playersById.delete(player.id);
        this.removeFromRatingGroup(player);
        console.log(`❌ Player removed: ${player.username} (${player.id})`);
      }
    }, 5000); // 5 second grace period for reconnection
  }

  getPlayer(socketId) {
    return this.players.get(socketId);
  }

  getPlayerById(playerId) {
    return this.playersById.get(playerId);
  }
  updatePlayerGamePreferences(socketId, updates) {
    const player = this.players.get(socketId);
    if (!player) return null;

    // 🔁 Remove from old rating group if rating changes
    if (updates.rating && updates.rating !== player.rating) {
      this.removeFromRatingGroup(player);
      player.rating = updates.rating;
      this.addToRatingGroup(player);
    }

    if (updates.diff !== undefined) player.diff = updates.diff;
    if (updates.timer !== undefined) player.timer = updates.timer;
    if (updates.symbol !== undefined) player.symbol = updates.symbol;

    player.lastActivity = Date.now();

    return player;
  }

  updatePlayerActivity(socketId) {
    const player = this.players.get(socketId);
    if (player) {
      player.lastActivity = Date.now();
    }
  }

  addToRatingGroup(player) {
    const ratingRange = this.getRatingRange(player.rating);
    if (!this.playersByRating.has(ratingRange)) {
      this.playersByRating.set(ratingRange, new Set());
    }
    this.playersByRating.get(ratingRange).add(player);
  }

  removeFromRatingGroup(player) {
    const ratingRange = this.getRatingRange(player.rating);
    const group = this.playersByRating.get(ratingRange);
    if (group) {
      group.delete(player);
      if (group.size === 0) {
        this.playersByRating.delete(ratingRange);
      }
    }
  }

  getRatingRange(rating) {
    return Math.floor(rating / 200) * 200;
  }

  findPlayersInRatingRange(
    targetRating,
    maxDifference = 200,
    excludePlayerId = null
  ) {
    const players = [];
    const minRating = targetRating - maxDifference;
    const maxRating = targetRating + maxDifference;

    for (const [, playerSet] of this.playersByRating) {
      for (const player of playerSet) {
        if (
          player.id !== excludePlayerId &&
          !player.isInGame &&
          player.rating >= minRating &&
          player.rating <= maxRating
        ) {
          players.push(player);
        }
      }
    }
    return players;
  }

  // ✅ NEW: Get all online players
  getAllPlayers() {
    return Array.from(this.players.values());
  }

  // ✅ NEW: Get players by difficulty
  getPlayersByDifficulty(difficulty) {
    return this.getAllPlayers().filter((p) => p.diff === difficulty);
  }

  // ✅ NEW: Get players by timer
  getPlayersByTimer(timer) {
    return this.getAllPlayers().filter((p) => p.timer === timer);
  }

  // ✅ NEW: Get online count
  getOnlineCount() {
    return this.players.size;
  }

  // ✅ NEW: Get players in game
  getPlayersInGame() {
    return this.getAllPlayers().filter((p) => p.isInGame);
  }

  // ✅ NEW: Cleanup inactive players (> 10 minutes)
  cleanupInactivePlayers() {
    const now = Date.now();
    const timeout = 10 * 60 * 1000; // 10 minutes

    for (const [socketId, player] of this.players) {
      if (!player.isInGame && now - player.lastActivity > timeout) {
        console.log(`🧹 Removing inactive player: ${player.username}`);
        this.removePlayer(socketId);
      }
    }
  }

  // ✅ NEW: Get statistics
  getStatistics() {
    const players = this.getAllPlayers();

    const byDifficulty = {
      easy: 0,
      medium: 0,
      hard: 0,
    };

    const byTimer = {
      30: 0,
      60: 0,
      90: 0,
    };

    players.forEach((p) => {
      if (byDifficulty[p.diff] !== undefined) {
        byDifficulty[p.diff]++;
      }
      if (byTimer[p.timer] !== undefined) {
        byTimer[p.timer]++;
      }
    });

    return {
      totalOnline: this.players.size,
      inGame: this.getPlayersInGame().length,
      searching: players.filter((p) => !p.isInGame).length,
      byDifficulty,
      byTimer,
    };
  }
}

module.exports = { PlayerManager };

