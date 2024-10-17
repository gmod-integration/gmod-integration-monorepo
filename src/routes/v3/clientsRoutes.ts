import express from 'express';
import { reportBugs, uploadScreenshot } from '../../controllers/v3/clientsControllers.js';
import { reportError } from '../../controllers/v3/errorsControllers.js';
import asyncHandler from '../../middleware/asyncHandler.js';
import clientValidator from '../../middleware/v3/clientValidator';

const router = express.Router();

router.use('/:clientID64/servers/:serverID/', clientValidator);

router.post('/:clientID64/servers/:serverID/screenshots', asyncHandler(uploadScreenshot));
router.post('/:clientID64/servers/:serverID/errors', asyncHandler(reportError));
router.post('/:clientID64/servers/:serverID/bugs', asyncHandler(reportBugs));

export default router;
