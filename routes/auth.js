const express = require('express');
const router = express.Router();
const authController = require('../controller/authController');
const auth = require('../middleware/auth');
const profileController = require("../controller/profileController");
const { uploadToMemory, handleMulterError } = require("../config/multerConfig");
const { uploadToS3 } = require("../config/multerConfig");

//login
router.post('/login', authController.login)

// Registration 
router.post("/signup", authController.signup); // Sends OTP
router.post("/verify-signup-otp", authController.verifySignupOTP); // Verifies OTP and completes registration
router.post("/resend-signup-otp", authController.resendSignupOTP); // Resend OTP

//Forgetpassword
router.post('/sendForgotPassOtp', authController.sendForgotPasswordOtp);
router.post("/verfy-forget-otp", authController.verifyForgotPasswordOtp);
router.post("/changePass", authController.changePassword);
router.post('/resend-forget-otp',authController.resendForgotPasswordOtp)


//
router.delete("/admin/delete-user/:userId", authController.deleteUserByAdmin);


//Update profile using S3 Bucket
router.put(
  "/profile",
  auth,
  uploadToMemory.single("profileImage"),
  profileController.updateProfile
);
// router.delete("/profile/image", auth, profileController.deleteProfileImage);

//Get information
router.get('/getUser', auth ,authController.getUser);
router.get('/getUserById', auth ,authController.getUserById);
router.get('/allUser', authController.allUserList);


router.patch('/save-fcmToken', auth, authController.saveFcmToken );
module.exports = router;

