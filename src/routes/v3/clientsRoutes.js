const express = require('express');
const router = express.Router();

// Routes
const playersControllers = require('../../controllers/v3/clientsControllers');
router.post('/:clientID64/screenshots', playersControllers.uploadScreenshot);
router.post('/:clientID64/streams/frames', playersControllers.uploadStreamsFrames);

const errorsControllers = require('../../controllers/v3/errorsControllers');
router.post('/:clientID64/errors', errorsControllers.reportError);

// Export
module.exports = router;