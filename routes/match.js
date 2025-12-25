const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const matchController = require('../controller/matchApiController');

// 1) List of users with near score
router.get('/near-users', auth, matchController.nearUsers);

// 2) Send/receive a game match request
router.post('/request', auth, matchController.sendMatchRequest);
router.post('/respond', auth, matchController.respondMatchRequest);
router.get('/requests', auth, matchController.listRequests);

// 3) Record and display game results (win/loss)
router.post('/result', matchController.recordResult);
router.get('/game/:id', auth, matchController.getGameResult);
router.get('/results', auth, matchController.listResults);

module.exports = router;