const express = require('express');
const router = express.Router();

// Routes
const errorsControllers = require('../../controllers/v3/errorsControllers');
router.post('/', errorsControllers.reportError);

// Export
module.exports = router;