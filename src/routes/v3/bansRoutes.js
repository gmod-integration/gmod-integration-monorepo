const express = require('express');
const router = express.Router();

// Bans
const banController = require('../../controllers/v3/bansControllers');
router.get('/', banController.isGlobalBanSomewhere);

// Export
module.exports = router;