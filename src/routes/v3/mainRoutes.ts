import express from 'express';
import { getActualStats } from '../../controllers/v3/mainControllers.js';
import asyncHandler from '../../middleware/asyncHandler.js';

const router = express.Router();

router.get('/stats', asyncHandler(getActualStats));

export default router;
