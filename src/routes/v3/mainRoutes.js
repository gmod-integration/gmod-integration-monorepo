import express from 'express';
import { getActualStats } from '../../controllers/v3/mainControllers.js';

const router = express.Router();

router.get('/stats', getActualStats);

export default router;
