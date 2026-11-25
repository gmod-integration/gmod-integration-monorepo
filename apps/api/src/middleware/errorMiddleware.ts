import { randomUUID } from 'node:crypto'
import { gmLog } from '@gmod/shared/logger.js'
import { type NextFunction, type Request, type Response } from 'express'
import { isBullMQReplyTimeoutError } from '@gmod/infra-bullmq/discordQueueAdapters.js'
import { AccessDeniedError } from '@gmod/domain-access/index.js'
import { AuthSessionError } from '@gmod/domain-auth/authSessions.js'
import { DiscordOAuthError } from '@gmod/domain-auth/discordOAuth.js'

export default async (err: Error, req: Request, res: Response, _next: NextFunction) => {
  const path = req.path?.toLowerCase()
  const v6 = path === '/v6' || path?.startsWith('/v6/')
  if (
    err instanceof AuthSessionError ||
    err instanceof DiscordOAuthError ||
    ('code' in err && err.code === 'provider_unavailable')
  ) {
    const detail = err as Error & { status?: number; code: string; retryAfter?: number }
    res.setHeader('Cache-Control', 'no-store')
    if (detail.retryAfter) res.setHeader('Retry-After', String(detail.retryAfter))
    const code = detail.code === 'grant_rejected' ? 'discord_reauth_required' : detail.code
    res
      .status(detail.code === 'grant_rejected' ? 403 : detail.status || 503)
      .json({ error: v6 ? { code, message: detail.message } : code })
    return
  }
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
      .json(v6 ? { error: detail } : { error: err.code, capability: err.capability, limit: err.limit, used: err.used })
    return
  }
  if ('code' in err && err.code === 'personal_data_erasure_blocked') {
    res.setHeader('Cache-Control', 'no-store')
    res.status(409).json({
      error: v6
        ? { code: 'personal_data_erasure_blocked', message: 'Account erasure is in progress.' }
        : 'personal_data_erasure_blocked',
    })
    return
  }
  // Parser failures may carry the original credential-bearing body. Never log or reflect it.
  const type = 'type' in err ? err.type : undefined
  const parserStatus = ['entity.parse.failed', 'querystring.parse.rangeError'].includes(String(type))
    ? 400
    : ['entity.too.large', 'parameters.too.many'].includes(String(type))
      ? 413
      : ['encoding.unsupported', 'charset.unsupported'].includes(String(type))
        ? 415
        : undefined
  if (parserStatus) {
    res.setHeader('Cache-Control', 'no-store')
    res
      .status(parserStatus)
      .json(
        v6
          ? { error: { code: 'invalid_request', message: 'The request body is invalid or exceeds its limits.' } }
          : { error: 'invalid_request' },
      )
    return
  }
  if (v6) {
    res.setHeader('Cache-Control', 'no-store')
    const [status, code, message] =
      err.message === 'Not allowed by CORS'
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
