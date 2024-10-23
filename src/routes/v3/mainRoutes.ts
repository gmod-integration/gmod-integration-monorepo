import express from 'express';
import { getActualStats } from '../../controllers/v3/mainControllers';
import asyncHandler from '../../middleware/asyncHandler';

const router = express.Router();

router.get('/stats', asyncHandler(getActualStats));

export default router;
