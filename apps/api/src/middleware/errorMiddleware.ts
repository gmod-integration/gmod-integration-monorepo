import { randomUUID } from 'node:crypto'
import { gmLog } from '@gmod/shared/logger.js'
import { type NextFunction, type Request, type Response } from 'express'
import { isBullMQReplyTimeoutError } from '@gmod/infra-bullmq/discordQueueAdapters.js'
import { AccessDeniedError } from '@gmod/domain-access/index.js'

export default async (err: Error, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AccessDeniedError) {
    res.setHeader('Cache-Control', 'no-store')
    const detail = {
      code: err.code,
      message: err.message,
      capability: err.capability,
      limit: err.limit,
      used: err.used,
    }
    res
      .status(err.status)
      .json(
        req.path?.startsWith('/v6')
          ? { error: detail }
          : { error: err.code, capability: err.capability, limit: err.limit, used: err.used },
      )
    return
  }
  if ('code' in err && err.code === 'personal_data_erasure_blocked') {
    res.setHeader('Cache-Control', 'no-store')
    res.status(409).json({
      error: req.path?.startsWith('/v6')
        ? { code: 'personal_data_erasure_blocked', message: 'Account erasure is in progress.' }
        : 'personal_data_erasure_blocked',
    })
    return
  }
  // Parsing and CORS failures happen before the versioned router is entered. They must still
  // use its public error contract, and parser errors can contain the raw receipt-bearing body.
  if (req.path === '/v6' || req.path?.startsWith('/v6/')) {
    res.setHeader('Cache-Control', 'no-store')
    const type = 'type' in err ? err.type : undefined
    const [status, code, message] =
      type === 'entity.parse.failed'
        ? ([400, 'invalid_request', 'The request body must be valid JSON.'] as const)
        : type === 'entity.too.large'
          ? ([413, 'invalid_request', 'The request body is too large.'] as const)
          : err.message === 'Not allowed by CORS'
            ? ([403, 'origin_forbidden', 'This origin is not allowed.'] as const)
            : ([503, 'service_unavailable', 'This service is temporarily unavailable. Try again later.'] as const)
    res.status(status).json({ error: { code, message } })
    return
  }

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
