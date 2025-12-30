const { getRedisClient } = require("../config/redis");

class RedisMatchmakingService {
  constructor(playerManager, gameRoomManager) {
    this.playerManager = playerManager;
    this.gameRoomManager = gameRoomManager;
    this.redisClient = null;
    this.isInitialized = false;

    // Callback storage: playerId -> callback
    this.playerCallbacks = new Map();

    // Initialize Redis connection
    this.initRedis();

    // Background cleanup job (remove expired entries every 30s)
    this.cleanupInterval = setInterval(
      () => this.cleanupExpiredPlayers(),
      30000
    );
  }

  async initRedis() {
    try {
      this.redisClient = await getRedisClient();
      this.isInitialized = true;
      console.log("✅ RedisMatchmakingService initialized");
    } catch (error) {
      console.error("❌ Failed to initialize Redis:", error);
      this.isInitialized = false;
    }
  }

  /**
   * Generate Redis keys for ELO-based bucketing
   * Rating buckets: 0-400, 400-800, 800-1200, 1200-1600, 1600-2000, 2000+
   */
  getELOBucket(rating) {
    if (rating < 400) return "0-400";
    if (rating < 800) return "400-800";
    if (rating < 1200) return "800-1200";
    if (rating < 1600) return "1200-1600";
    if (rating < 2000) return "1600-2000";
    return "2000+";
  }

  /**
   * Get adjacent buckets for expanded search
   */
  getAdjacentBuckets(bucket) {
    const buckets = [
      "0-400",
      "400-800",
      "800-1200",
      "1200-1600",
      "1600-2000",
      "2000+",
    ];
    const index = buckets.indexOf(bucket);

    const adjacent = [bucket]; // Always include own bucket

    if (index > 0) adjacent.unshift(buckets[index - 1]); // Lower bucket
    if (index < buckets.length - 1) adjacent.push(buckets[index + 1]); // Higher bucket

    return adjacent;
  }

  /**
   * Generate Redis queue key
   * Format: matchmaking:{difficulty}:{timer}:{eloBucket}
   */
  getQueueKey(difficulty, timer, eloBucket) {
    return `matchmaking:${difficulty}:${timer}:${eloBucket}`;
  }

  /**
   * Generate player metadata key
   * Format: player:{playerId}
   */
  getPlayerKey(playerId) {
    return `player:${playerId}`;
  }

  /**
   * Add player to matchmaking queue
   */
  async findMatch(player, onMatchFound) {
    if (!this.isInitialized) {
      await this.initRedis();
    }

    console.log(
      `🔍 Finding match for ${player.username} (Rating: ${player.rating})`
    );

    try {
      // ✅ Store callback FIRST
      this.playerCallbacks.set(player.id, onMatchFound);
      console.log(`✅ Stored callback for ${player.username} (${player.id})`);
      console.log(`📋 Total callbacks stored: ${this.playerCallbacks.size}`);

      const eloBucket = this.getELOBucket(player.rating);
      const queueKey = this.getQueueKey(player.diff, player.timer, eloBucket);

      // Store player metadata
      const playerData = {
        id: player.id,
        username: player.username,
        rating: player.rating,
        diff: player.diff,
        timer: player.timer,
        socketId: player.socketId,
        joinedAt: Date.now(),
      };

      await this.redisClient.setEx(
        this.getPlayerKey(player.id),
        300, // 5 minutes TTL
        JSON.stringify(playerData)
      );

      // Try immediate matching in same bucket
      const matched = await this.tryMatchInBucket(player, queueKey, eloBucket);

      if (matched) {
        console.log(`⚡ Instant match found for ${player.username}`);
        return;
      }

      // No immediate match - add to queue
      await this.redisClient.zAdd(queueKey, {
        score: player.rating,
        value: player.id,
      });

      console.log(`➕ Added ${player.username} to queue: ${queueKey}`);

      // Schedule expanded search after 5 seconds
      setTimeout(() => this.tryExpandedSearch(player), 5000);

      // Schedule wider search after 15 seconds
      setTimeout(() => this.tryExpandedSearch(player, true), 15000);
    } catch (error) {
      console.error("❌ Error in findMatch:", error);
      throw error;
    }
  }

