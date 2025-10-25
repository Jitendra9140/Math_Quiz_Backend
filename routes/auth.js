const express = require('express');
const router = express.Router();
const authController = require('../controller/authController');
const auth = require('../middleware/auth');

router.post('/verifymail', authController.sendVerificationMail);
router.post('/login', authController.login)
router.post('/signup', authController.signup)
router.post('/sendForgotPassOtp', authController.sendForgotPasswordOtp);
router.post('/changePass', authController.changePass);

router.get('/getUser', auth ,authController.getUser);
router.get('/allUser', authController.allUserList);

router.patch('/save-fcmToken', auth, authController.saveFcmToken );



module.exports = router;
