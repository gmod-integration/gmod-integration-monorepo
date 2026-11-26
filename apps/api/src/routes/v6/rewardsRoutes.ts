import express, { type Request, type Response } from 'express'
import {
  RewardHistoryQuerySchema,
  RewardIDSchema,
  RewardManualGrantSchema,
  RewardRuleDeleteSchema,
  RewardRuleInputSchema,
  RewardRuleSaveSchema,
  RewardSimulationInputSchema,
} from '@gmod/schema/server/RewardsSchema.js'
import {
  createRewardRule,
  deleteRewardRule,
  getRewardHistory,
  getRewardsDashboard,
  grantManualReward,
  RewardsError,
  simulateReward,
  updateRewardRule,
} from '@gmod/core/models/v6/rewards.js'
import { dashboardServer, dashboardServerReadOnly, dashboardSession } from '../../middleware/v6/dashboardSession.js'
import asyncHandler from '../../middleware/asyncHandler.js'
import { getSingleParam } from '../../utils/requestParams.js'

const router = express.Router()
const route = '/guilds/:guildID/servers/:serverID/rewards'
const invalid = (res: Response) =>
  res.status(400).json({
    error: { code: 'invalid_request', message: 'The reward request is invalid.' },
  })
const run = (operation: (req: Request, res: Response) => Promise<unknown>) =>
  asyncHandler(async (req, res) => {
    try {
      return await operation(req, res)
    } catch (error) {
      if (error instanceof RewardsError)
        return res.status(error.status).json({ error: { code: error.code, message: error.message } })
      throw error
    }
  })
const ruleID = (req: Request) => RewardIDSchema.safeParse(getSingleParam(req.params.ruleID))
const actor = (req: Request) => req.authSession!.actorDiscordID ?? req.authSession!.discordID

// Register this read-only POST before the mutation guard; authentication/CSRF still applies.
router.post(
  `${route}/rules/:ruleID/simulate`,
  asyncHandler(dashboardSession),
  asyncHandler(dashboardServerReadOnly),
  run(async (req, res) => {
    const id = ruleID(req)
    const input = RewardSimulationInputSchema.safeParse(req.body)
    if (!id.success || !input.success || Object.keys(req.query).length) return invalid(res)
    return res.json(await simulateReward(req.server!.id, id.data, input.data.steamID64))
  }),
)
router.use(route, asyncHandler(dashboardSession), asyncHandler(dashboardServer))

router.get(
  route,
  run(async (req, res) => {
    if (Object.keys(req.query).length) return invalid(res)
    return res.json(await getRewardsDashboard(req.server!.id))
  }),
)
router.get(
  `${route}/history`,
  run(async (req, res) => {
    const query = RewardHistoryQuerySchema.safeParse(req.query)
    if (!query.success) return invalid(res)
    return res.json(await getRewardHistory(req.server!.id, query.data))
  }),
)
router.post(
  `${route}/rules`,
  run(async (req, res) => {
    const input = RewardRuleInputSchema.safeParse(req.body)
    if (!input.success || Object.keys(req.query).length) return invalid(res)
    return res.status(201).json(await createRewardRule(req.server!.id, input.data, actor(req)))
  }),
)
router.put(
  `${route}/rules/:ruleID`,
  run(async (req, res) => {
    const id = ruleID(req)
    const input = RewardRuleSaveSchema.safeParse(req.body)
    if (!id.success || !input.success || Object.keys(req.query).length) return invalid(res)
    return res.json(await updateRewardRule(req.server!.id, id.data, input.data, actor(req)))
  }),
)
router.delete(
  `${route}/rules/:ruleID`,
  run(async (req, res) => {
    const id = ruleID(req)
    const input = RewardRuleDeleteSchema.safeParse(req.body)
    if (!id.success || !input.success || Object.keys(req.query).length) return invalid(res)
    return res.json(await deleteRewardRule(req.server!.id, id.data, input.data.revision, actor(req)))
  }),
)
router.post(
  `${route}/rules/:ruleID/grant`,
  run(async (req, res) => {
    const id = ruleID(req)
    const input = RewardManualGrantSchema.safeParse(req.body)
    if (!id.success || !input.success || Object.keys(req.query).length) return invalid(res)
    return res.status(202).json(await grantManualReward(req.server!.id, id.data, input.data, actor(req)))
  }),
)

export default router