  /**
   * Try to find a match in a specific bucket
   */
  async tryMatchInBucket(player, queueKey, eloBucket) {
    try {
      // Get all players in this bucket (sorted by rating)
      const playersInQueue = await this.redisClient.zRange(queueKey, 0, -1);

      if (playersInQueue.length === 0) {
        return false; // No one in queue
      }

      console.log(`🔎 Found ${playersInQueue.length} players in queue for ${player.username}`);

      // Find best opponent (closest rating)
      let bestOpponent = null;
      let smallestDiff = Infinity;

      for (const opponentId of playersInQueue) {
        if (opponentId === player.id) continue; // Skip self

        const opponentDataStr = await this.redisClient.get(
          this.getPlayerKey(opponentId)
        );

        if (!opponentDataStr) {
          // Player expired or left - remove from queue
          await this.redisClient.zRem(queueKey, opponentId);
          continue;
        }

        const opponentData = JSON.parse(opponentDataStr);

        // Check if opponent is still valid
        const opponent = this.playerManager.getPlayerById(opponentId);
        if (!opponent || opponent.isInGame) {
          await this.redisClient.zRem(queueKey, opponentId);
          continue;
        }

        // Calculate rating difference
        const ratingDiff = Math.abs(player.rating - opponentData.rating);

        if (ratingDiff < smallestDiff) {
          smallestDiff = ratingDiff;
          bestOpponent = opponent;
        }
      }

      if (bestOpponent) {
        console.log(`✅ Best opponent found: ${bestOpponent.username}`);
        // Match found!
        await this.createMatch(player, bestOpponent);
        return true;
      }

      return false;
    } catch (error) {
      console.error("❌ Error in tryMatchInBucket:", error);
      return false;
    }
  }

  /**
   * Try expanded search (adjacent buckets)
   */
  async tryExpandedSearch(player, wideSearch = false) {
    try {
      // Check if player still waiting
      const playerData = await this.redisClient.get(
        this.getPlayerKey(player.id)
      );
      if (!playerData) return; // Player left queue

      const playerObj = this.playerManager.getPlayerById(player.id);
      if (!playerObj || playerObj.isInGame) return; // Already matched

      const eloBucket = this.getELOBucket(player.rating);
      const bucketsToSearch = wideSearch
        ? this.getAllBuckets()
        : this.getAdjacentBuckets(eloBucket);

      console.log(
        `🔎 Expanded search for ${player.username} in buckets:`,
        bucketsToSearch
      );

      for (const bucket of bucketsToSearch) {
        const queueKey = this.getQueueKey(player.diff, player.timer, bucket);
        const matched = await this.tryMatchInBucket(player, queueKey, bucket);

        if (matched) {
          console.log(`✅ Match found in bucket: ${bucket}`);
          return;
        }
      }

      console.log(`⏳ No match yet for ${player.username}, waiting...`);
    } catch (error) {
      console.error("❌ Error in tryExpandedSearch:", error);
    }
  }

  /**
   * Get all buckets for very wide search
   */
  getAllBuckets() {
    return ["0-400", "400-800", "800-1200", "1200-1600", "1600-2000", "2000+"];
  }

  /**
   * Create a match between two players
   */
  async createMatch(player1, player2) {
    try {
      console.log(
        `🎮 Creating match: ${player1.username} vs ${player2.username}`
      );

      // ✅ DEBUG: Check callbacks BEFORE creating game room
      console.log(`📋 Total callbacks in map: ${this.playerCallbacks.size}`);
      console.log(`   Player1 (${player1.id}) callback exists: ${this.playerCallbacks.has(player1.id)}`);
      console.log(`   Player2 (${player2.id}) callback exists: ${this.playerCallbacks.has(player2.id)}`);

      // Mark both as in game
      player1.isInGame = true;
      player2.isInGame = true;

      // Create game room
      const gameRoom = this.gameRoomManager.createGameRoom([player1, player2]);

      // Remove both from all queues
      await this.removeFromQueue(player1);
      await this.removeFromQueue(player2);

      // Get callbacks
      const callback1 = this.playerCallbacks.get(player1.id);
      const callback2 = this.playerCallbacks.get(player2.id);

      console.log(`📞 Callback1 type: ${typeof callback1}`);
      console.log(`📞 Callback2 type: ${typeof callback2}`);

      // Clean up callbacks
      this.playerCallbacks.delete(player1.id);
      this.playerCallbacks.delete(player2.id);

      // Notify both players
      if (callback1) {
        console.log(`📤 Calling callback1 for ${player1.username}`);
        try {
          callback1(gameRoom);
          console.log(`✅ Callback1 executed successfully`);
        } catch (err) {
          console.error(`❌ Error executing callback1:`, err);
        }
      } else {
        console.log(`❌ No callback1 for ${player1.username}`);
      }
      
      if (callback2) {
        console.log(`📤 Calling callback2 for ${player2.username}`);
        try {
          callback2(gameRoom);
          console.log(`✅ Callback2 executed successfully`);
        } catch (err) {
          console.error(`❌ Error executing callback2:`, err);
        }
      } else {
        console.log(`❌ No callback2 for ${player2.username}`);
      }

      console.log(`✅ Match created: ${gameRoom.id}`);
    } catch (error) {
      console.error("❌ Error creating match:", error);
      throw error;
    }
  }

