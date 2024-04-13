import express from 'express';
import {uploadScreenshot} from '../../controllers/v3/clientsControllers.js';
import {reportError} from '../../controllers/v3/errorsControllers.js';
import clientValidator from '../../middleware/v3/clientValidator.js';

const router = express.Router();

router.use('/:clientID64/servers/:serverID/', clientValidator);

router.post('/:clientID64/servers/:serverID/screenshots', uploadScreenshot);
router.post('/:clientID64/servers/:serverID/errors', reportError);

export default router;