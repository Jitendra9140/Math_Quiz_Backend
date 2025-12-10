class MatchmakingService {
  constructor(playerManager, gameRoomManager) {
    this.playerManager = playerManager;
    this.gameRoomManager = gameRoomManager;
    this.matchmakingQueue = new Map(); // playerId -> { player, searchStartTime, maxRatingDiff }
    this.matchmakingInterval = setInterval(() => this.processMatchmaking(), 2000);
  }

  findMatch(player, onMatchFound) {
    console.log('finding match')
    // Add player to matchmaking queue
    this.matchmakingQueue.set(player.id, {
      player,
      searchStartTime: Date.now(),
      maxRatingDiff: 100, // Start with strict matching
      onMatchFound
    });

    player.isInGame = false;
    
    // Try immediate matching
    this.tryMatchPlayer(player.id);
  }

  processMatchmaking() {
    for (const [playerId, queueData] of this.matchmakingQueue) {
      // Expand search range over time (up to 5 minutes)
      const searchTime = Date.now() - queueData.searchStartTime;
      const timeBasedExpansion = Math.min(searchTime / 1000 / 10, 30); // 3 points per second, max 300
      queueData.maxRatingDiff = Math.min(100 + timeBasedExpansion * 10, 500);

      this.tryMatchPlayer(playerId);
    }
  }

  tryMatchPlayer(playerId) {
    const queueData = this.matchmakingQueue.get(playerId);
    if (!queueData) return;

    const { player, maxRatingDiff, onMatchFound } = queueData;

    // Find potential opponents
    const potentialOpponents = this.playerManager
      .findPlayersInRatingRange(player.rating, maxRatingDiff)
      .filter(p => 
        p.id !== player.id && 
        !p.isInGame && 
        p.timer == player.timer && 
        p.diff == player.diff && 
        this.matchmakingQueue.has(p.id)
      );

    if (potentialOpponents.length > 0) {
      // Select best opponent (closest rating)
      const opponent = potentialOpponents.reduce((best, current) => {
        const bestDiff = Math.abs(best.rating - player.rating);
        const currentDiff = Math.abs(current.rating - player.rating);
        return currentDiff < bestDiff ? current : best;
      });

      // Create game room
      const gameRoom = this.gameRoomManager.createGameRoom([player, opponent]);
      
      // Mark players as in game
      player.isInGame = true;
      opponent.isInGame = true;

      // Remove from matchmaking queue
      this.matchmakingQueue.delete(player.id);
      this.matchmakingQueue.delete(opponent.id);

      // Notify about match
      onMatchFound(gameRoom);
      const opponentQueueData = this.matchmakingQueue.get(opponent.id);
      if (opponentQueueData) {
        opponentQueueData.onMatchFound(gameRoom);
      }
    }
  }

  removeFromQueue(player) {
    console.log('player removed from queue', player)
    this.matchmakingQueue.delete(player.id);
    player.isInGame = false;
  }

  getQueueSize() {
    return this.matchmakingQueue.size;
  }

  getAverageWaitTime() {
    if (this.matchmakingQueue.size === 0) return 0;
    
    const now = Date.now();
    const totalWaitTime = Array.from(this.matchmakingQueue.values())
      .reduce((sum, queueData) => sum + (now - queueData.searchStartTime), 0);
    
    return Math.round(totalWaitTime / this.matchmakingQueue.size / 1000);
  }

  destroy() {
    if (this.matchmakingInterval) {
      clearInterval(this.matchmakingInterval);
    }
  }
}

module.exports = {MatchmakingService}


//  auto matching player logic ^

// manually send changle request logic v

// class MatchmakingService {
//   constructor(playerManager, gameRoomManager) {
//     this.playerManager = playerManager;
//     this.gameRoomManager = gameRoomManager;

//     // Track pending challenges: key = opponentId, value = challengerId
//     this.pendingChallenges = new Map();
//     // Cooldown tracking: key = playerId, value = timestamp
//     this.cooldowns = new Map();
//   }

