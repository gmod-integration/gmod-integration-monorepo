import { randomUUID } from 'node:crypto'
import { gmLog } from '@gmod/shared/logger.js'
import { type NextFunction, type Request, type Response } from 'express'
import { isBullMQReplyTimeoutError } from '@gmod/infra-bullmq/discordQueueAdapters.js'

export default async (err: Error, req: Request, res: Response, _next: NextFunction) => {
  if (isBullMQReplyTimeoutError(err)) {
    gmLog('error', `Discord service unavailable: ${err.message}`)
    res.status(503).json({ error: 'discord_service_unavailable' })
    return
  }

  const error_uuid = randomUUID()
  gmLog('error', `Error UUID: ${error_uuid}`)
  console.error(err)
  res.status(500).json({ error: 'internal_server_error', error_uuid })
}
