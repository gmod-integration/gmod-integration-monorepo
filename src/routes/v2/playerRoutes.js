const express = require('express');
const router = express.Router();

// Validator
const playerValidatorMiddleware = require("../../middleware/v2/playerValidator");
router.use('/', playerValidatorMiddleware);

// Routes
const playerController = require('../../controllers/v2/playerController');
router.post('/screenshots', playerController.postScreenshot);

// Export
module.exports = router;