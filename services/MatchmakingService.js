//  class MatchmakingService {
//   constructor(playerManager, gameRoomManager) {
//     this.playerManager = playerManager;
//     this.gameRoomManager = gameRoomManager;
//     this.matchmakingQueue = new Map(); // playerId -> { player, searchStartTime, maxRatingDiff }
//     this.matchmakingInterval = setInterval(
//       () => this.processMatchmaking(),
//       2000
//     );
//   }

//   findMatch(player, onMatchFound) {
//     console.log("finding match");
//     console.log(player)
//     // Add player to matchmaking queue
//     this.matchmakingQueue.set(player.id, {
//       player,
//       searchStartTime: Date.now(),
//       maxRatingDiff: 100, // Start with strict matching
//       onMatchFound,
//     });

//     player.isInGame = false;

//     // Try immediate matching
//     this.tryMatchPlayer(player.id);
//   }

//   processMatchmaking() {
//     for (const [playerId, queueData] of this.matchmakingQueue) {
//       // Expand search range over time (up to 5 minutes)
//       const searchTime = Date.now() - queueData.searchStartTime;
//       const timeBasedExpansion = Math.min(searchTime / 1000 / 10, 30); // 3 points per second, max 300
//       queueData.maxRatingDiff = Math.min(100 + timeBasedExpansion * 10, 500);

//       this.tryMatchPlayer(playerId);
//     }
//   }

//   tryMatchPlayer(playerId) {
//     const queueData = this.matchmakingQueue.get(playerId);
//     if (!queueData) return;

//     const { player, maxRatingDiff, onMatchFound } = queueData;

//     // Find potential opponents
//     const potentialOpponents = this.playerManager
//       .findPlayersInRatingRange(player.rating, maxRatingDiff)
//       .filter(
//         (p) =>
//           p.id !== player.id &&
//           !p.isInGame &&
//           p.timer == player.timer &&
//           p.diff == player.diff &&
//           this.matchmakingQueue.has(p.id)
//       );

//     if (potentialOpponents.length > 0) {
//       // Select best opponent (closest rating)
//       const opponent = potentialOpponents.reduce((best, current) => {
//         const bestDiff = Math.abs(best.rating - player.rating);
//         const currentDiff = Math.abs(current.rating - player.rating);
//         return currentDiff < bestDiff ? current : best;
//       });

//       // Create game room
//       const gameRoom = this.gameRoomManager.createGameRoom([player, opponent]);

//       // Mark players as in game
//       player.isInGame = true;
//       opponent.isInGame = true;

//       // Get opponent's callback BEFORE removing from queue
//       const opponentQueueData = this.matchmakingQueue.get(opponent.id);

//       // Remove from matchmaking queue
//       this.matchmakingQueue.delete(player.id);
//       this.matchmakingQueue.delete(opponent.id);

//       // Notify about match
//       onMatchFound(gameRoom);
//       if (opponentQueueData) {
//         opponentQueueData.onMatchFound(gameRoom);
//       }
//     }
//   }

//   removeFromQueue(player) {
//     console.log("player removed from queue", player);
//     this.matchmakingQueue.delete(player.id);
//     player.isInGame = false;
//   }

//   getQueueSize() {
//     return this.matchmakingQueue.size;
//   }

//   // ✅ FIXED: Convert Map to Array before using .map()
//   getQueueStatus() {
//     const playersArray = Array.from(this.matchmakingQueue.values());
//     return {
//       totalInQueue: this.matchmakingQueue.size, // ✅ Use .size for Map, not .length
//       players: playersArray.map((queueData) => ({
//         id: queueData.player.id,
//         username: queueData.player.username,
//         rating: queueData.player.rating,
//         diff: queueData.player.diff,
//         waitTime: Math.round((Date.now() - queueData.searchStartTime) / 1000), // seconds waiting
//         maxRatingDiff: queueData.maxRatingDiff,
//       })),
//     };
//   }

//   getAverageWaitTime() {
//     if (this.matchmakingQueue.size === 0) return 0;

//     const now = Date.now();
//     const totalWaitTime = Array.from(this.matchmakingQueue.values()).reduce(
//       (sum, queueData) => sum + (now - queueData.searchStartTime),
//       0
//     );

//     return Math.round(totalWaitTime / this.matchmakingQueue.size / 1000);
//   }

//   destroy() {
//     if (this.matchmakingInterval) {
//       clearInterval(this.matchmakingInterval);
//     }
//   }
// }

// module.exports = { MatchmakingService };






