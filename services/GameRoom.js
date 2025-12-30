const { GameRoom } = require("./GameRoom.js");

class GameRoomManager {
  constructor(questionService, io) {
    this.questionService = questionService;
    this.gameRooms = new Map(); // roomId -> GameRoom
    this.playerToRoom = new Map(); // playerId -> roomId
    this.io = io;

    // ✅ NEW: Track game statistics
    this.stats = {
      totalGamesCreated: 0,
      totalGamesCompleted: 0,
      totalDisconnects: 0,
      activeGames: 0,
    };
  }

  createGameRoom(players) {
    // ✅ Clean up any stale mappings FIRST with detailed logging
    players.forEach((p) => {
      const existingRoomId = this.playerToRoom.get(p.id);
      if (existingRoomId) {
        console.log(
          `⚠️ Player ${p.username} (${p.id}) already mapped to room: ${existingRoomId}`
        );

        const existingRoom = this.gameRooms.get(existingRoomId);

        if (!existingRoom) {
          console.log(
            `🧹 Cleaning stale mapping for ${p.username} - room no longer exists`
          );
          this.playerToRoom.delete(p.id);
        } else {
          console.log(`❌ Room ${existingRoomId} still exists!`);
          console.log(`   Room state: ${existingRoom.gameState}`);
          console.log(
            `   Room created: ${new Date(existingRoom.createdAt).toISOString()}`
          );
          console.log(
            `   Room age: ${Math.round(
              (Date.now() - existingRoom.createdAt) / 1000
            )}s`
          );

          // ✅ If the game is completed, force cleanup
          if (existingRoom.gameState === "completed") {
            console.log(
              `🧹 Force cleaning completed game room: ${existingRoomId}`
            );
            this.removeGameRoom(existingRoomId);
          } else {
            // Room still active - this is a real duplicate
            throw new Error(
              `Player already in a game: ${p.id} (${p.username})`
            );
          }
        }
      }
    });

    // Create game room
    const gameRoom = new GameRoom(players, this.questionService);
    gameRoom.bindIO(this.io);

    // Store mappings
    this.gameRooms.set(gameRoom.id, gameRoom);
    players.forEach((p) => this.playerToRoom.set(p.id, gameRoom.id));

    // Update stats
    this.stats.totalGamesCreated++;
    this.stats.activeGames = this.gameRooms.size;

    console.log(`✅ Game room created: ${gameRoom.id}`);
    console.log(`   Players: ${players.map((p) => p.username).join(" vs ")}`);
    console.log(`   Active games: ${this.stats.activeGames}`);

    return gameRoom;
  }

  getGameRoom(roomId) {
    return this.gameRooms.get(roomId);
  }

  getPlayerGameRoom(playerId) {
    const roomId = this.playerToRoom.get(playerId);
    return roomId ? this.gameRooms.get(roomId) : null;
  }

  removeGameRoom(roomId) {
    const gameRoom = this.gameRooms.get(roomId);
    if (!gameRoom) {
      console.warn(`⚠️ Attempted to remove non-existent game room: ${roomId}`);
      return;
    }

    // Check if game was completed or disconnected
    if (gameRoom.gameState === "completed") {
      if (gameRoom.disconnectedPlayerId) {
        this.stats.totalDisconnects++;
      } else {
        this.stats.totalGamesCompleted++;
      }
    }

    // Remove player mappings
    gameRoom.getPlayers().forEach((player) => {
      console.log(
        `🗑️ Removing player mapping: ${player.username} (${player.id})`
      );
      this.playerToRoom.delete(player.id);
    });

    // Remove game room
    this.gameRooms.delete(roomId);

    // Update stats
    this.stats.activeGames = this.gameRooms.size;

    console.log(`🗑️ Game room removed: ${roomId}`);
    console.log(`   Active games: ${this.stats.activeGames}`);
  }

  // ✅ NEW: Force end a game (admin/cleanup)
  async forceEndGame(roomId, reason = "forced") {
    const gameRoom = this.getGameRoom(roomId);
    if (!gameRoom) return null;

    console.log(`⚠️ Force ending game: ${roomId} (Reason: ${reason})`);

    const gameResults = await gameRoom.endGame();
    this.removeGameRoom(roomId);

    return gameResults;
  }

  // ✅ NEW: Get all active games with details
  getActiveGames() {
    const games = [];

    for (const [roomId, gameRoom] of this.gameRooms) {
      games.push({
        id: roomId,
        players: gameRoom.getPlayers().map((p) => ({
          id: p.id,
          username: p.username,
          rating: p.rating,
        })),
        state: gameRoom.gameState,
        createdAt: gameRoom.createdAt,
        duration: Date.now() - gameRoom.createdAt,
        difficulty: gameRoom.difficulty,
        questionMeter: gameRoom.questionMeter,
      });
    }

    return games;
  }

  // ✅ NEW: Get game by player socketId
  getGameRoomBySocketId(socketId, playerManager) {
    const player = playerManager.getPlayer(socketId);
    if (!player) return null;
    return this.getPlayerGameRoom(player.id);
  }

  getActiveGamesCount() {
    return this.gameRooms.size;
  }

  getAllGameRooms() {
    return Array.from(this.gameRooms.values());
  }

  // ✅ NEW: Get statistics
  getStatistics() {
    return {
      ...this.stats,
      activeGames: this.gameRooms.size,
      completionRate:
        this.stats.totalGamesCreated > 0
          ? (
              (this.stats.totalGamesCompleted / this.stats.totalGamesCreated) *
              100
            ).toFixed(2) + "%"
          : "0%",
      disconnectRate:
        this.stats.totalGamesCreated > 0
          ? (
              (this.stats.totalDisconnects / this.stats.totalGamesCreated) *
              100
            ).toFixed(2) + "%"
          : "0%",
    };
  }

  // ✅ NEW: Cleanup stale games (> 15 minutes old)
  cleanupStaleGames() {
    const now = Date.now();
    const maxGameTime = 15 * 60 * 1000; // 15 minutes

    for (const [roomId, gameRoom] of this.gameRooms) {
      const gameAge = now - gameRoom.createdAt;

      if (gameAge > maxGameTime) {
        console.log(
          `🧹 Cleaning up stale game: ${roomId} (Age: ${Math.round(
            gameAge / 1000
          )}s)`
        );
        this.forceEndGame(roomId, "stale");
      }
    }
  }

  // ✅ NEW: Reset statistics
  resetStatistics() {
    this.stats = {
      totalGamesCreated: 0,
      totalGamesCompleted: 0,
      totalDisconnects: 0,
      activeGames: this.gameRooms.size,
    };
    console.log("📊 Statistics reset");
  }
}

module.exports = { GameRoomManager };
