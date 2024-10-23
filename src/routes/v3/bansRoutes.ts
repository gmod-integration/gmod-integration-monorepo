import express from 'express';
import { isGlobalBanSomewhere } from '../../controllers/v3/bansControllers';
import asyncHandler from '../../middleware/asyncHandler';

const router = express.Router();

router.get('/', asyncHandler(isGlobalBanSomewhere));

export default router;
