const express = require('express');
const router = express.Router();

// Routes
const playersControllers = require('../../controllers/v3/playersControllers');
router.get('/:steamID64', playersControllers.getPlayer);

// Export
module.exports = router;