import express from 'express'
import { getDashboardAccess } from '@gmod/core/models/v6/access.js'
import { dashboardGuild, dashboardServer, dashboardSession } from '../../middleware/v6/dashboardSession.js'
import asyncHandler from '../../middleware/asyncHandler.js'

const router = express.Router()
router.get(
  '/guilds/:guildID/access',
  asyncHandler(dashboardSession),
  asyncHandler(dashboardGuild),
  asyncHandler(async (req, res) => {
    return res.json(await getDashboardAccess(req.guild!.id))
  }),
)
router.get(
  '/guilds/:guildID/servers/:serverID/access',
  asyncHandler(dashboardSession),
  asyncHandler(dashboardServer),
  asyncHandler(async (req, res) => {
    return res.json(await getDashboardAccess(req.guild!.id, req.server!.id))
  }),
)
export default router
