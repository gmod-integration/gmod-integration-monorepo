import express, { type ErrorRequestHandler, type Response } from 'express'
import { ConfigServer } from '@gmod/config'
import prisma from '@gmod/infra-prisma'
import { getPanelUserFromDiscordID } from '@gmod/domain-user/PanelUser.js'
import { getAccountErasureStatus, requestAccountErasure } from '@gmod/domain-compliance/accountErasure.js'
import {
  AccountErasureReceiptSchema,
  AccountErasureRequestIdSchema,
  AccountErasureRequestSchema,
  AccountErasureResponseSchema,
  AccountErasureStatusResponseSchema,
} from '@gmod/schema/user/AccountErasureSchema.js'
import asyncHandler from '../../middleware/asyncHandler.js'

const router = express.Router()
const expectedOrigin = new URL(ConfigServer.websiteUrl).origin
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

router.post(
  '/account/erasure-requests',
  asyncHandler(async (req, res) => {
    if (req.headers.origin !== undefined && req.headers.origin !== expectedOrigin) {
      return errorResponse(res, 403, 'origin_forbidden', 'This origin cannot request account erasure.')
    }
    const token = bearer(req.headers.authorization)
    if (!token) return errorResponse(res, 401, 'unauthorized', 'A valid session is required.')
    const sessions = await prisma.gm_panelToken.findMany({
      where: { accessToken: token, revoke: false, expirationDate: { gt: new Date() } },
      select: { discordID: true },
      take: 2,
    })
    // Tokens are not unique in the legacy schema. Refuse an ambiguous identity rather than
    // picking the first matching account or accepting a client-supplied Discord identifier.
    if (sessions.length !== 1) return errorResponse(res, 401, 'unauthorized', 'A valid session is required.')
    const panelUser = await getPanelUserFromDiscordID(sessions[0].discordID)
    if (!panelUser || !(await panelUser.authAllowed(token))) {
      return errorResponse(res, 401, 'unauthorized', 'A valid session is required.')
    }
    const input = AccountErasureRequestSchema.safeParse(req.body)
    if (!input.success || Object.keys(req.query).length > 0) {
      return errorResponse(
        res,
        400,
        'invalid_request',
        'Confirmation, a UUID idempotency key and a receipt are required.',
      )
    }
    const result = await requestAccountErasure(sessions[0].discordID, input.data.idempotencyKey, input.data.receipt)
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
  if (error && typeof error === 'object' && 'code' in error && error.code === 'account_erasure_conflict') {
    errorResponse(res, 409, 'account_erasure_conflict', 'This erasure request could not be accepted.')
    return
  }
  errorResponse(res, 503, 'service_unavailable', 'Account erasure is temporarily unavailable. Try again later.')
}
router.use(handleError)

export default router
