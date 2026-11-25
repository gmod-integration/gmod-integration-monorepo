import express from 'express'
import {
  GuildDashboardSettingsRequestSchema,
  ServerDashboardSettingsRequestSchema,
} from '@gmod/schema/server/DashboardSettingsSchema.js'
import { saveGuildDashboardSettings, saveServerDashboardSettings } from '@gmod/core/models/v6/dashboardSettings.js'
import { dashboardSession, dashboardGuild, dashboardServer } from '../../middleware/v6/dashboardSession.js'
import asyncHandler from '../../middleware/asyncHandler.js'

const router = express.Router()
router.put(
  '/guilds/:guildID/settings',
  asyncHandler(dashboardSession),
  asyncHandler(dashboardGuild),
  asyncHandler(async (req, res) => {
    const input = GuildDashboardSettingsRequestSchema.safeParse(req.body)
    if (!input.success)
      return res.status(400).json({ error: { code: 'invalid_settings', message: 'The settings are invalid.' } })
    return res.json(await saveGuildDashboardSettings(req.guild!, input.data.settings))
  }),
)
router.put(
  '/guilds/:guildID/servers/:serverID/settings',
  asyncHandler(dashboardSession),
  asyncHandler(dashboardServer),
  asyncHandler(async (req, res) => {
    const input = ServerDashboardSettingsRequestSchema.safeParse(req.body)
    if (!input.success)
      return res.status(400).json({ error: { code: 'invalid_settings', message: 'The settings are invalid.' } })
    return res.json(await saveServerDashboardSettings(req.server!, input.data.settings))
  }),
)
export default router