  /**
   * Remove player from matchmaking queue
   */
  async removeFromQueue(player) {
    try {
      console.log(`❌ Removing ${player.username} from queue`);

      const eloBucket = this.getELOBucket(player.rating);
      const allBuckets = this.getAllBuckets(); // Remove from all buckets to be safe

      // Remove from all possible queues
      for (const bucket of allBuckets) {
        const queueKey = this.getQueueKey(player.diff, player.timer, bucket);
        await this.redisClient.zRem(queueKey, player.id);
      }

      // Remove player metadata
      await this.redisClient.del(this.getPlayerKey(player.id));

      // ✅ DON'T remove callback here - it's needed for match notification!
      // The callback will be removed after match creation in createMatch()

      player.isInGame = false;
    } catch (error) {
      console.error("❌ Error removing from queue:", error);
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStatus() {
    try {
      if (!this.isInitialized) {
        return { totalInQueue: 0, byBucket: {}, players: [] };
      }

      const allBuckets = this.getAllBuckets();
      const difficulties = ["easy", "medium", "hard"];
      const timers = [30, 60, 90];

      const byBucket = {};
      const allPlayers = [];

      for (const diff of difficulties) {
        for (const timer of timers) {
          for (const bucket of allBuckets) {
            const queueKey = this.getQueueKey(diff, timer, bucket);
            const count = await this.redisClient.zCard(queueKey);

            if (count > 0) {
              const key = `${diff}-${timer}-${bucket}`;
              byBucket[key] = count;

              // Get player details
              const playerIds = await this.redisClient.zRange(queueKey, 0, -1);
              for (const playerId of playerIds) {
                const playerDataStr = await this.redisClient.get(
                  this.getPlayerKey(playerId)
                );
                if (playerDataStr) {
                  const playerData = JSON.parse(playerDataStr);
                  allPlayers.push({
                    ...playerData,
                    waitTime: Math.round(
                      (Date.now() - playerData.joinedAt) / 1000
                    ),
                  });
                }
              }
            }
          }
        }
      }

      return {
        totalInQueue: allPlayers.length,
        byBucket,
        players: allPlayers,
      };
    } catch (error) {
      console.error("❌ Error getting queue status:", error);
      return { totalInQueue: 0, byBucket: {}, players: [] };
    }
  }

  /**
   * Get average wait time
   */
  async getAverageWaitTime() {
    try {
      const status = await this.getQueueStatus();
      if (status.players.length === 0) return 0;

      const totalWaitTime = status.players.reduce(
        (sum, player) => sum + player.waitTime,
        0
      );

      return Math.round(totalWaitTime / status.players.length);
    } catch (error) {
      console.error("❌ Error calculating average wait time:", error);
      return 0;
    }
  }

  /**
   * Cleanup expired players from queues
   */
  async cleanupExpiredPlayers() {
    try {
      if (!this.isInitialized) return;

      console.log("🧹 Running queue cleanup...");

      const allBuckets = this.getAllBuckets();
      const difficulties = ["easy", "medium", "hard"];
      const timers = [30, 60, 90];

      let cleanedCount = 0;

      for (const diff of difficulties) {
        for (const timer of timers) {
          for (const bucket of allBuckets) {
            const queueKey = this.getQueueKey(diff, timer, bucket);
            const playerIds = await this.redisClient.zRange(queueKey, 0, -1);

            for (const playerId of playerIds) {
              const exists = await this.redisClient.exists(
                this.getPlayerKey(playerId)
              );

              if (!exists) {
                // Player metadata expired - remove from queue
                await this.redisClient.zRem(queueKey, playerId);
                cleanedCount++;
              }
            }
          }
        }
      }

      if (cleanedCount > 0) {
        console.log(`🧹 Cleaned ${cleanedCount} expired players from queues`);
      }
    } catch (error) {
      console.error("❌ Error in cleanup:", error);
    }
  }

  /**
   * Get queue size
   */
  async getQueueSize() {
    const status = await this.getQueueStatus();
    return status.totalInQueue;
  }

  /**
   * Destroy service and cleanup
   */
  async destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Note: Don't close Redis client as it's shared
    console.log("🛑 RedisMatchmakingService destroyed");
  }
}

module.exports = { RedisMatchmakingService };
