import express from 'express';
import gmodStoreControllers from '../../../controllers/webhooks/gmodstoreControllers';
import asyncHandler from '../../../middleware/asyncHandler';

const router = express.Router();

router.post('/', asyncHandler(gmodStoreControllers));

export default router;
