import express from 'express';
import gmodStoreValidator from '@/middleware/webhooks/gmodStoreValidator.js';
import gmodStoreRoutes from './gmodstore/_gmodStoreRoutes.js';

const router = express.Router();

router.use('/gmod-store', gmodStoreValidator, gmodStoreRoutes);

export default router;
