const Player = require("../models/Player");
const { uploadToS3, deleteFromS3 } = require("../config/s3Config");


const getS3KeyFromUrl = (url) => {
  if (!url) return null;
  const parts = url.split(".amazonaws.com/");
  return parts.length > 1 ? parts[1] : null;
};

exports.updateProfile = async (req, res) => {
  try {
    const { _id } = req.user;
    const { dateOfBirth, gender,firstName,lastName ,country } = req.body;

    const user = await Player.findById(_id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }


    /* ---------- Handle profile image ---------- */
    let profileImage = user.profileImage;

    if (req.file) {
      // Upload new image to S3
      const key = `profiles/${Date.now()}-${req.file.originalname}`;

      const { Location } = await uploadToS3(
        req.file.buffer,
        key,
        req.file.mimetype
      );

      // Delete old image AFTER successful upload
      if (user.profileImage) {
        const oldKey = getS3KeyFromUrl(user.profileImage);

        if (oldKey) {
          await deleteFromS3(oldKey);
        }
      }

      profileImage = Location;
    }

    /* ---------- Update user ---------- */
    const updatedUser = await Player.findByIdAndUpdate(
      _id,
      {
        ...(dateOfBirth && { dateOfBirth }),
        ...(gender && { gender }),
        ...(firstName && { firstName }),
        ...(lastName && { lastName }),
        ...(country && { country }),
        profileImage,
      },
      { new: true, runValidators: true }
    ).select("-password");

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user: updatedUser,
    });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
