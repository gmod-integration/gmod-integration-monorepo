const express = require('express');
const router = express.Router();

// Validator
const clientValidator = require('../../middleware/v3/clientValidator');
router.use('/:clientID64/servers/:serverID/', clientValidator);

// Routes
const playersControllers = require('../../controllers/v3/clientsControllers');
router.post('/:clientID64/servers/:serverID/screenshots', playersControllers.uploadScreenshot);
router.post('/:clientID64/servers/:serverID/streams/frames', playersControllers.uploadStreamsFrames);

const errorsControllers = require('../../controllers/v3/errorsControllers');
router.post('/:clientID64/servers/:serverID/errors', errorsControllers.reportError);

// Export
module.exports = router;