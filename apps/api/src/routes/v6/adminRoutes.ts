import express, { type ErrorRequestHandler } from 'express'
import adminMonitoringRoutes from './adminMonitoringRoutes.js'
import adminPreviewsRoutes from './adminPreviewsRoutes.js'
import { gmLog } from '@gmod/shared/logger.js'
import {
  AdminGuildListQuerySchema,
  AdminIDSchema,
  AdminPremiumListQuerySchema,
  AdminPremiumUpdateSchema,
  AdminPartnerUpdateSchema,
  AdminRevokeSessionsSchema,
  AdminServerCommandSchema,
  AdminServerListQuerySchema,
  AdminServerUpdateSchema,
  AdminUserListQuerySchema,
} from '@gmod/schema/admin/AdminDashboardSchema.js'
import type { z } from 'zod'
import { AdminAnalyticsQuerySchema } from '@gmod/schema/admin/AdminAnalyticsSchema.js'
import asyncHandler from '../../middleware/asyncHandler.js'
import { adminSession } from '../../middleware/v6/adminSession.js'

const router = express.Router()
router.use(asyncHandler(adminSession))
router.use('/monitoring', adminMonitoringRoutes)
router.use(adminPreviewsRoutes)

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success)
    throw Object.assign(new Error('Check the submitted fields.'), {
      name: 'AdminDashboardError',
      status: 400,
      code: 'invalid_request',
    })
  return result.data
}
const models = () => import('@gmod/core/models/v6/adminDashboard.js')
const audit = (action: string, actor: string, target: string, reason: string) =>
  gmLog('admin', JSON.stringify({ action, actor, target, reason }))

router.get('/access', (_req, res) => res.json({ authorized: true, discordID: _req.authSession!.discordID }))
router.get(
  '/overview',
  asyncHandler(async (_req, res) => res.json(await (await models()).getAdminOverview())),
)
router.get(
  '/analytics',
  asyncHandler(async (req, res) => {
    const query = parse(AdminAnalyticsQuerySchema, req.query)
    const { getAdminAnalytics } = await import('@gmod/core/models/v6/adminAnalytics.js')
    res.json(await getAdminAnalytics(query))
  }),
)
router.get(
  '/guilds',
  asyncHandler(async (req, res) =>
    res.json(await (await models()).listAdminGuilds(parse(AdminGuildListQuerySchema, req.query))),
  ),
)
router.get(
  '/servers',
  asyncHandler(async (req, res) =>
    res.json(await (await models()).listAdminServers(parse(AdminServerListQuerySchema, req.query))),
  ),
)
router.get(
  '/users',
  asyncHandler(async (req, res) =>
    res.json(await (await models()).listAdminUsers(parse(AdminUserListQuerySchema, req.query))),
  ),
)
router.get(
  '/premium',
  asyncHandler(async (req, res) =>
    res.json(await (await models()).listAdminPremium(parse(AdminPremiumListQuerySchema, req.query))),
  ),
)
router.get(
  '/guilds/:guildID',
  asyncHandler(async (req, res) =>
    res.json(await (await models()).getAdminGuildDetail(parse(AdminIDSchema, req.params.guildID))),
  ),
)

router.patch(
  '/servers/:serverID',
  asyncHandler(async (req, res) => {
    const id = parse(AdminIDSchema, req.params.serverID)
    const input = parse(AdminServerUpdateSchema, req.body)
    const result = await (await models()).updateAdminServer(id, input)
    audit('server_updated', req.authSession!.discordID, id, input.reason)
    res.json(result)
  }),
)
router.delete(
  '/servers/:serverID',
  asyncHandler(async (req, res) => {
    const id = parse(AdminIDSchema, req.params.serverID)
    const input = parse(AdminServerCommandSchema, req.body)
    const result = await (await models()).deleteAdminServer(id, input)
    audit('server_deleted', req.authSession!.discordID, id, input.reason)
    res.json(result)
  }),
)
router.post(
  '/servers/:serverID/reset-token',
  asyncHandler(async (req, res) => {
    const id = parse(AdminIDSchema, req.params.serverID)
    const input = parse(AdminServerCommandSchema, req.body)
    const result = await (await models()).resetAdminServerToken(id, input)
    audit('server_token_rotated', req.authSession!.discordID, id, input.reason)
    res.json(result)
  }),
)
router.put(
  '/guilds/:guildID/premium',
  asyncHandler(async (req, res) => {
    const id = parse(AdminIDSchema, req.params.guildID)
    const input = parse(AdminPremiumUpdateSchema, req.body)
    const result = await (await models()).updateAdminPremium(id, input)
    audit(input.enabled ? 'premium_grant_added' : 'premium_grant_removed', req.authSession!.discordID, id, input.reason)
    res.json(result)
  }),
)
router.patch(
  '/guilds/:guildID/partner',
  asyncHandler(async (req, res) => {
    const id = parse(AdminIDSchema, req.params.guildID)
    const input = parse(AdminPartnerUpdateSchema, req.body)
    const result = await (await models()).updateAdminPartner(id, input)
    audit(input.enabled ? 'guild_partner_added' : 'guild_partner_removed', req.authSession!.discordID, id, input.reason)
    res.json(result)
  }),
)
router.post(
  '/users/:userID/revoke-sessions',
  asyncHandler(async (req, res) => {
    const id = parse(AdminIDSchema, req.params.userID)
    const input = parse(AdminRevokeSessionsSchema, req.body)
    const { revokeAdminUserSessions } = await import('@gmod/core/models/v6/adminUserManagement.js')
    res.json(await revokeAdminUserSessions(req.authSession!.discordID, id, input))
  }),
)

const handleAdminError: ErrorRequestHandler = (error, _req, res, next) => {
  if (error?.name === 'AdminDashboardError' || error?.name === 'AdminUserActionError') {
    res.status(error.status).json({ error: { code: error.code, message: error.message } })
    return
  }
  next(error)
}
router.use(handleAdminError)
export default router
