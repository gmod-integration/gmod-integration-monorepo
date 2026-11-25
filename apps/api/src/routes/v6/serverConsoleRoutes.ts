import express from 'express'
import { ConsoleRconRequestSchema } from '@gmod/schema/gmod/ConsoleStreamSchema.js'
import { executeServerConsoleCommand, ServerConsoleError } from '@gmod/core/models/v6/serverConsole.js'
import { dashboardServer, dashboardSession } from '../../middleware/v6/dashboardSession.js'
import asyncHandler from '../../middleware/asyncHandler.js'

const router = express.Router()
const route = '/guilds/:guildID/servers/:serverID/console/commands'
router.post(
  route,
  asyncHandler(dashboardSession),
  asyncHandler(dashboardServer),
  asyncHandler(async (req, res) => {
    const input = ConsoleRconRequestSchema.safeParse(req.body)
    if (!input.success || Object.keys(req.query).length)
      return res.status(400).json({ error: { code: 'invalid_request', message: 'The console command is invalid.' } })
    try {
      return res.json(await executeServerConsoleCommand(req.server!, req.authSession!, input.data))
    } catch (error) {
      if (error instanceof ServerConsoleError)
        return res
          .status(error.status)
          .json({ error: { code: error.code, message: 'The console command could not be submitted.' } })
      throw error
    }
  }),
)

export default router
