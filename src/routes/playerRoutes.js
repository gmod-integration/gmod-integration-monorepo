const express = require('express');
const router = express.Router();
const playerController = require('../controllers/playerController');

router.post('/screenshots', playerController.postScreenshot);

module.exports = router;