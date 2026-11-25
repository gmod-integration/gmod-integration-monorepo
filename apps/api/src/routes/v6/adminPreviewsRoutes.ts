import express from 'express'
import asyncHandler from '../../middleware/asyncHandler.js'

// Mounted after the root developer-only adminSession middleware.
const router = express.Router()
router.get(
  '/servers/:serverID/previews',
  asyncHandler(async (req, res) => {
    const { getAdminServerPreviews } = await import('@gmod/core/models/v6/adminServerPreviews.js')
    res.json(await getAdminServerPreviews(req.params.serverID))
  }),
)
router.get(
  '/servers/:serverID/status-preview',
  asyncHandler(async (req, res) => {
    const { getAdminServerStatusPreview } = await import('@gmod/core/models/v6/adminServerPreviews.js')
    res.json(await getAdminServerStatusPreview(req.params.serverID, req.query))
  }),
)
export default router
