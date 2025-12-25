const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requestController = require('../controller/requestController');

// 1) List of users with near score
router.get('/near-users', auth, requestController.nearUsers);

// 2) Send/receive a game match request
router.post('/request', auth, requestController.sendMatchRequest);
router.post('/respond', auth, requestController.respondMatchRequest);
router.get('/requests', auth, requestController.listRequests);

// 3) Record and display game results (win/loss)
router.post('/result', requestController.recordResult);
router.get('/game/:id', auth, requestController.getGameResult);
router.get('/results', auth, requestController.listResults);

module.exports = router;