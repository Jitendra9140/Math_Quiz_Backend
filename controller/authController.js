const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const Player = require("../models/Player");
const { sendEmail } = require("../middleware/mail");
const otpStore = new Map();
const passOtpStore = new Map();

function generateOTP() {
  return crypto.randomInt(100000, 999999).toString();
}

const { deleteFromS3 } = require("../config/s3Config");

const getS3KeyFromUrl = (url) => {
  if (!url) return null;
  const parts = url.split(".amazonaws.com/");
  return parts.length > 1 ? parts[1] : null;
};

// POST /api/auth/signup
exports.signup = async (req, res) => {
  const { username, email, password, country, dateOfBirth, gender } = req.body;

  try {
    if (
      !username ||!email ||!password) {
      return res.status(400).json({ message: "Email,Username and Password is required." });
    }

    if (password.length < 6) {
      return res.status(400).json({
        message: "Password must be at least 6 characters long",
      });
    }
    // 1. Check for existing email or username
    let existing = await Player.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: "Email already in use" });
    }
    existing = await Player.findOne({ username });
    if (existing) {
      return res.status(400).json({ message: "Username already taken" });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({
        message:
          "Password is required and it should be at least 6 characters long",
      });
    }


    // 2. Generate and store OTP with attempt tracking
    const otp = generateOTP();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
    console.log(otp)
    otpStore.set(email.trim(), {
      otp,
      expiresAt,
      attempts: 0,
      lockedUntil: null,
      userData: { username, email, password, country, dateOfBirth, gender },
    });

    // 3. Send OTP via email
    await sendEmail({
      to: email,
      subject: "OTP to verify your email - Clumpcoder",
      text: `Your OTP code is ${otp}. It is valid for 5 minutes.`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Email Verification</h2>
          <p>Your OTP code is: <strong style="font-size: 24px; color: #4CAF50;">${otp}</strong></p>
          <p>This code is valid for 5 minutes.</p>
          <p>If you didn't request this, please ignore this email.</p>
        </div>
      `,
    });

    res.status(200).json({
      message:
        "OTP sent to your email. Please verify to complete registration.",
      success: true,
      email: email,
      otp:otp
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// POST /api/auth/verify-signup-otp
exports.verifySignupOTP = async (req, res) => {
  const { email, otp } = req.body;
  if (!email || otp === undefined || otp === null) {
    return res
      .status(400)
      .json({ success: false, message: "Email and OTP are required." });
  }

  try {
    const key = email.trim();
    const record = otpStore.get(key);

    if (!record) {
      return res.status(400).json({
        success: false,
        message: "No OTP found. Please request registration again.",
      });
    }

    // Configurable constants
    const MAX_ATTEMPTS = 3; // number of allowed failed attempts
    const LOCK_DURATION_MS = 60 * 60 * 1000; // 1 hour

    // Check if account is locked
    if (record.lockedUntil && Date.now() < record.lockedUntil) {
      const remainingMinutes = Math.ceil(
        (record.lockedUntil - Date.now()) / 60000
      );
      return res.status(429).json({
        success: false,
        message: `You have exceeded the number of attempts. Please try again after ${remainingMinutes} minute${
          remainingMinutes > 1 ? "s" : ""
        }.`,
      });
    }

    // Check if OTP expired
    if (Date.now() > record.expiresAt) {
      otpStore.delete(key);
      return res.status(400).json({
        success: false,
        message: "OTP has expired. Please request a new one.",
      });
    }

    // Normalize OTPs so type/whitespace won't cause false mismatches
    const providedOtp = String(otp).trim();
    const expectedOtp = String(record.otp).trim();

    console.log("providedOtp:", providedOtp, "expectedOtp:", expectedOtp);

    // Check OTP
    if (providedOtp !== expectedOtp) {
      record.attempts = (record.attempts || 0) + 1;

      // Lock after MAX_ATTEMPTS failed attempts
      if (record.attempts >= MAX_ATTEMPTS) {
        record.lockedUntil = Date.now() + LOCK_DURATION_MS;
        // persist update to store if needed (Map holds object reference, but re-set for safety)
        otpStore.set(key, record);

        return res.status(429).json({
          success: false,
          message: `You have exceeded the number of attempts. Please try again after ${Math.ceil(
            LOCK_DURATION_MS / 60000
          )} minute(s).`,
        });
      }

      // persist update to store
      otpStore.set(key, record);

      const attemptsLeft = MAX_ATTEMPTS - record.attempts;
      return res.status(400).json({
        success: false,
        message: `Incorrect OTP. Please try again. ${attemptsLeft} attempt(s) remaining.`,
      });
    }

    // OTP is correct - create the player account
    const { userData } = record;
    const player = new Player({
      username: userData.username,
      email: userData.email,
      password: userData.password,
      country: userData.country,
      dateOfBirth: userData.dateOfBirth,
      gender: userData.gender,
    });

    await player.save();

    // Clear OTP record
    otpStore.delete(key);

    // Generate JWT token
    const token = jwt.sign({ id: player._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    return res.status(201).json({
      success: true,
      message: "Registration completed successfully",
      token,
      player: {
        id: player._id,
        username: player.username,
        email: player.email,
        country: player.country,
        dateOfBirth: player.dateOfBirth,
        pr: player.pr,
        gender: player.gender,
      },
    });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};

// POST /api/auth/resend-signup-otp
exports.resendSignupOTP = async (req, res) => {
  const { email } = req.body;

  try {
    const record = otpStore.get(email?.trim());

    if (!record) {
      return res.status(400).json({
        success: false,
        message: "No registration request found. Please start signup again.",
      });
    }

    // Check if locked
    if (record.lockedUntil && Date.now() < record.lockedUntil) {
      const remainingTime = Math.ceil(
        (record.lockedUntil - Date.now()) / 60000
      );
      return res.status(429).json({
        success: false,
        message: `Account is locked. Please try again after ${remainingTime} minute(s)`,
      });
    }

    // Generate new OTP
    const otp = generateOTP();
    const expiresAt = Date.now() + 5 * 60 * 1000;
    console.log(otp)

    record.otp = otp;
    record.expiresAt = expiresAt;
    record.attempts = 0; // Reset attempts on resend

    await sendEmail({
      to: email,
      subject: "New OTP for Email Verification - Clumpcoder",
      text: `Your new OTP code is ${otp}. It is valid for 5 minutes.`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Email Verification</h2>
          <p>Your new OTP code is: <strong style="font-size: 24px; color: #4CAF50;">${otp}</strong></p>
          <p>This code is valid for 5 minutes.</p>
        </div>
      `,
    });

    res.status(200).json({
      success: true,
      message: "New OTP sent to your email",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};


// POST /api/auth/login
exports.login = async (req, res) => {
  const { email, password } = req.body;
  try {

    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "Email and password are required." });
    }
    console.log("Login attempt with password:", password); // Debug log

    // 1. Find player by email
    const player = await Player.findOne({ email });
    if (!player) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    console.log("Stored hash in DB:", player.password); // Debug log

    // 2. Compare password using the schema method
    const isMatch = await player.comparePassword(password);
    console.log("Password match result:", isMatch); // Debug log

    // Also try direct bcrypt comparison for debugging
    const directMatch = await bcrypt.compare(password, player.password);
    console.log("Direct bcrypt comparison:", directMatch); // Debug log

    if (!isMatch) {
      console.log("password not matched");
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // 3. Issue JWT
    const token = jwt.sign({ id: player._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    // 4. Respond
    res.json({
      token,
      player: {
        id: player._id,
        username: player.username,
        email: player.email,
        country: player.country,
        dateOfBirth: player.dateOfBirth,
        pr: player.pr,
        gender: player.gender,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};


exports.deleteUserByAdmin = async (req, res) => {
  try {
    const { userId } = req.params;


    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    const user = await Player.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.profileImage) {
      const s3Key = getS3KeyFromUrl(user.profileImage);
      if (s3Key) {
        await deleteFromS3(s3Key);
      }
    }

    await Player.findByIdAndDelete(userId);

    return res.status(200).json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error) {
    console.error("Admin delete user error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};


// POST /api/auth/sendForgotPassOtp
exports.sendForgotPasswordOtp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const user = await Player.findOne({ email: email.trim() });
    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Email does not exist",
      });
    }

    const otp = generateOTP();
    const expiresAt = Date.now() + 5 * 60 * 1000;
    console.log("Forgot Password OTP:", otp);

    passOtpStore.set(email.trim(), {
      otp,
      expiresAt,
      attempts: 0,
      lockedUntil: null,
      verified: false, // Track if OTP has been verified
    });

    await sendEmail({
      to: email,
      subject: "OTP to Reset Password - Clumpcoder",
      text: `Your OTP code is ${otp}. It is valid for 5 minutes.`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Password Reset Request</h2>
          <p>Your OTP code is: <strong style="font-size: 14px; color: #FF5722;">${otp}</strong></p>
          <p>This code is valid for 5 minutes.</p>
          <p>If you didn't request this, please ignore this email.</p>
        </div>
      `,
    });

    res.status(200).json({
      success: true,
      message: "OTP sent to your email",
      email: email,
      otp: otp, // Remove in production
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
};

// POST /api/auth/verfy-forget-otp
// Verify forgot password OTP (separate from password change)
exports.verifyForgotPasswordOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    console.log(req.body)

    if (!email || otp === undefined || otp === null) {
      return res.status(400).json({
        success: false,
        message: "Email and OTP are required",
      });
    }

    const key = email.trim();
    const record = passOtpStore.get(key);

    if (!record) {
      return res.status(400).json({
        success: false,
        message: "No OTP found. Please request password reset again.",
      });
    }

    const MAX_ATTEMPTS = 3;
    const LOCK_DURATION_MS = 60 * 60 * 1000; // 1 hour

    // Check if locked
    if (record.lockedUntil && Date.now() < record.lockedUntil) {
      const remainingMinutes = Math.ceil(
        (record.lockedUntil - Date.now()) / 60000
      );
      return res.status(429).json({
        success: false,
        message: `You have exceeded the number of attempts. Please try again after ${remainingMinutes} minute${
          remainingMinutes > 1 ? "s" : ""
        }.`,
      });
    }

    // Check if OTP expired
    if (Date.now() > record.expiresAt) {
      passOtpStore.delete(key);
      return res.status(400).json({
        success: false,
        message: "OTP has expired. Please request a new one.",
      });
    }

    const providedOtp = String(otp).trim();
    const expectedOtp = String(record.otp).trim();

    // Check OTP
    if (providedOtp !== expectedOtp) {
      record.attempts = (record.attempts || 0) + 1;

      if (record.attempts >= MAX_ATTEMPTS) {
        record.lockedUntil = Date.now() + LOCK_DURATION_MS;
        passOtpStore.set(key, record);

        return res.status(429).json({
          success: false,
          message:
            "You have exceeded the number of attempts. Please try again after 1 Hour",
        });
      }

      passOtpStore.set(key, record);
      const attemptsLeft = MAX_ATTEMPTS - record.attempts;

      return res.status(400).json({
        success: false,
        message: `Incorrect OTP. Please try again. ${attemptsLeft} attempt(s) remaining.`,
      });
    }

    // OTP is correct - mark as verified but DON'T delete yet
    record.verified = true;
    record.verifiedAt = Date.now();
    passOtpStore.set(key, record);

    return res.status(200).json({
      success: true,
      message: "OTP verified successfully. You can now reset your password.",
      email: email,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
};

// POST /api/auth/changePass
// Change password (only works after OTP is verified)
exports.changePassword = async (req, res) => {
  try {
    const { email, newPassword } = req.body;

    if (!email || !newPassword || newPassword.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Email and new password are required",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters long",
      });
    }

    const key = email.trim();
    const record = passOtpStore.get(key);

    // Check if OTP was verified
    if (!record || !record.verified) {
      return res.status(403).json({
        success: false,
        message: "Please verify OTP first before changing password",
      });
    }

    // Check if verification is still valid (10 minutes after verification)
    const verificationValidDuration = 10 * 60 * 1000; // 10 minutes
    if (Date.now() - record.verifiedAt > verificationValidDuration) {
      passOtpStore.delete(key);
      return res.status(400).json({
        success: false,
        message: "Verification expired. Please request a new OTP.",
      });
    }

    const user = await Player.findOne({ email: email });
    if (!user) {
      passOtpStore.delete(key);
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    // Clear the OTP record after successful password change
    passOtpStore.delete(key);

    res.status(200).json({
      success: true,
      message:
        "Password updated successfully. You can now login with your new password.",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
};


// POST /api/auth/resend-forget-otp
// Resend OTP for forgot password
exports.resendForgotPasswordOtp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const record = passOtpStore.get(email?.trim());

    if (!record) {
      return res.status(400).json({
        success: false,
        message: "No password reset request found. Please start again.",
      });
    }

    // Check if locked
    if (record.lockedUntil && Date.now() < record.lockedUntil) {
      const remainingTime = Math.ceil(
        (record.lockedUntil - Date.now()) / 60000
      );
      return res.status(429).json({
        success: false,
        message: `Account is locked. Please try again after ${remainingTime} minute(s)`,
      });
    }

    // Generate new OTP
    const otp = generateOTP();
    const expiresAt = Date.now() + 5 * 60 * 1000;
    console.log("Resend Forgot Password OTP:", otp);

    record.otp = otp;
    record.expiresAt = expiresAt;
    record.attempts = 0;
    record.verified = false;

    await sendEmail({
      to: email,
      subject: "New OTP for Password Reset - Clumpcoder",
      text: `Your new OTP code is ${otp}. It is valid for 5 minutes.`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Password Reset</h2>
          <p>Your new OTP code is: <strong style="font-size: 24px; color: #FF5722;">${otp}</strong></p>
          <p>This code is valid for 5 minutes.</p>
        </div>
      `,
    });

    res.status(200).json({
      success: true,
      message: "New OTP sent to your email",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
};


// POST /api/auth/allUser
exports.allUserList = async (req, res) => {

  try {
    const users = await Player.find({ }) 
      .select("username email gender country");

    return res.status(200).json({
      success: true,
      users,
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};


// POST /api/auth/save-fcmToken
exports.saveFcmToken = async(req, res) =>{
  try {
    const {fcmToken} =req.body;
    const { _id } = req.user;
    
    if(!fcmToken){
      return res.status(404).json({
        success: false,
        message: "fcm token not found",
      });
    }

    const response = await Player.findByIdAndUpdate(_id, {fcmToken});

    return res.status(201).json({
      success: true,
      message: "fcm token added"
    })

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
}


// POST /api/auth/getuser

exports.getUser = async (req, res) => {
  const { _id } = req.user; 
  try {
    const user = await Player.findById(_id); 
      
    return res.status(200).json({
      success: true,
      user,
    });
    
  } catch (error) {
    console.error("Error fetching users:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
}