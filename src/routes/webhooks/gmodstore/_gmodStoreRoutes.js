import express from 'express';
import gmodStoreControllers from '../../../controllers/webhooks/gmodstoreControllers.js';

const router = express.Router();

router.post('/', gmodStoreControllers);

export default router;