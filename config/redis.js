// config/redis.js
const { createClient } = require("redis");

let redisClient = null;
let isConnecting = false;

async function getRedisClient() {
  if (redisClient && redisClient.isOpen) {
    return redisClient;
  }

  if (isConnecting) {
    // Wait for connection to complete
    await new Promise((resolve) => setTimeout(resolve, 100));
    return getRedisClient();
  }

  isConnecting = true;

  try {
    redisClient = createClient({
      username: "default",
      password: "Qoei7XT7O8DCZKChlJfX295gfVA8y9cp",
      socket: {
        host: "redis-10360.crce206.ap-south-1-1.ec2.cloud.redislabs.com",
        port: 10360,
        rejectUnauthorized: false,
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            console.error("❌ Redis: Too many retries, giving up");
            return new Error("Too many retries");
          }
          // Exponential backoff: 50ms, 100ms, 200ms, 400ms...
          return Math.min(retries * 50, 3000);
        },
      },
    });

    redisClient.on("error", (err) => {
      console.error("❌ Redis Client Error:", err.message);
    });

    redisClient.on("connect", () => {
      console.log("🔗 Redis connecting...");
    });

    redisClient.on("ready", () => {
      console.log("✅ Redis ready!");
    });

    redisClient.on("reconnecting", () => {
      console.log("🔄 Redis reconnecting...");
    });

    redisClient.on("end", () => {
      console.log("🔌 Redis connection closed");
    });

    await redisClient.connect();
    isConnecting = false;

    console.log("✅ Redis connected successfully");
    return redisClient;
  } catch (error) {
    isConnecting = false;
    console.error("❌ Redis connection failed:", error);
    throw error;
  }
}

// Graceful shutdown
process.on("SIGTERM", async () => {
  if (redisClient) {
    await redisClient.quit();
  }
});

process.on("SIGINT", async () => {
  if (redisClient) {
    await redisClient.quit();
  }
});

module.exports = { getRedisClient };
