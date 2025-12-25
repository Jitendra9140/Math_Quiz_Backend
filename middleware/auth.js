const jwt = require("jsonwebtoken");
const Player = require("../models/Player");

module.exports = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    // 1️⃣ Verify token
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // 2️⃣ Fetch user
    const player = await Player.findById(payload.id).select("-password");

    if (!player) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // BLOCKED CHECK
    const status = player.accountStatus?.state;


    if (status === "blocked") {
      return res.status(403).json({
        success: false,
        message: "Your account has been blocked permanently.",
      });
    }

    // 3️⃣ Attach user to request
    req.user = player;

    next();
  } catch (err) {
    console.error("Auth error:", err);
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};
