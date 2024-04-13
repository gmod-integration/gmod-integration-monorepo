import express from 'express';
import gmodStoreValidatorMiddleware from '../../middleware/webhooks/gmodStoreValidator.js';
import gmodStoreRoutes from './gmodstore/_gmodStoreRoutes.js';

const router = express.Router();

router.use('/gmod-store', gmodStoreValidatorMiddleware, gmodStoreRoutes);

export default router;