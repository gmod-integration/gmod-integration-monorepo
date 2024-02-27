const express = require('express');
const router = express.Router();

// Routes
const playersControllers = require('../../controllers/v3/usersControllers');
router.get('/', playersControllers.getProfile);

// Export
module.exports = router;