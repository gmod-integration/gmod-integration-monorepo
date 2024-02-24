const express = require('express');
const router = express.Router();

// Routes
const playersControllers = require('../../controllers/v3/clientsControllers');
router.post('/:clientID64/screenshots', playersControllers.uploadScreenshot);
router.post('/:clientID64/streams/frames', playersControllers.uploadStreamsFrames);

// Export
module.exports = router;