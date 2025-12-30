// services/QuestionService.js
const { getQuestions } = require("../loadQuestion");

class QuestionService {
  constructor() {
    this.questionCache = new Map(); // Cache: difficulty_level -> questions[]
    this.symbolCache = new Map(); // Cache: difficulty_level_symbols -> questions[]
    this.totalQuestionsLoaded = 0;
    this.preloadQuestions();
  }

  preloadQuestions() {
    console.log("[Startup] Preloading questions from Excel...");
    try {
      const data = getQuestions();
      this.totalQuestionsLoaded = data.length;

      // Build primary cache (difficulty + level)
      const cache = new Map();
      data.forEach((question) => {
        const key = `${question.difficulty}_${question.finalLevel}`;
        if (!cache.has(key)) {
          cache.set(key, []);
        }
        cache.get(key).push(question);
      });

      this.questionCache = cache;

      // Build statistics
      const stats = {
        byDifficulty: {},
        byFinalLevel: {},
        total: data.length,
      };

      data.forEach((q) => {
        stats.byDifficulty[q.difficulty] =
          (stats.byDifficulty[q.difficulty] || 0) + 1;
        stats.byFinalLevel[q.finalLevel] =
          (stats.byFinalLevel[q.finalLevel] || 0) + 1;
      });

      console.log(`[Startup] ✅ Loaded ${stats.total} questions`);
      console.log("[Startup] By difficulty:", stats.byDifficulty);
      console.log("[Startup] By level:", stats.byFinalLevel);
    } catch (error) {
      console.error("[Startup] ❌ Error preloading questions:", error);
    }
  }

  determineQuestionLevel(playerRating, difficulty) {
    if (playerRating < 800) return 1;
    else if (playerRating < 1200) return 2;
    else if (playerRating < 1600) return difficulty === "easy" ? 2 : 3;
    else if (playerRating < 2000) return difficulty === "hard" ? 4 : 3;
    else {
      if (difficulty === "medium") return 4;
      if (difficulty === "hard") return 5;
      return 3;
    }
  }

  getQuestionLevelFromQM(qm) {
    const qmRanges = [
      { level: 1, start: 0, end: 5 },
      { level: 2, start: 6, end: 9 },
      { level: 3, start: 10, end: 13 },
      { level: 4, start: 14, end: 17 },
      { level: 5, start: 18, end: 21 },
      { level: 6, start: 22, end: 25 },
      { level: 7, start: 26, end: 29 },
      { level: 8, start: 30, end: 33 },
      { level: 9, start: 34, end: 37 },
      { level: 10, start: 38, end: 45 },
    ];

    for (const range of qmRanges) {
      if (qm >= range.start && qm <= range.end) {
        return range.level;
      }
    }

    return 10;
  }

  determineFinalQuestionLevel(playerRating, difficulty, qm = null) {
    if (qm !== null && qm !== undefined && qm >= 0) {
      const qmLevel = this.getQuestionLevelFromQM(qm);
      return qmLevel;
    }

    const ratingLevel = this.determineQuestionLevel(playerRating, difficulty);
    return ratingLevel;
  }

  getInitialQuestionMeter(player1Rating, player2Rating) {
    const lowerRating = Math.min(player1Rating, player2Rating);

    if (lowerRating < 800) return 2;
    if (lowerRating < 1200) return 5;
    if (lowerRating < 1600) return 8;
    if (lowerRating < 2000) return 12;
    return 15;
  }

  generateQuestion(difficulty, symbols, playerRating, qm = null) {
    try {
      const targetFinalLevel = this.determineFinalQuestionLevel(
        playerRating,
        difficulty,
        qm
      );

      // Try symbol-specific cache first
      const symbolKey = symbols
        ? `${difficulty}_${targetFinalLevel}_${JSON.stringify(symbols)}`
        : null;
      if (symbolKey && this.symbolCache.has(symbolKey)) {
        const cachedPool = this.symbolCache.get(symbolKey);
        if (cachedPool.length > 0) {
          const question =
            cachedPool[Math.floor(Math.random() * cachedPool.length)];
          return { ...question, qm };
        }
      }

      // Get from primary cache
      const cacheKey = `${difficulty}_${targetFinalLevel}`;
      let pool = this.questionCache.get(cacheKey) || [];

      // Fallback to full load if cache empty
      if (pool.length === 0) {
        console.log(
          `⚠️ No questions found for ${cacheKey}, falling back to full load`
        );
        const allQs = getQuestions();
        pool = allQs.filter(
          (q) =>
            q.difficulty === difficulty && q.finalLevel === targetFinalLevel
        );
      }

      // Filter by symbols if specified
      if (symbols && symbols.length > 0) {
        const symbolList = Array.isArray(symbols)
          ? symbols.map((s) => s.toLowerCase().trim())
          : [symbols.toLowerCase().trim()];

        pool = pool.filter((q) => {
          if (!q.symbol) return false;
          const qSymbols = q.symbol
            .split(",")
            .map((s) => s.trim().toLowerCase());
          return symbolList.some((sym) => qSymbols.includes(sym));
        });

        // Cache the symbol-filtered results
        if (symbolKey && pool.length > 0) {
          this.symbolCache.set(symbolKey, pool);
        }
      }

      // Validate pool
      if (pool.length === 0) {
        throw new Error(
          `No questions available for difficulty: ${difficulty}, level: ${targetFinalLevel}, symbols: ${JSON.stringify(
            symbols
          )}`
        );
      }

      // Select random question
      const question = pool[Math.floor(Math.random() * pool.length)];
      return { ...question, qm };
    } catch (error) {
      console.error("❌ Error generating question:", error);
      throw error;
    }
  }

