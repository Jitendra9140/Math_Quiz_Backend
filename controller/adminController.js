
const Player = require("../models/Player");

exports.blockUser = async (req, res) => {
  try {
    const { userId } = req.query;
    const { reason } = req.body;
    console.log(userId)

    const user = await Player.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    user.accountStatus.state = "blocked";
    user.accountStatus.reason = reason || "Blocked by admin";
    user.accountStatus.changedAt = new Date();

    await user.save();

    return res.status(200).json({
      success: true,
      message: "User blocked successfully",
    });
  } catch (error) {
    console.error("Block error:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.unblockUser = async (req, res) => {
  try {
    console.log(req.query);
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ message: "userId is required" });
    }

    const user = await Player.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // ✅ Update status
    user.accountStatus.state = "active";
    user.accountStatus.reason = null;
    user.accountStatus.changedAt = new Date();

    await user.save();

    return res.json({
      success: true,
      message: "User unblocked successfully",
      status: user.accountStatus.state,
    });
  } catch (error) {
    console.error("Unblock user error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};