//   /** Get a list of potential opponents for a player */
//   findPotentialOpponents(player) {
//     console.log(`Finding potential opponents for player ${player.id}`);
//     console.log('playermangaer', this.playerManager);

//     const allOpponents = this.playerManager
//       .findPlayersInRatingRange(player.rating, 2000)
//       .filter(
//         (p) =>
//           p.id !== player.id &&
//           !p.isInGame &&
//           p.timer === player.timer &&
//           p.diff === player.diff
//       );

//       console.log('all opponents', allOpponents);

//     // Sort by closest rating
//     allOpponents.sort(
//       (a, b) => Math.abs(a.rating - player.rating) - Math.abs(b.rating - player.rating)
//     );

//     // Return top 10
//     return allOpponents.slice(0, 10);
//   }

//   /** Send a challenge request */
//   sendChallenge(challengerId, opponentId, io) {
//     const challenger = this.playerManager.getPlayerById(challengerId);
//     const opponent = this.playerManager.getPlayerById(opponentId);

//     if (!challenger || !opponent)
//       return { success: false, message: "Player not found" };

//     if (challenger.isInGame || opponent.isInGame)
//       return { success: false, message: "One of the players is already in a game" };

//     // Check cooldown
//     const now = Date.now();
//     const lastChallengeTime = this.cooldowns.get(challengerId);
//     if (lastChallengeTime && now - lastChallengeTime < 10000) {
//       const wait = ((10000 - (now - lastChallengeTime)) / 1000).toFixed(1);
//       return { success: false, message: `Please wait ${wait}s before sending another challenge.` };
//     }

//     // Prevent duplicate challenge
//     if (this.pendingChallenges.has(opponentId)) {
//       return { success: false, message: "Opponent already has a pending challenge." };
//     }

//     // Store pending challenge
//     this.pendingChallenges.set(opponentId, {
//       challengerId,
//       createdAt: Date.now(),
//     });

//     // Add cooldown
//     this.cooldowns.set(challengerId, Date.now());

//     // Notify opponent
//     io.to(opponent.socketId).emit("challenge-received", {
//       fromPlayer: {
//         id: challenger.id,
//         name: challenger.name,
//         rating: challenger.rating,
//       },
//     });

//     // Auto-expire after 30 seconds
//     setTimeout(() => {
//       const challenge = this.pendingChallenges.get(opponentId);
//       if (challenge && challenge.challengerId === challengerId) {
//         this.pendingChallenges.delete(opponentId);
//         io.to(challenger.socketId).emit("challenge-expired", { opponentId });
//         io.to(opponent.socketId).emit("challenge-expired", { challengerId });
//       }
//     }, 30000);

//     return { success: true, message: "Challenge sent successfully" };
//   }

//   /** Handle opponent response */
//   respondToChallenge(opponentId, accepted, io) {
//     const challenge = this.pendingChallenges.get(opponentId);
//     if (!challenge) {
//       return { success: false, message: "No active challenge found" };
//     }

//     const { challengerId } = challenge;
//     const challenger = this.playerManager.getPlayerById(challengerId);
//     const opponent = this.playerManager.getPlayerById(opponentId);

//     if (!challenger || !opponent)
//       return { success: false, message: "Player not found" };

//     this.pendingChallenges.delete(opponentId);

//     if (!accepted) {
//       io.to(challenger.socketId).emit("challenge-declined", {
//         by: opponent.id,
//         name: opponent.name,
//       });
//       return { success: true, message: "Challenge declined" };
//     }

//     // Create game room
//     const gameRoom = this.gameRoomManager.createGameRoom([challenger, opponent]);
//     challenger.isInGame = true;
//     opponent.isInGame = true;

//     io.to(challenger.socketId).emit("match-found", { gameRoom, opponent });
//     io.to(opponent.socketId).emit("match-found", { gameRoom, opponent: challenger });

//     return { success: true, message: "Match started" };
//   }
// }

// module.exports = { MatchmakingService };