  calculateQMChange(isCorrect, playerRating, questionFinalLevel) {
    const tiers = [
      { max: 400, thresh: 1 },
      { max: 800, thresh: 2 },
      { max: 1200, thresh: 2 },
      { max: 1600, thresh: 3 },
      { max: 2000, thresh: 4 },
      { max: Infinity, thresh: 5 },
    ];

    for (const tier of tiers) {
      if (playerRating <= tier.max) {
        return questionFinalLevel <= tier.thresh
          ? isCorrect
            ? 2
            : -1
          : isCorrect
          ? 1
          : -1;
      }
    }

    return isCorrect ? 1 : -1;
  }

  calculateScore(currentScore, isCorrect, streak) {
    if (!isCorrect) return currentScore;

    if (streak <= 2) return currentScore + 1;
    if (streak === 3) return currentScore + 3;
    if (streak === 5) return currentScore + 5;
    if (streak === 10) return currentScore + 10;
    if (streak % 10 === 0) return currentScore + 10;

    return currentScore + 1;
  }

  generateQuestions(count, difficulty = null, category = null) {
    const questions = [];
    const defaultSymbols = ["sum", "difference", "product", "quotient"];

    for (let i = 0; i < count; i++) {
      try {
        const question = this.generateQuestion(
          difficulty || "medium",
          defaultSymbols,
          1200,
          null
        );
        questions.push(question);
      } catch (error) {
        console.error(`❌ Error generating question ${i + 1}:`, error);
      }
    }

    return questions;
  }

  checkAnswer(question, givenAnswer) {
    const correctAnswer = String(question.answer).trim();
    const userAnswer = String(givenAnswer).trim();
    return userAnswer === correctAnswer;
  }

  // ✅ NEW: Get cache statistics
  getCacheStatistics() {
    const cacheStats = {
      totalQuestionsLoaded: this.totalQuestionsLoaded,
      primaryCacheEntries: this.questionCache.size,
      symbolCacheEntries: this.symbolCache.size,
      byDifficulty: {},
    };

    // Count questions per difficulty
    for (const [key, questions] of this.questionCache) {
      const [difficulty] = key.split("_");
      if (!cacheStats.byDifficulty[difficulty]) {
        cacheStats.byDifficulty[difficulty] = 0;
      }
      cacheStats.byDifficulty[difficulty] += questions.length;
    }

    return cacheStats;
  }

  // ✅ NEW: Clear symbol cache (frees memory)
  clearSymbolCache() {
    const size = this.symbolCache.size;
    this.symbolCache.clear();
    console.log(`🧹 Cleared symbol cache (${size} entries)`);
  }

  // ✅ NEW: Validate question pool availability
  validateQuestionAvailability(difficulty, level, symbols = null) {
    const cacheKey = `${difficulty}_${level}`;
    let pool = this.questionCache.get(cacheKey) || [];

    if (symbols && symbols.length > 0) {
      const symbolList = Array.isArray(symbols)
        ? symbols.map((s) => s.toLowerCase().trim())
        : [symbols.toLowerCase().trim()];

      pool = pool.filter((q) => {
        if (!q.symbol) return false;
        const qSymbols = q.symbol.split(",").map((s) => s.trim().toLowerCase());
        return symbolList.some((sym) => qSymbols.includes(sym));
      });
    }

    return {
      available: pool.length > 0,
      count: pool.length,
      difficulty,
      level,
      symbols,
    };
  }

  // ✅ NEW: Get question distribution
  getQuestionDistribution() {
    const distribution = {
      byDifficulty: {},
      byLevel: {},
      total: 0,
    };

    for (const [key, questions] of this.questionCache) {
      const [difficulty, level] = key.split("_");

      if (!distribution.byDifficulty[difficulty]) {
        distribution.byDifficulty[difficulty] = {};
      }

      distribution.byDifficulty[difficulty][level] = questions.length;

      if (!distribution.byLevel[level]) {
        distribution.byLevel[level] = 0;
      }
      distribution.byLevel[level] += questions.length;

      distribution.total += questions.length;
    }

    return distribution;
  }
}

module.exports = { QuestionService };