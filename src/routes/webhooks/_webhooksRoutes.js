import express from 'express';
import gmodStoreValidatorMiddleware from '../../middleware/webhooks/gmodStoreValidator.js';
import gmodStoreRoutes from './gmodstore/_gmodStoreRoutes.js';
import stripeValidatorMiddleware from '../../middleware/webhooks/stripeValidator.js';
import stripeRoutes from './stripe/_stripeRoutes.js';

const router = express.Router();

router.use('/gmod-store', gmodStoreValidatorMiddleware, gmodStoreRoutes);
router.use('/stripe', stripeValidatorMiddleware, stripeRoutes);

export default router;