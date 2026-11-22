import express, { type ErrorRequestHandler, type Response } from 'express'
import {
  AuthSessionError,
  assertSessionRequest,
  assertTrustedOrigin,
  resolveRequestSession,
} from '@gmod/domain-auth/authSessions.js'
import { DiscordOAuthError } from '@gmod/domain-auth/discordOAuth.js'
import { getAccountErasureStatus, requestAccountErasure } from '@gmod/domain-compliance/accountErasure.js'
import {
  AccountErasureReceiptSchema,
  AccountErasureRequestIdSchema,
  AccountErasureRequestSchema,
  AccountErasureResponseSchema,
  AccountErasureStatusResponseSchema,
} from '@gmod/schema/user/AccountErasureSchema.js'
import asyncHandler from '../../middleware/asyncHandler.js'
import dashboardSettingsRoutes from './dashboardSettingsRoutes.js'
import statusSettingsRoutes from './statusSettingsRoutes.js'
import accessRoutes from './accessRoutes.js'
import authRoutes from './authRoutes.js'
import adminRoutes from './adminRoutes.js'
import docsRoutes from './docsRoutes.js'
import { AccessDeniedError } from '@gmod/domain-access/index.js'

const router = express.Router()
const errorResponse = (res: Response, status: number, code: string, message: string) =>
  res.status(status).json({ error: { code, message } })

// Do not expose service errors, session tokens or receipts through the legacy error logger.
router.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  next()
})

function bearer(header: string | undefined): string | null {
  const match = header?.match(/^Bearer ([A-Za-z0-9._~+/-]+=*)$/i)
  return match?.[1] ?? null
}

router.get('/', (_req, res) => {
  res.json({ status: 'ok', version: 'v6' })
})

router.use('/docs', docsRoutes)
router.use(dashboardSettingsRoutes)
router.use(statusSettingsRoutes)
router.use(accessRoutes)
router.use('/auth', authRoutes)
router.use('/admin', adminRoutes)

router.post(
  '/account/erasure-requests',
  asyncHandler(async (req, res) => {
    assertTrustedOrigin(req)
    const session = await resolveRequestSession(req, { touch: false })
    if (!session) return errorResponse(res, 401, 'unauthorized', 'A valid session is required.')
    assertSessionRequest(req, session)
    if (session.actorDiscordID)
      return errorResponse(
        res,
        403,
        'erasure_impersonation_forbidden',
        'Account erasure requires your own account session.',
      )
    const input = AccountErasureRequestSchema.safeParse(req.body)
    if (!input.success || Object.keys(req.query).length > 0) {
      return errorResponse(
        res,
        400,
        'invalid_request',
        'Confirmation, a UUID idempotency key and a receipt are required.',
      )
    }
    const result = await requestAccountErasure(session.discordID, input.data.idempotencyKey, input.data.receipt)
    const response = AccountErasureResponseSchema.safeParse({ ...result, receipt: input.data.receipt })
    if (!response.success || response.data.requestId !== input.data.idempotencyKey) {
      return errorResponse(res, 500, 'internal_error', 'The erasure request could not be acknowledged.')
    }
    return res.status(response.data.status === 'completed' ? 200 : 202).json(response.data)
  }),
)

router.get(
  '/account/erasure-requests/:requestId',
  asyncHandler(async (req, res) => {
    const receipt = AccountErasureReceiptSchema.safeParse(bearer(req.headers.authorization))
    if (!receipt.success) return errorResponse(res, 401, 'unauthorized', 'A valid erasure receipt is required.')
    const requestId = AccountErasureRequestIdSchema.safeParse(req.params.requestId)
    if (!requestId.success || Object.keys(req.query).length > 0) {
      return errorResponse(res, 400, 'invalid_request', 'Use the request ID and the Authorization header.')
    }
    const result = await getAccountErasureStatus(requestId.data, receipt.data)
    if (!result) return errorResponse(res, 404, 'not_found', 'The erasure request was not found.')
    const response = AccountErasureStatusResponseSchema.safeParse(result)
    if (!response.success || response.data.requestId !== requestId.data) {
      return errorResponse(res, 500, 'internal_error', 'The erasure status is unavailable.')
    }
    return res.json(response.data)
  }),
)

router.use((_req, res) => {
  errorResponse(res, 404, 'not_found', 'This v6 endpoint does not exist.')
})

const handleError: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  if (
    error instanceof AuthSessionError ||
    error instanceof DiscordOAuthError ||
    (error instanceof Error && 'code' in error && error.code === 'provider_unavailable')
  ) {
    const detail = error as Error & { status?: number; code: string; retryAfter?: number }
    const status = detail.code === 'grant_rejected' ? 403 : detail.status || 503
    if (detail.retryAfter) res.setHeader('Retry-After', String(detail.retryAfter))
    return errorResponse(
      res,
      status,
      detail.code === 'grant_rejected' ? 'discord_reauth_required' : detail.code,
      detail.message,
    )
  }
  if (error instanceof AccessDeniedError) {
    res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        capability: error.capability,
        limit: error.limit,
        used: error.used,
      },
    })
    return
  }
  if (error && typeof error === 'object' && 'code' in error && error.code === 'settings_forbidden') {
    errorResponse(res, 403, 'settings_forbidden', 'These settings require a premium entitlement.')
    return
  }
  if (error && typeof error === 'object' && 'code' in error && error.code === 'account_erasure_conflict') {
    errorResponse(res, 409, 'account_erasure_conflict', 'This erasure request could not be accepted.')
    return
  }
  errorResponse(res, 503, 'service_unavailable', 'The service is temporarily unavailable. Try again later.')
}
router.use(handleError)

export default router
