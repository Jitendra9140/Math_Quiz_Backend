const express = require('express');
const router = express.Router();
const adminController=require("../controller/adminController")

router.put("/block-user", adminController.blockUser);
router.put("/unblock-user", adminController.unblockUser);

module.exports = router;