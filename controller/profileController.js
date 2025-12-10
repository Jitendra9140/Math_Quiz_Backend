const Player = require("../models/Player");
const fs = require("fs");
const path = require("path");
// const { uploadToS3, deleteFromS3 } = require("../config/s3Config");

exports.updateProfile = async (req, res) => {
  try {
    console.log("Jitenra")
    const { _id } = req.user;
    const { username, email, country, dateOfBirth, gender } =
      req.body;

    // Find the user
    const user = await Player.findById(_id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if username is already taken by another user
    if (username && username !== user.username) {
      const existingUsername = await Player.findOne({
        username,
        _id: { $ne: _id },
      });
      if (existingUsername) {
        return res.status(400).json({
          success: false,
          message: "Username already taken",
        });
      }
    }

    // Check if email is already taken by another user
    if (email && email !== user.email) {
      const existingEmail = await Player.findOne({
        email,
        _id: { $ne: _id },
      });
      if (existingEmail) {
        return res.status(400).json({
          success: false,
          message: "Email already in use",
        });
      }
    }

    // Handle profile image upload
    let profileImageUrl = user.profileImage;

    if (req.file) {
      // FOR LOCAL STORAGE (TESTING)
      // Delete old profile image if exists
      if (user.profileImage) {
        const oldImagePath = path.join(__dirname, "..", user.profileImage);
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }

      // Store new image path (relative to server root)
      profileImageUrl = `/uploads/profiles/${req.file.filename}`;

      /* FOR AWS S3 (PRODUCTION) - UNCOMMENT WHEN READY
      try {
        // Delete old image from S3 if exists
        if (user.profileImage && user.profileImage.includes('amazonaws.com')) {
          const oldKey = user.profileImage.split('.com/')[1];
          await deleteFromS3(oldKey);
        }

        // Upload new image to S3
        const s3Key = `profiles/${_id}/${Date.now()}-${req.file.originalname}`;
        const s3Result = await uploadToS3(req.file.buffer, s3Key, req.file.mimetype);
        profileImageUrl = s3Result.Location;

        // Delete local file after S3 upload
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
      } catch (s3Error) {
        console.error("S3 upload error:", s3Error);
        return res.status(500).json({
          success: false,
          message: "Failed to upload image to S3"
        });
      }
      */
    }

    // Update user fields
    const updateData = {
      profileImage: profileImageUrl,
    };

    if (username) updateData.username = username;
    if (email) updateData.email = email;
    if (country) updateData.country = country;
    if (dateOfBirth) updateData.dateOfBirth = dateOfBirth;
    if (gender) updateData.gender = gender;
    

    const updatedUser = await Player.findByIdAndUpdate(_id, updateData, {
      new: true,
      runValidators: true,
    }).select("-password");

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user: updatedUser,
    });
  } catch (error) {
    console.error("Error updating profile:", error);

    // Clean up uploaded file if error occurs
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

exports.deleteProfileImage = async (req, res) => {
  try {
    const { _id } = req.user;

    const user = await Player.findById(_id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (!user.profileImage) {
      return res.status(400).json({
        success: false,
        message: "No profile image to delete",
      });
    }

    // FOR LOCAL STORAGE
    const imagePath = path.join(__dirname, "..", user.profileImage);
    if (fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }

    /* FOR AWS S3 - UNCOMMENT WHEN READY
    if (user.profileImage.includes('amazonaws.com')) {
      const s3Key = user.profileImage.split('.com/')[1];
      await deleteFromS3(s3Key);
    }
    */

    user.profileImage = null;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Profile image deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting profile image:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
