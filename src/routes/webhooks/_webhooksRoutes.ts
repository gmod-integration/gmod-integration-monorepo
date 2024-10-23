import express from 'express';
import gmodStoreValidator from '../../middleware/webhooks/gmodStoreValidator';
import gmodStoreRoutes from './gmodstore/_gmodStoreRoutes';

const router = express.Router();

router.use('/gmod-store', gmodStoreValidator, gmodStoreRoutes);

export default router;
