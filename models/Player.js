// models/Player.js
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const playerSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: false,
      trim: true,
    },
    lastName: {
      type: String,
      required: false,
      trim: true,
    },
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
    },
    gender: {
      type: String,
      enum: ["male", "female", "other"],
      required: false,
    },
    country: {
      type: String,
      required: false,
      trim: true,
    },
    dateOfBirth: {
      type: Date,
      required: false,
    },
    profileImage: {
      type: String,
      default: null,
    },

    // ✅ Personal Records / Ratings (ELO-style)
    pr: {
      practice: {
        easy: { type: Number, default: 1000 },
        medium: { type: Number, default: 1000 },
        hard: { type: Number, default: 1000 },
      },
      pvp: {
        easy: { type: Number, default: 1000 },
        medium: { type: Number, default: 1000 },
        hard: { type: Number, default: 1000 },
      },
    },

    // ✅ NEW: Game Statistics
    stats: {
      // Practice Mode Stats
      practice: {
        easy: {
          gamesPlayed: { type: Number, default: 0 },
          highScore: { type: Number, default: 0 },
          totalScore: { type: Number, default: 0 },
          averageScore: { type: Number, default: 0 },
        },
        medium: {
          gamesPlayed: { type: Number, default: 0 },
          highScore: { type: Number, default: 0 },
          totalScore: { type: Number, default: 0 },
          averageScore: { type: Number, default: 0 },
        },
        hard: {
          gamesPlayed: { type: Number, default: 0 },
          highScore: { type: Number, default: 0 },
          totalScore: { type: Number, default: 0 },
          averageScore: { type: Number, default: 0 },
        },
      },

      // PvP Mode Stats
      pvp: {
        easy: {
          gamesPlayed: { type: Number, default: 0 },
          wins: { type: Number, default: 0 },
          losses: { type: Number, default: 0 },
          draws: { type: Number, default: 0 },
          winRate: { type: Number, default: 0 }, // Percentage
          currentStreak: { type: Number, default: 0 }, // Win streak
          bestStreak: { type: Number, default: 0 },
        },
        medium: {
          gamesPlayed: { type: Number, default: 0 },
          wins: { type: Number, default: 0 },
          losses: { type: Number, default: 0 },
          draws: { type: Number, default: 0 },
          winRate: { type: Number, default: 0 },
          currentStreak: { type: Number, default: 0 },
          bestStreak: { type: Number, default: 0 },
        },
        hard: {
          gamesPlayed: { type: Number, default: 0 },
          wins: { type: Number, default: 0 },
          losses: { type: Number, default: 0 },
          draws: { type: Number, default: 0 },
          winRate: { type: Number, default: 0 },
          currentStreak: { type: Number, default: 0 },
          bestStreak: { type: Number, default: 0 },
        },
      },

      // ✅ Overall Stats (all difficulties combined)
      overall: {
        totalGames: { type: Number, default: 0 },
        totalWins: { type: Number, default: 0 },
        totalLosses: { type: Number, default: 0 },
        totalDraws: { type: Number, default: 0 },
        overallWinRate: { type: Number, default: 0 },
      },
    },

    // ✅ NEW: Game Preferences
    preferences: {
      defaultDifficulty: {
        type: String,
        enum: ["easy", "medium", "hard"],
        default: "medium",
      },
      defaultTimer: {
        type: Number,
        enum: [30, 60, 90],
        default: 60,
      },
      defaultSymbols: {
        type: [String],
        default: ["sum", "difference", "product", "quotient"],
      },
      soundEnabled: {
        type: Boolean,
        default: true,
      },
      notificationsEnabled: {
        type: Boolean,
        default: true,
      },
    },

    fcmToken: {
      type: String,
      required: false,
    },

    accountStatus: {
      state: {
        type: String,
        enum: ["active", "inactive", "blocked"],
        default: "active",
      },
      reason: {
        type: String,
        default: "Active User",
      },
      changedAt: {
        type: Date,
        default: Date.now,
      },
      lastActiveAt: {
        type: Date,
        default: Date.now,
      },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ================================
// PRE-SAVE HOOKS
// ================================

// Hash password before saving
playerSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// ================================
// INSTANCE METHODS
// ================================

// Compare password
playerSchema.methods.comparePassword = function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// ✅ NEW: Update PvP stats after a game
playerSchema.methods.updatePvPStats = function (difficulty, won, draw = false) {
  const diffStats = this.stats.pvp[difficulty];

  // Increment games played
  diffStats.gamesPlayed++;

  // Update win/loss/draw
  if (draw) {
    diffStats.draws++;
  } else if (won) {
    diffStats.wins++;
    diffStats.currentStreak++;
    if (diffStats.currentStreak > diffStats.bestStreak) {
      diffStats.bestStreak = diffStats.currentStreak;
    }
  } else {
    diffStats.losses++;
    diffStats.currentStreak = 0; // Reset streak on loss
  }

  // Calculate win rate
  if (diffStats.gamesPlayed > 0) {
    diffStats.winRate = Math.round(
      (diffStats.wins / diffStats.gamesPlayed) * 100
    );
  }

  // Update overall stats
  this.stats.overall.totalGames++;
  if (draw) {
    this.stats.overall.totalDraws++;
  } else if (won) {
    this.stats.overall.totalWins++;
  } else {
    this.stats.overall.totalLosses++;
  }

  // Calculate overall win rate
  if (this.stats.overall.totalGames > 0) {
    this.stats.overall.overallWinRate = Math.round(
      (this.stats.overall.totalWins / this.stats.overall.totalGames) * 100
    );
  }

  return this.save();
};

// ✅ NEW: Update practice stats after a game
playerSchema.methods.updatePracticeStats = function (difficulty, score) {
  const diffStats = this.stats.practice[difficulty];

  // Increment games played
  diffStats.gamesPlayed++;

  // Update high score
  if (score > diffStats.highScore) {
    diffStats.highScore = score;
  }

  // Update total and average score
  diffStats.totalScore += score;
  diffStats.averageScore = Math.round(
    diffStats.totalScore / diffStats.gamesPlayed
  );

  return this.save();
};

// ✅ NEW: Get player's current rating for a specific mode
playerSchema.methods.getRating = function (mode, difficulty) {
  return this.pr[mode][difficulty];
};

// ✅ NEW: Update player's rating
playerSchema.methods.updateRating = function (mode, difficulty, delta) {
  this.pr[mode][difficulty] += delta;

  // Ensure rating doesn't go below 0
  if (this.pr[mode][difficulty] < 0) {
    this.pr[mode][difficulty] = 0;
  }

  return this.save();
};

// ✅ NEW: Get player's stats for matchmaking
playerSchema.methods.getMatchmakingData = function () {
  return {
    id: this._id,
    username: this.username,
    rating: this.pr.pvp[this.preferences.defaultDifficulty],
    diff: this.preferences.defaultDifficulty,
    timer: this.preferences.defaultTimer,
    symbol: this.preferences.defaultSymbols,
    email: this.email,
  };
};

// ✅ NEW: Get player profile summary
playerSchema.methods.getProfileSummary = function () {
  return {
    id: this._id,
    username: this.username,
    email: this.email,
    profileImage: this.profileImage,
    country: this.country,
    ratings: {
      practice: this.pr.practice,
      pvp: this.pr.pvp,
    },
    stats: {
      overall: this.stats.overall,
      pvpByDifficulty: {
        easy: this.stats.pvp.easy,
        medium: this.stats.pvp.medium,
        hard: this.stats.pvp.hard,
      },
    },
    preferences: this.preferences,
    accountStatus: this.accountStatus.state,
    memberSince: this.createdAt,
  };
};

// ✅ NEW: Update last active timestamp
playerSchema.methods.updateLastActive = function () {
  this.accountStatus.lastActiveAt = new Date();
  return this.save();
};

// ================================
// VIRTUAL PROPERTIES
// ================================

// ✅ Virtual: Total PvP games played (all difficulties)
playerSchema.virtual("totalPvPGames").get(function () {
  return (
    this.stats.pvp.easy.gamesPlayed +
    this.stats.pvp.medium.gamesPlayed +
    this.stats.pvp.hard.gamesPlayed
  );
});

// ✅ Virtual: Total practice games played (all difficulties)
playerSchema.virtual("totalPracticeGames").get(function () {
  return (
    this.stats.practice.easy.gamesPlayed +
    this.stats.practice.medium.gamesPlayed +
    this.stats.practice.hard.gamesPlayed
  );
});

// ✅ Virtual: Full name
playerSchema.virtual("fullName").get(function () {
  return (
    `${this.firstName || ""} ${this.lastName || ""}`.trim() || this.username
  );
});

// ================================
// STATIC METHODS
// ================================

// ✅ NEW: Find top players by rating
playerSchema.statics.getLeaderboard = function (mode, difficulty, limit = 10) {
  const sortField = `pr.${mode}.${difficulty}`;
  return this.find({ "accountStatus.state": "active" })
    .sort({ [sortField]: -1 })
    .limit(limit)
    .select("username profileImage pr stats country");
};

// ✅ NEW: Find players in rating range
playerSchema.statics.findByRatingRange = function (
  mode,
  difficulty,
  minRating,
  maxRating
) {
  const ratingField = `pr.${mode}.${difficulty}`;
  return this.find({
    [ratingField]: { $gte: minRating, $lte: maxRating },
    "accountStatus.state": "active",
  });
};

// ✅ NEW: Get player statistics
playerSchema.statics.getGlobalStats = async function () {
  const totalPlayers = await this.countDocuments();
  const activePlayers = await this.countDocuments({
    "accountStatus.state": "active",
  });

  const stats = await this.aggregate([
    { $match: { "accountStatus.state": "active" } },
    {
      $group: {
        _id: null,
        totalGames: { $sum: "$stats.overall.totalGames" },
        totalWins: { $sum: "$stats.overall.totalWins" },
        totalLosses: { $sum: "$stats.overall.totalLosses" },
        avgRatingEasy: { $avg: "$pr.pvp.easy" },
        avgRatingMedium: { $avg: "$pr.pvp.medium" },
        avgRatingHard: { $avg: "$pr.pvp.hard" },
      },
    },
  ]);

  return {
    totalPlayers,
    activePlayers,
    ...(stats[0] || {}),
  };
};

// ================================
// INDEXES
// ================================

playerSchema.index({ username: 1 });
playerSchema.index({ email: 1 });
playerSchema.index({ "pr.pvp.easy": -1 });
playerSchema.index({ "pr.pvp.medium": -1 });
playerSchema.index({ "pr.pvp.hard": -1 });
playerSchema.index({ "accountStatus.state": 1 });
playerSchema.index({ "accountStatus.lastActiveAt": -1 });

module.exports = mongoose.model("Player", playerSchema);
