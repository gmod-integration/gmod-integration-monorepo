import express from 'express'
import gmodStoreControllers from '@/controllers/webhooks/gmodstoreControllers.js'
import asyncHandler from '@/middleware/asyncHandler.js'

const router = express.Router()

router.post('/', asyncHandler(gmodStoreControllers))

export default router
