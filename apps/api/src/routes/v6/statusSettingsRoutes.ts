import express from 'express'
import { StatusConfigurationSaveSchema } from '@gmod/schema/server/StatusConfigurationSchema.js'
import {
  getStatusConfiguration,
  saveStatusConfiguration,
  StatusConfigurationError,
} from '@gmod/domain-server/statusConfiguration.js'
import { enqueueDiscordServerStatusRefresh } from '@gmod/infra-bullmq/discordQueueAdapters.js'
import { dashboardSession, dashboardServer } from '../../middleware/v6/dashboardSession.js'
import asyncHandler from '../../middleware/asyncHandler.js'

const router = express.Router()
const route = '/guilds/:guildID/servers/:serverID/status/configuration'
router.use(route, asyncHandler(dashboardSession), asyncHandler(dashboardServer))
router.get(
  route,
  asyncHandler(async (req, res) => {
    return res.json(await getStatusConfiguration(req.server!.id))
  }),
)
router.put(
  route,
  asyncHandler(async (req, res) => {
    const parsed = StatusConfigurationSaveSchema.safeParse(req.body)
    if (!parsed.success)
      return res
        .status(400)
        .json({ error: { code: 'invalid_request', message: 'The status configuration is invalid.' } })
    try {
      return res.json(
        await saveStatusConfiguration(req.server!, parsed.data, () =>
          enqueueDiscordServerStatusRefresh(req.server!.id),
        ),
      )
    } catch (error) {
      if (error instanceof StatusConfigurationError)
        return res
          .status(error.code === 'conflict' ? 409 : error.code === 'premium_required' ? 403 : 400)
          .json({ error: { code: error.code, message: 'The status configuration could not be saved.' } })
      throw error
    }
  }),
)
export default router
