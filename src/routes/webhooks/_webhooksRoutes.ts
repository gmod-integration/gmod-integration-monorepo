import express from 'express';
import gmodStoreValidator from '../../middleware/webhooks/gmodStoreValidator.js';
import gmodStoreRoutes from './gmodstore/_gmodStoreRoutes.js';
import asyncHandler from '../../middleware/asyncHandler.js';

const router = express.Router();

router.use('/gmod-store', gmodStoreValidator, asyncHandler(gmodStoreRoutes));

export default router;
