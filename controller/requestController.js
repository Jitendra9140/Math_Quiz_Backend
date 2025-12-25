const Player = require("../models/Player");
const MatchRequest = require("../models/MatchRequest");
const PVPGame = require("../models/PVPGame");
const admin = require("../config/firebase");

/* ---------------------- Utils ---------------------- */
function getRatingField(mode = "pvp", difficulty = "medium") {
  const safeMode = ["practice", "pvp"].includes(mode) ? mode : "pvp";
  const safeDiff = ["easy", "medium", "hard"].includes(difficulty)
    ? difficulty
    : "medium";

  return `pr.${safeMode}.${safeDiff}`;
}

/* ---------------------- Find Near Users ---------------------- */
exports.nearUsers = async (req, res) => {
  try {
    const {
      mode = "pvp",
      difficulty = "medium",
      delta = 200,
      score,
    } = req.query;
    const fieldPath = getRatingField(mode, difficulty);

    let targetScore = Number(score);

    if (!targetScore || Number.isNaN(targetScore)) {
      targetScore = req.user?.pr?.[mode]?.[difficulty];
    }

    if (!targetScore) {
      return res.status(400).json({
        success: false,
        message:
          "Unable to determine target score; provide ?score= or ensure user has PR set.",
      });
    }

    const minScore = targetScore - Number(delta);
    const maxScore = targetScore + Number(delta);

    const users = await Player.find({
      _id: { $ne: req.user._id },
      [fieldPath]: { $gte: minScore, $lte: maxScore },
    })
      .select(`_id username email ${fieldPath}`)
      .limit(50)
      .lean();

    const mapped = users.map((u) => ({
      id: u._id,
      username: u.username,
      email: u.email,
      score: u.pr?.[mode]?.[difficulty] || null,
    }));

    return res.json({
      success: true,
      targetScore,
      mode,
      difficulty,
      delta: Number(delta),
      users: mapped,
    });
  } catch (err) {
    console.error("nearUsers error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ---------------------- Send Match Request ---------------------- */
exports.sendMatchRequest = async (req, res) => {
  try {
    const {
      recipientId,
      mode = "pvp",
      difficulty = "medium",
      message,
    } = req.body;

    if (!recipientId) {
      return res.status(400).json({
        success: false,
        message: "recipientId is required",
      });
    }

    if (String(recipientId) === String(req.user._id)) {
      return res.status(400).json({
        success: false,
        message: "You cannot send a match request to yourself",
      });
    }

    const recipient = await Player.findById(recipientId);
    if (!recipient) {
      return res.status(404).json({
        success: false,
        message: "Recipient not found",
      });
    }

    // Prevent duplicate pending request
    const existing = await MatchRequest.findOne({
      status: "pending",
      $or: [
        { requester: req.user._id, recipient: recipientId },
        { requester: recipientId, recipient: req.user._id },
      ],
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: "There is already a pending match request between you two",
      });
    }

    const expiresAt = new Date(Date.now() + 30 * 1000); // 30 sec

    const reqDoc = await MatchRequest.create({
      requester: req.user._id,
      recipient: recipientId,
      mode,
      difficulty,
      message,
      status: "pending",
      expiresAt,
    });

    if (recipient?.fcmToken) {
      try {
        await admin.messaging().send({
          token: recipient.fcmToken,
          notification: {
            title: "Match Request",
            body: `${req.user.username} challenged you to a ${mode.toUpperCase()} (${difficulty}) match`,
          },
          data: {
            type: "MATCH_REQUEST",
            requestId: String(reqDoc._id),
            requesterId: String(req.user._id),
            status: "pending",
          },
        });
      } catch (e) {
        console.warn("FCM send error:", e?.message);
      }
    }

    const requesterSelf = await Player.findById(req.user._id);
    if (requesterSelf?.fcmToken) {
      try {
        await admin.messaging().send({
          token: requesterSelf.fcmToken,
          notification: {
            title: "Match Request Sent",
            body: `Waiting for ${recipient.username} to respond`,
          },
          data: {
            type: "MATCH_PENDING",
            requestId: String(reqDoc._id),
            status: "pending",
          },
        });
      } catch (e) {
        console.warn("FCM send error:", e?.message);
      }
    }

    const io = req.app.get("io");
    if (io) {
      io.emit("match-request", {
        requestId: reqDoc._id,
        from: req.user._id,
        to: recipientId,
        mode,
        difficulty,
        status: "pending",
      });
    }

    return res.status(201).json({
      success: true,
      message: "Match request sent",
      request: reqDoc,
    });
  } catch (err) {
    console.error("sendMatchRequest error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ---------------------- Respond Match Request ---------------------- */
exports.respondMatchRequest = async (req, res) => {
  try {
    const { requestId, accepted } = req.body;

    if (!requestId || typeof accepted === "undefined") {
      return res.status(400).json({
        success: false,
        message: "requestId and accepted are required",
      });
    }

    const reqDoc = await MatchRequest.findById(requestId);
    if (!reqDoc || reqDoc.status !== "pending") {
      return res.status(404).json({
        success: false,
        message: "Pending match request not found",
      });
    }

    if (String(reqDoc.recipient) !== String(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: "Only the recipient can respond to this request",
      });
    }

    // Expired?
    if (reqDoc.expiresAt && reqDoc.expiresAt < new Date()) {
      reqDoc.status = "expired";
      await reqDoc.save();
      return res.status(410).json({
        success: false,
        message: "Match request expired",
      });
    }

    reqDoc.status = accepted ? "accepted" : "rejected";
    await reqDoc.save();

    const io = req.app.get("io");
    if (io) {
      const status = accepted ? "accepted" : "rejected";
      io.emit(accepted ? "match-request-accepted" : "match-request-rejected", {
        requestId: reqDoc._id,
        requester: reqDoc.requester,
        recipient: reqDoc.recipient,
        status,
      });
      io.emit("match-request", {
        requestId: reqDoc._id,
        from: reqDoc.requester,
        to: reqDoc.recipient,
        status,
      });
    }

    const requester = await Player.findById(reqDoc.requester);
    if (requester?.fcmToken) {
      try {
        await admin.messaging().send({
          token: requester.fcmToken,
          notification: {
            title: accepted ? "Match Accepted" : "Match Declined",
            body: `${req.user.username} ${
              accepted ? "accepted" : "declined"
            } your match request`,
          },
          data: {
            type: accepted ? "MATCH_ACCEPTED" : "MATCH_DECLINED",
            requestId: String(reqDoc._id),
            status: accepted ? "accepted" : "rejected",
          },
        });
      } catch (e) {}
    }

    return res.json({
      success: true,
      message: accepted ? "Match request accepted" : "Match request rejected",
      request: reqDoc,
    });
  } catch (err) {
    console.error("respondMatchRequest error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ---------------------- List Requests ---------------------- */
exports.listRequests = async (req, res) => {
  try {
    const { type = "incoming" } = req.query;
    const filter =
      type === "outgoing"
        ? { requester: req.user._id }
        : { recipient: req.user._id };
     
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;    
    const requests = await MatchRequest.find({...filter, createdAt:{ $gte: oneDayAgo }})
      .sort({ createdAt: -1 })
      .populate("requester", "username")
      .populate("recipient", "username")
      .lean();

    return res.json({ success: true, requests });
  } catch (err) {
    console.error("listRequests error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ---------------------- Record Game Result ---------------------- */
exports.recordResult = async (req, res) => {
  try {
    const {
      player1Id,
      player2Id,
      scorePlayer1,
      scorePlayer2,
      durationSeconds,
    } = req.body;

    if (
      !player1Id ||
      !player2Id ||
      typeof scorePlayer1 !== "number" ||
      typeof scorePlayer2 !== "number"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "player1Id, player2Id, scorePlayer1, scorePlayer2 are required",
      });
    }

    let result = "Draw";
    let winner = null;

    if (scorePlayer1 > scorePlayer2) {
      result = "Player1Won";
      winner = player1Id;
    } else if (scorePlayer2 > scorePlayer1) {
      result = "Player2Won";
      winner = player2Id;
    }

    const game = await PVPGame.create({
      player1: player1Id,
      player2: player2Id,
      scorePlayer1,
      scorePlayer2,
      winner,
      result,
      gameDuration: durationSeconds || 0,
    });

    return res.status(201).json({
      success: true,
      message: "Result recorded",
      game,
    });
  } catch (err) {
    console.error("recordResult error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ---------------------- Get Game By ID ---------------------- */
exports.getGameResult = async (req, res) => {
  try {
    const { id} = req.params;

    const game = await PVPGame.findById(id)
      .populate("player1", "username")
      .populate("player2", "username")
      .lean();

    if (!game)
      return res
        .status(404)
        .json({ success: false, message: "Game not found" });

    return res.json({ success: true, game });
  } catch (err) {
    console.error("getGameResult error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ---------------------- List Match Results ---------------------- */
exports.listResults = async (req, res) => {
  try {
    const { userId, limit = 10 } = req.query;

    const filter = userId
      ? { $or: [{ player1: userId }, { player2: userId }] }
      : {};

    const games = await PVPGame.find(filter)
      .sort({ playedAt: -1 })
      .limit(Number(limit))
      .populate("player1", "username")
      .populate("player2", "username")
      .lean();

    return res.json({ success: true, games });
  } catch (err) {
    console.error("listResults error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};
