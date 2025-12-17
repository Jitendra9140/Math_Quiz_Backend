const Friend = require("../models/Friend");
const Player = require("../models/Player");
const admin = require("../config/firebase");

exports.addFriend = async (req, res) => {
  try {
    const requester = req.user._id; // ✅ from token
    const { recipient } = req.body;

    if (!recipient) {
      return res.status(400).json({
        success: false,
        message: "Recipient is missing",
      });
    }

    if (requester.toString() === recipient) {
      return res.status(400).json({
        success: false,
        message: "You cannot add yourself as friend",
      });
    }

    const existUser = await Player.findById(recipient);
    if (!existUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Already friends?
    const alreadyFriend = await Friend.findOne({
      $or: [
        { requester, recipient, status: "accepted" },
        { requester: recipient, recipient: requester, status: "accepted" },
      ],
    });

    if (alreadyFriend) {
      return res.status(400).json({
        success: false,
        message: "You are already friends",
      });
    }

    // Already requested?
    const alreadyRequested = await Friend.findOne({
      $or: [
        { requester, recipient, status: "pending" },
        { requester: recipient, recipient: requester, status: "pending" },
      ],
    });

    if (alreadyRequested) {
      return res.status(400).json({
        success: false,
        message: "Friend request already exists",
      });
    }

    await Friend.create({
      requester,
      recipient,
      status: "pending",
    });

    // Push notification
    const receiver = await Player.findById(recipient);
    const sender = await Player.findById(requester);

    if (receiver?.fcmToken) {
      await admin.messaging().send({
        token: receiver.fcmToken,
        notification: {
          title: "New Friend Request 🎉",
          body: `${sender.username} sent you a friend request.`,
        },
        data: {
          type: "FRIEND_REQUEST",
          requester: requester.toString(),
          recipient: recipient.toString(),
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: "Friend request sent",
    });
  } catch (error) {
    console.log("error:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


exports.acceptFrndRequest = async (req, res) => {
  try {
    const { requester, recipient } = req.body;

    // check if user is already a dost friend

    const alreadyFrnd = await Friend.findOne({
      $or: [
        { requester, recipient, status: "accepted" },
        { requester: recipient, recipient: requester, status: "accepted" },
      ],
    });

    console.log("alrdyfrnd", alreadyFrnd);

    if (alreadyFrnd) {
      return res.status(400).json({
        success: false,
        message: "You are already friend with the user",
      });
    }

    const response = await Friend.findOneAndUpdate(
      {
        $or: [
          { requester, recipient, status: "pending" },
          { requester: recipient, recipient: requester, status: "pending" },
        ],
      },
      { status: "accepted" },
      { new: true }
    );

    const receiver = await Player.findById(recipient);
    const sender = await Player.findById(requester);

    console.log("receiver sender", receiver, sender);

    if (sender?.fcmToken) {
      const payload = {
        token: sender.fcmToken,
        notification: {
          title: "Friend Request Accepted 🎉",
          body: `${receiver.username} accepted your friend request.`,
        },
        data: {
          type: "FRIEND_REQUEST_ACCEPT",
          requester,
          recipient,
        },
      };

      const notificationres = await admin.messaging().send(payload);
      console.log("Notification sent successfully", notificationres);
    } else {
      console.log("Receiver has no FCM token");
    }

    console.log("response", response);

    return res.status(201).json({
      success: true,
      message: "friend request accepted",
    });
  } catch (error) {
    console.log("error:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.rejectFrndRequest = async (req, res) => {
  try {
    const { requester, recipient } = req.body;

    // check if user is already a dost friend

    const alreadyFrnd = await Friend.findOne({
      $or: [
        { requester, recipient, status: "accepted" },
        { requester: recipient, recipient: requester, status: "accepted" },
      ],
    });

    console.log("alrdyfrnd", alreadyFrnd);

    if (alreadyFrnd) {
      return res.status(400).json({
        success: false,
        message: "You are already friend with the user",
      });
    }

    const response = await Friend.findOneAndUpdate(
      {
        $or: [
          { requester, recipient, status: "pending" },
          { requester: recipient, recipient: requester, status: "pending" },
        ],
      },
      { status: "rejected" },
      { new: true }
    );

    const receiver = await Player.findById(recipient);
    const sender = await Player.findById(requester);

    console.log("receiver sender", receiver, sender);

    if (sender?.fcmToken) {
      const payload = {
        token: sender.fcmToken,
        notification: {
          title: "Friend Request rejected 😞",
          body: `${receiver.username} rejected your friend request.`,
        },
        data: {
          type: "FRIEND_REQUEST_REJECT",
          requester,
          recipient,
        },
      };

      const notificationres = await admin.messaging().send(payload);
      console.log("Notification sent successfully", notificationres);
    } else {
      console.log("Receiver has no FCM token");
    }

    console.log("response", response);
    return res.status(201).json({
      success: true,
      message: "friend request rejected",
    });
  } catch (error) {
    console.log("error:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.searchUser = async (req, res) => {
  const { _id } = req.user;
  const { searchText } = req.body;

  console.error("sertxt:", searchText);
  try {
    //  Find all friend relationships where user is involved
    const friendships = await Friend.find({
      $or: [
        { requester: _id, status: "accepted" },
        { recipient: _id, status: "accepted" },
      ],
    });

    // Collect friend IDs
    const friendIds = friendships.map((f) =>
      f.requester.toString() === _id.toString() ? f.recipient : f.requester
    );

    console.error("frndid:", friendIds);

    //  Build query for users
    const query = {
      _id: { $nin: [...friendIds, _id] }, // exclude self & friends
    };

    if (searchText && searchText.trim() !== "") {
      query.username = { $regex: searchText, $options: "i" }; // case-insensitive match
    }

    //  Fetch users
    const users = await Player.find(query).select(
      "username email gender country"
    );

    console.error("users:", users);

    if (!users || users.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No users found",
      });
    }

    return res.status(200).json({
      success: true,
      users,
    });
  } catch (error) {
    console.error("error:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.userList = async (req, res) => {
  const { _id } = req.user;

  try {
    // Exclude current user
    const query = { _id: { $ne: _id } };

    const users = await Player.find(query).select(
      "username email firstName lastName  gender country profileImage pr"
    );

    // Get friendships
    const friendships = await Friend.find({
      $or: [{ requester: _id }, { recipient: _id }],
    });

    // Friendship map
    const friendshipMap = {};
    friendships.forEach((f) => {
      const otherUserId =
        f.requester.toString() === _id.toString()
          ? f.recipient.toString()
          : f.requester.toString();

      friendshipMap[otherUserId] = f.status;
    });

    // Build response
    const userList = users.map((user) => {
      const u = user.toObject();

      // Convert PR object → array
      const prArray = Object.entries(u.pr || {}).map(([mode, levels]) => ({
        mode,
        ...levels,
      }));

      return {
        _id: u._id,
        username: u.username,
        email: u.email,
        firstName:u.firstName,
        lastName:u.lastName,
        gender: u.gender,
        country: u.country,
        profileImage: u.profileImage,
        pr: prArray,
        friendshipStatus: friendshipMap[u._id.toString()] || "none",
      };
    });

    return res.status(200).json({
      success: true,
      users: userList,
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

exports.friendRequestList = async (req, res) => {
  const { _id } = req.user;

  try {
    const requests = await Friend.find({
      recipient: _id,
      status: "pending",
    })
      .populate("requester", "username email gender country")
      .sort({ createdAt: -1 }); // newest first

    // if (!requests || requests.length === 0) {
    //   return res.status(404).json({
    //     success: false,
    //     message: "No friend requests received",
    //   });
    // }

    return res.status(200).json({
      success: true,
      total: requests.length,
      requests,
    });
  } catch (error) {
    console.error("Error fetching friend requests:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.deleteFriendship = async (req, res) => {
  const { _id } = req.user; // logged-in user
  const { friendshipId } = req.params; // friendship _id from route params

  try {
    //: Find the friendship by ID
    const friendship = await Friend.findById(friendshipId);

    if (!friendship) {
      return res.status(404).json({
        success: false,
        message: "Friendship not found",
      });
    }

    //  Ensure the logged-in user is part of the friendship - in future
    // if (
    //   friendship.requester.toString() !== _id.toString() &&
    //   friendship.recipient.toString() !== _id.toString()
    // ) {
    //   return res.status(403).json({
    //     success: false,
    //     message: "You are not authorized to delete this friendship",
    //   });
    // }

    // Step 3: Delete the record
    await friendship.deleteOne();

    return res.status(200).json({
      success: true,
      message: "Friendship deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting friendship:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

exports.deleteAllFriendship = async (req, res) => {
  try {
   
    await Friend.deleteMany({});

    return res.status(200).json({
      success: true,
      message: "Friendship deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting friendship:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
