const express = require('express');
const router = express.Router();

// Validator
const authValidatorMiddleware = require("../../middleware/v2/authValidator");
router.use('/', authValidatorMiddleware);

// Routes
const serverController = require("../../controllers/v2/serverController");
router.get('/guild', serverController.getServer);
router.post('/status', serverController.postServerStatus);
router.post('/log/:type', serverController.postServerLog);

// Export
module.exports = router;