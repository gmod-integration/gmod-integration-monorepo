import express from 'express'
import { isGlobalBanSomewhere } from '@/controllers/v3/bansControllers.js'
import asyncHandler from '@/middleware/asyncHandler.js'

const router = express.Router()

router.get('/', asyncHandler(isGlobalBanSomewhere))

export default router
