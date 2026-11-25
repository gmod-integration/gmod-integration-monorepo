import { randomUUID } from 'node:crypto'
import prisma from '@gmod/infra-prisma'
import { mongoClient } from '@gmod/infra-mongo'
import { assertCapability, hasCapability, resolveGuildAccess } from '@gmod/domain-access/index.js'
import { getUserFromSteamID64 } from '@gmod/domain-user/User.js'
import { isErasureBlocked } from '@gmod/domain-user/privacy.js'
import { enqueueDiscordRewardRole } from '@gmod/infra-bullmq/discordQueueAdapters.js'
import {
  RewardAckSchema,
  RewardHistoryQuerySchema,
  RewardIDSchema,
  RewardManualGrantSchema,
  RewardPollResponseSchema,
  RewardPollSchema,
  RewardRuleInputSchema,
  RewardRuleSaveSchema,
  RewardSteamIDSchema,
  type RewardDelivery,
  type PlayerRewards,
  type PlayerRewardRule,
  type RewardGrant,
  type RewardHistory,
  type RewardIntegrations,
  type RewardRule,
  type RewardSimulation,
  type RewardStatus,
  type RewardsDashboard,
} from '@gmod/schema/server/RewardsSchema.js'

const DAY = 86_400_000
const iso = () => new Date().toISOString()
type RuleDocument = RewardRule & {
  _id: string
  serverID: string
  guildID: string
  actorDiscordID: string
  deletedAt: string | null
}
type GrantAction = RewardGrant['actions'][number] & { attemptedAt: string | null; code?: string }
type GrantDocument = Omit<RewardGrant, 'actions'> & {
  _id: string
  serverID: string
  guildID: string
  dedupeKey: string
  deliveryToken: string
  version: number
  triggerAt: string
  requestID: string | null
  requestRevision: number | null
  sweptAt: string | null
  onceSteamKey: string | null
  onceDiscordKey: string | null
  actions: GrantAction[]
}
type IntegrationDocument = RewardIntegrations & { _id: string; guildID: string; updatedAt: string }
type Context = { id: string; guild: string }
export type DiscordRewardAction = {
  serverID: string
  grantID: string
  actionID: string
  steamID64: string
  discordID: string
  roleID: string
}
type RoleDelivery = (
  input: DiscordRewardAction,
) => Promise<{ status: 'delivered' | 'failed' | 'uncertain'; reason?: string }>

const database = () => mongoClient.db('gmod_integration')
const rules = () => database().collection<RuleDocument>('gm_reward_rules')
const grants = () => database().collection<GrantDocument>('gm_reward_grants')
const integrations = () => database().collection<IntegrationDocument>('gm_reward_integrations')
let indexes: Promise<unknown> | undefined
function ensureIndexes() {
  indexes ??= Promise.all([
    rules().createIndex({ serverID: 1, guildID: 1, deletedAt: 1 }),
    grants().createIndex({ dedupeKey: 1 }, { unique: true }),
    grants().createIndex(
      { serverID: 1, guildID: 1, requestID: 1 },
      { unique: true, partialFilterExpression: { requestID: { $type: 'string' } } },
    ),
    grants().createIndex({ serverID: 1, guildID: 1, steamID64: 1, createdAt: -1 }),
    grants().createIndex({ serverID: 1, guildID: 1, status: 1, expiresAt: 1 }),
    grants().createIndex({ status: 1, sweptAt: 1, createdAt: 1 }),
    grants().createIndex(
      { onceSteamKey: 1 },
      { unique: true, partialFilterExpression: { onceSteamKey: { $type: 'string' } } },
    ),
    grants().createIndex(
      { onceDiscordKey: 1 },
      { unique: true, partialFilterExpression: { onceDiscordKey: { $type: 'string' } } },
    ),
  ]).catch((error) => {
    indexes = undefined
    throw error
  })
  return indexes
}

export class RewardsError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code)
    this.name = 'RewardsError'
  }
}
const invalid = () => new RewardsError(400, 'invalid_request')
const notFound = () => new RewardsError(404, 'reward_not_found')
async function context(serverID: string): Promise<Context> {
  const server = await prisma.gm_server.findUnique({ where: { id: serverID }, select: { id: true, guild: true } })
  if (!server) throw notFound()
  await ensureIndexes()
  return server
}
const scope = (server: Context) => ({ serverID: server.id, guildID: server.guild })
async function permitted(server: Context) {
  return hasCapability(await resolveGuildAccess(server.guild), 'rewards.rules')
}
async function assertPermitted(server: Context) {
  assertCapability(await resolveGuildAccess(server.guild), 'rewards.rules')
}
function publicRule(row: RuleDocument): RewardRule {
  return {
    id: row.id,
    revision: row.revision,
    name: row.name,
    description: row.description,
    enabled: row.enabled,
    trigger: row.trigger,
    actions: row.actions,
    pendingDays: row.pendingDays,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}
function publicGrant(row: GrantDocument): RewardGrant {
  return {
    id: row.id,
    ruleID: row.ruleID,
    ruleName: row.ruleName,
    steamID64: row.steamID64,
    discordID: row.discordID,
    actorDiscordID: row.actorDiscordID,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    expiresAt: row.expiresAt,
    reason: row.reason,
    actions: row.actions.map((action) => ({
      id: action.id,
      type: action.type,
      ...(action.amount !== undefined ? { amount: action.amount } : {}),
      ...(action.roleID !== undefined ? { roleID: action.roleID } : {}),
      status: action.status,
      reason: action.reason,
    })),
  }
}
function playerRule(row: RuleDocument): PlayerRewardRule {
  return {
    ...publicRule(row),
    actions: row.actions.map((action) => (action.type === 'lua' ? { type: 'lua' } : action)),
  }
}
function combinedStatus(actions: GrantAction[]): RewardStatus {
  if (actions.every((action) => action.status === 'delivered')) return 'delivered'
  if (actions.some((action) => action.status === 'uncertain')) return 'uncertain'
  if (actions.some((action) => action.status === 'pending')) return 'pending'
  if (actions.some((action) => action.status === 'failed')) return 'failed'
  return 'expired'
}

/** Compare-and-swap the whole bounded action list; concurrent receipts cannot overwrite one another. */
async function mutateGrant(
  server: Context,
  id: string,
  change: (row: GrantDocument) => boolean,
): Promise<GrantDocument | null> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const current = await grants().findOne({ ...scope(server), _id: id })
    if (!current) return null
    const next = { ...current, actions: current.actions.map((action) => ({ ...action })) }
    if (!change(next)) return current
    next.status = combinedStatus(next.actions)
    next.updatedAt = iso()
    const result = await grants().updateOne(
      { ...scope(server), _id: id, version: current.version },
      {
        $set: { actions: next.actions, status: next.status, updatedAt: next.updatedAt, reason: next.reason },
        $inc: { version: 1 },
      },
    )
    if (result.modifiedCount) return { ...next, version: current.version + 1 }
  }
  throw new RewardsError(409, 'reward_busy')
}

async function expirePending(server: Context) {
  const expired = await grants()
    .find({ ...scope(server), status: { $in: ['pending', 'uncertain'] }, expiresAt: { $lte: iso() } })
    .limit(100)
    .toArray()
  for (const row of expired)
    await mutateGrant(server, row.id, (grant) => {
      let changed = false
      for (const action of grant.actions)
        if (action.status === 'pending') {
          action.status = 'expired'
          action.reason = 'expired'
          changed = true
        }
      return changed
    })
}

export async function getRewardsDashboard(serverID: string): Promise<RewardsDashboard> {
  const server = await context(serverID)
  await expirePending(server)
  const [rows, integration] = await Promise.all([
    rules()
      .find({ ...scope(server), deletedAt: null })
      .sort({ createdAt: 1, _id: 1 })
      .limit(100)
      .toArray(),
    integrations().findOne({ _id: server.id, guildID: server.guild }),
  ])
  return {
    rules: rows.map(publicRule),
    integrations: integration
      ? {
          darkrp: integration.darkrp,
          pointshop: integration.pointshop,
          pointshop2: integration.pointshop2,
          updatedAt: integration.updatedAt,
        }
      : null,
  }
}

export async function createRewardRule(serverID: string, raw: unknown, actorDiscordID: string): Promise<RewardRule> {
  const parsed = RewardRuleInputSchema.safeParse(raw)
  if (!parsed.success) throw invalid()
  const server = await context(serverID)
  await assertPermitted(server)
  if ((await rules().countDocuments({ ...scope(server), deletedAt: null })) >= 100)
    throw new RewardsError(409, 'reward_rule_limit')
  const id = randomUUID(),
    now = iso()
  const row: RuleDocument = {
    ...parsed.data,
    id,
    _id: id,
    ...scope(server),
    revision: 1,
    createdAt: now,
    updatedAt: now,
    actorDiscordID,
    deletedAt: null,
  }
  await rules().insertOne(row)
  return publicRule(row)
}

export async function updateRewardRule(
  serverID: string,
  id: string,
  raw: unknown,
  actorDiscordID: string,
): Promise<RewardRule> {
  const parsed = RewardRuleSaveSchema.safeParse(raw)
  if (!parsed.success || !RewardIDSchema.safeParse(id).success) throw invalid()
  const server = await context(serverID)
  const current = await rules().findOne({ ...scope(server), _id: id, deletedAt: null })
  if (!current) throw notFound()
  // Disabling the unchanged saved rule remains possible after Premium expires.
  const previousInput = RewardRuleInputSchema.parse({
    name: current.name,
    description: current.description,
    enabled: current.enabled,
    trigger: current.trigger,
    actions: current.actions,
    pendingDays: current.pendingDays,
    startsAt: current.startsAt,
    endsAt: current.endsAt,
  })
  const disable =
    !parsed.data.rule.enabled &&
    JSON.stringify({ ...parsed.data.rule, enabled: current.enabled }) === JSON.stringify(previousInput)
  if (!disable) await assertPermitted(server)
  const result = await rules().updateOne(
    { ...scope(server), _id: id, deletedAt: null, revision: parsed.data.revision },
    {
      $set: { ...parsed.data.rule, updatedAt: iso(), actorDiscordID },
      $inc: { revision: 1 },
    },
  )
  if (!result.modifiedCount) throw new RewardsError(409, 'conflict')
  return publicRule((await rules().findOne({ _id: id, ...scope(server) }))!)
}

export async function deleteRewardRule(
  serverID: string,
  id: string,
  revision: number,
  actorDiscordID: string,
): Promise<{ success: true }> {
  if (!RewardIDSchema.safeParse(id).success || !Number.isSafeInteger(revision) || revision < 1) throw invalid()
  const server = await context(serverID)
  const result = await rules().updateOne(
    { ...scope(server), _id: id, deletedAt: null, revision },
    {
      $set: { enabled: false, deletedAt: iso(), updatedAt: iso(), actorDiscordID },
      $inc: { revision: 1 },
    },
  )
  if (!result.modifiedCount) {
    if (!(await rules().findOne({ ...scope(server), _id: id, deletedAt: null }))) throw notFound()
    throw new RewardsError(409, 'conflict')
  }
  return { success: true }
}

export async function getRewardHistory(serverID: string, raw: unknown = {}): Promise<RewardHistory> {
  const parsed = RewardHistoryQuerySchema.safeParse(raw)
  if (!parsed.success) throw invalid()
  const server = await context(serverID)
  await expirePending(server)
  const { page, pageSize, ...filters } = parsed.data
  const query = { ...scope(server), ...filters }
  const total = await grants().countDocuments(query)
  const currentPage = Math.max(1, Math.min(page, Math.ceil(total / pageSize)))
  const rows = await grants()
    .find(query)
    .sort({ createdAt: -1, _id: -1 })
    .skip((currentPage - 1) * pageSize)
    .limit(pageSize)
    .toArray()
  return { items: rows.map(publicGrant), total, page: currentPage, pageSize }
}

async function playerFacts(server: Context, steamID64: string) {
  if (!RewardSteamIDSchema.safeParse(steamID64).success) throw invalid()
  if (await isErasureBlocked(undefined, steamID64)) throw new RewardsError(404, 'player_unavailable')
  const [user, statistics] = await Promise.all([
    getUserFromSteamID64(steamID64),
    prisma.gm_server_stat.findUnique({
      where: { server_id_steam_id: { server_id: server.id, steam_id: steamID64 } },
      select: { total_time: true },
    }),
  ])
  if (await isErasureBlocked(user?.discordID, steamID64)) throw new RewardsError(404, 'player_unavailable')
  return { discordID: user?.discordID ?? null, playedSeconds: Math.max(0, statistics?.total_time ?? 0) }
}
const activeReason = (rule: RewardRule) =>
  !rule.enabled
    ? 'disabled'
    : rule.startsAt && Date.parse(rule.startsAt) > Date.now()
      ? 'not_started'
      : rule.endsAt && Date.parse(rule.endsAt) <= Date.now()
        ? 'ended'
        : null
async function missingIntegrations(server: Context, rule: RewardRule): Promise<string[]> {
  const detected = await integrations().findOne({ _id: server.id, guildID: server.guild })
  const fresh = detected && Date.parse(detected.updatedAt) >= Date.now() - 120_000
  const missing = new Set<string>()
  for (const action of rule.actions) {
    const dependency =
      action.type === 'darkrp_money'
        ? 'darkrp'
        : action.type === 'pointshop_points'
          ? 'pointshop'
          : action.type === 'pointshop2_points'
            ? 'pointshop2'
            : null
    if (dependency && (!fresh || !detected[dependency])) missing.add(dependency)
  }
  return [...missing]
}
async function eligible(server: Context, rule: RuleDocument, steamID64: string): Promise<RewardSimulation> {
  const facts = await playerFacts(server, steamID64)
  const identity =
    rule.trigger.type === 'vote'
      ? { discordID: facts.discordID }
      : { $or: [{ steamID64 }, { discordID: facts.discordID }] }
  const previous = await grants().findOne(
    { ...scope(server), ruleID: rule.id, ...identity },
    { sort: { triggerAt: -1 } },
  )
  let reason: string | null = activeReason(rule)
  if (!reason && !(await permitted(server))) reason = 'entitlement_unavailable'
  if (!reason && !facts.discordID) reason = 'account_not_linked'
  if (!reason && rule.trigger.type !== 'vote' && rule.trigger.type !== 'manual' && previous) reason = 'already_received'
  if (!reason && rule.trigger.type === 'playtime' && facts.playedSeconds < rule.trigger.seconds)
    reason = 'playtime_required'
  if (!reason && rule.trigger.type === 'vote') {
    const vote = facts.discordID
      ? await prisma.gm_server_vote.findFirst({
          where: {
            serverID: server.id,
            userID: facts.discordID,
            createdAt: { gte: new Date(rule.createdAt), lte: new Date() },
          },
          orderBy: { createdAt: 'desc' },
        })
      : null
    if (!vote) reason = 'vote_required'
    else if (
      previous &&
      Date.parse(previous.triggerAt) + rule.trigger.cooldownSeconds * 1000 > vote.createdAt.getTime()
    )
      reason = 'cooldown'
  }
  return {
    eligible: !reason,
    reason,
    linked: !!facts.discordID,
    playedSeconds: facts.playedSeconds,
    requiredSeconds: rule.trigger.type === 'playtime' ? rule.trigger.seconds : null,
    alreadyReceived: !!previous,
    missingIntegrations: await missingIntegrations(server, rule),
  }
}
export async function simulateReward(serverID: string, ruleID: string, steamID64: string): Promise<RewardSimulation> {
  if (!RewardIDSchema.safeParse(ruleID).success) throw invalid()
  const server = await context(serverID)
  const rule = await rules().findOne({ ...scope(server), _id: ruleID, deletedAt: null })
  if (!rule) throw notFound()
  return eligible(server, rule, steamID64)
}

async function insertGrant(
  server: Context,
  rule: RuleDocument,
  steamID64: string,
  discordID: string,
  event: string,
  triggerAt: string,
  actorDiscordID: string | null = null,
  reason: string | null = null,
  requestID: string | null = null,
  requestRevision: number | null = null,
) {
  if (await isErasureBlocked(discordID, steamID64)) return null
  const id = randomUUID(),
    now = iso()
  // A saved vote cannot be redeemed again by changing the Discord account's Steam link.
  const prefix = `${server.id}:${server.guild}:${rule.id}`
  const dedupeKey = event.startsWith('vote:') ? `${prefix}:${event}` : `${prefix}:${steamID64}:${event}`
  const row: GrantDocument = {
    _id: id,
    id,
    ...scope(server),
    ruleID: rule.id,
    ruleName: rule.name,
    steamID64,
    discordID,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    expiresAt: new Date(Date.parse(triggerAt) + rule.pendingDays * DAY).toISOString(),
    reason,
    dedupeKey,
    deliveryToken: randomUUID(),
    version: 1,
    triggerAt,
    actorDiscordID,
    requestID,
    requestRevision,
    sweptAt: null,
    onceSteamKey: event === 'once' ? `${prefix}:${steamID64}` : null,
    onceDiscordKey: event === 'once' ? `${prefix}:${discordID}` : null,
    actions: rule.actions.map((action) => ({
      ...action,
      id: randomUUID(),
      status: 'pending',
      reason: null,
      attemptedAt: null,
    })),
  }
  try {
    await grants().updateOne({ dedupeKey }, { $setOnInsert: row }, { upsert: true })
  } catch (error) {
    if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 11000) throw error
  }
  if (await isErasureBlocked(discordID, steamID64)) {
    await grants().deleteMany({ ...scope(server), steamID64 })
    return null
  }
  return (
    (await grants().findOne({ dedupeKey })) ?? (requestID ? grants().findOne({ ...scope(server), requestID }) : null)
  )
}

/** Reconcile durable source facts, including accepted votes missed by a crashed event handler. */
export async function reconcilePlayerRewards(serverID: string, steamID64: string): Promise<void> {
  const server = await context(serverID)
  const active = await rules()
    .find({ ...scope(server), enabled: true, deletedAt: null })
    .limit(100)
    .toArray()
  if (!active.length || !(await permitted(server))) return
  await reconcilePlayer(server, active, steamID64, Date.now() + 10_000)
}
async function reconcilePlayer(server: Context, active: RuleDocument[], steamID64: string, deadline: number) {
  const facts = await playerFacts(server, steamID64)
  if (!facts.discordID) return
  for (const rule of active) {
    if (Date.now() >= deadline) break
    if (activeReason(rule) || rule.trigger.type === 'manual') continue
    if (rule.trigger.type === 'playtime' && facts.playedSeconds < rule.trigger.seconds) continue
    if (rule.trigger.type !== 'vote') {
      await insertGrant(server, rule, steamID64, facts.discordID, 'once', iso())
      continue
    }
    const since = Math.max(
      Date.parse(rule.createdAt),
      rule.startsAt ? Date.parse(rule.startsAt) : 0,
      Date.now() - rule.pendingDays * DAY,
    )
    const votes = await prisma.gm_server_vote.findMany({
      where: { serverID: server.id, userID: facts.discordID, createdAt: { gte: new Date(since), lte: new Date() } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 256,
    })
    const previous = await grants().findOne(
      { ...scope(server), ruleID: rule.id, discordID: facts.discordID },
      { sort: { triggerAt: -1 } },
    )
    let lastAt = previous ? Date.parse(previous.triggerAt) : -Infinity
    for (const vote of votes) {
      if (vote.createdAt.getTime() < lastAt + rule.trigger.cooldownSeconds * 1000) continue
      const saved = await insertGrant(
        server,
        rule,
        steamID64,
        facts.discordID,
        `vote:${vote.id}`,
        vote.createdAt.toISOString(),
      )
      if (saved) lastAt = vote.createdAt.getTime()
    }
  }
}

export async function grantManualReward(
  serverID: string,
  ruleID: string,
  raw: unknown,
  actorDiscordID: string,
): Promise<RewardGrant> {
  const parsed = RewardManualGrantSchema.safeParse(raw)
  if (!parsed.success || !RewardIDSchema.safeParse(ruleID).success) throw invalid()
  const server = await context(serverID)
  await assertPermitted(server)
  const existing = await grants().findOne({ ...scope(server), requestID: parsed.data.requestID })
  if (existing) {
    if (
      existing.ruleID !== ruleID ||
      existing.steamID64 !== parsed.data.steamID64 ||
      existing.actorDiscordID !== actorDiscordID ||
      existing.requestRevision !== parsed.data.revision ||
      existing.reason !== parsed.data.reason
    )
      throw new RewardsError(409, 'idempotency_conflict')
    if (await isErasureBlocked(existing.discordID, existing.steamID64))
      throw new RewardsError(404, 'player_unavailable')
    return publicGrant(existing)
  }
  const rule = await rules().findOne({ ...scope(server), _id: ruleID, deletedAt: null })
  if (!rule) throw notFound()
  if (rule.revision !== parsed.data.revision) throw new RewardsError(409, 'conflict')
  const simulation = await eligible(server, rule, parsed.data.steamID64)
  if (!simulation.eligible) throw new RewardsError(409, simulation.reason ?? 'not_eligible')
  const facts = await playerFacts(server, parsed.data.steamID64)
  if (!facts.discordID) throw new RewardsError(409, 'account_not_linked')
  // A manual grant of an automatic one-shot rule shares its normal deduplication boundary.
  const event =
    rule.trigger.type === 'manual' ? `manual:${parsed.data.requestID}` : rule.trigger.type === 'vote' ? null : 'once'
  if (!event) throw new RewardsError(409, 'vote_required')
  const result = await insertGrant(
    server,
    rule,
    parsed.data.steamID64,
    facts.discordID,
    event,
    iso(),
    actorDiscordID,
    parsed.data.reason,
    parsed.data.requestID,
    parsed.data.revision,
  )
  if (!result) throw new RewardsError(404, 'player_unavailable')
  if (
    result.ruleID !== ruleID ||
    result.steamID64 !== parsed.data.steamID64 ||
    result.actorDiscordID !== actorDiscordID ||
    result.requestID !== parsed.data.requestID ||
    result.requestRevision !== parsed.data.revision ||
    result.reason !== parsed.data.reason
  )
    throw new RewardsError(409, 'idempotency_conflict')
  return publicGrant(result)
}

export async function getPlayerRewards(serverID: string, steamID64: string): Promise<PlayerRewards> {
  const server = await context(serverID)
  await playerFacts(server, steamID64)
  await expirePending(server)
  const rows = await rules()
    .find({ ...scope(server), deletedAt: null, enabled: true })
    .sort({ createdAt: 1 })
    .limit(100)
    .toArray()
  const history = await grants()
    .find({ ...scope(server), steamID64 })
    .sort({ createdAt: -1 })
    .limit(50)
    .toArray()
  const rewards = []
  for (const rule of rows) rewards.push({ rule: playerRule(rule), simulation: await eligible(server, rule, steamID64) })
  if (await isErasureBlocked(undefined, steamID64)) throw new RewardsError(404, 'player_unavailable')
  return { rewards, history: history.map(publicGrant) }
}

async function deliveryAuthorized(server: Context, row: GrantDocument) {
  if (row.guildID !== server.guild || Date.parse(row.expiresAt) <= Date.now()) return false
  const access = await resolveGuildAccess(server.guild)
  if (!hasCapability(access, 'rewards.rules')) {
    if (access.state === 'unknown') throw new RewardsError(503, 'entitlement_unavailable')
    return false
  }
  const [rule, facts] = await Promise.all([
    rules().findOne({ ...scope(server), _id: row.ruleID, deletedAt: null }),
    playerFacts(server, row.steamID64),
  ])
  return !!rule && !activeReason(rule) && facts.discordID === row.discordID
}
export async function authorizeDiscordRewardAction(input: DiscordRewardAction): Promise<boolean> {
  try {
    const server = await context(input.serverID)
    const row = await grants().findOne({
      ...scope(server),
      _id: input.grantID,
      steamID64: input.steamID64,
      discordID: input.discordID,
    })
    if (!row || !(await deliveryAuthorized(server, row))) return false
    return row.actions.some(
      (action) =>
        action.id === input.actionID &&
        action.type === 'discord_role' &&
        action.roleID === input.roleID &&
        ['pending', 'uncertain'].includes(action.status),
    )
  } catch (error) {
    // Only a confirmed absent/erased subject is a denial. Provider failures stay retryable.
    if (error instanceof RewardsError && error.status === 404) return false
    throw error
  }
}

export async function processPendingDiscordRewards(
  serverID: string,
  deliverRole: RoleDelivery = enqueueDiscordRewardRole,
): Promise<void> {
  const server = await context(serverID)
  await expirePending(server)
  if (!(await permitted(server))) return
  const pending = await grants()
    .find({
      ...scope(server),
      status: { $in: ['pending', 'uncertain'] },
      expiresAt: { $gt: iso() },
      'actions.type': 'discord_role',
    })
    .sort({ createdAt: 1 })
    .limit(20)
    .toArray()
  for (const row of pending) {
    if (!(await deliveryAuthorized(server, row)) || !row.discordID) continue
    for (const action of row.actions) {
      if (action.type !== 'discord_role' || !action.roleID) continue
      let claimed = false
      await mutateGrant(server, row.id, (grant) => {
        claimed = false
        const current = grant.actions.find((item) => item.id === action.id)!
        if (
          !['pending', 'uncertain'].includes(current.status) ||
          (current.attemptedAt && Date.parse(current.attemptedAt) > Date.now() - 30_000)
        )
          return false
        current.status = 'uncertain'
        current.reason = 'execution_uncertain'
        current.attemptedAt = iso()
        claimed = true
        return true
      })
      if (!claimed) continue
      let result: Awaited<ReturnType<RoleDelivery>>
      try {
        result = await deliverRole({
          serverID,
          grantID: row.id,
          actionID: action.id,
          steamID64: row.steamID64,
          discordID: row.discordID,
          roleID: action.roleID,
        })
      } catch {
        result = { status: 'uncertain', reason: 'discord_unavailable' }
      }
      await mutateGrant(server, row.id, (grant) => {
        const current = grant.actions.find((item) => item.id === action.id)!
        if (current.status === 'delivered') return false
        current.status = result.status
        current.reason = result.reason?.slice(0, 64) ?? null
        return true
      })
    }
  }
}

export async function pollRewards(serverID: string, raw: unknown): Promise<{ deliveries: RewardDelivery[] }> {
  const parsed = RewardPollSchema.safeParse(raw)
  if (!parsed.success) throw invalid()
  const server = await context(serverID)
  await integrations().updateOne(
    { _id: server.id },
    { $set: { ...parsed.data.integrations, guildID: server.guild, updatedAt: iso() } },
    { upsert: true },
  )
  await expirePending(server)
  if (!(await permitted(server))) return { deliveries: [] }
  const active = await rules()
    .find({ ...scope(server), enabled: true, deletedAt: null })
    .limit(100)
    .toArray()
  const deadline = Date.now() + 8_000
  for (let offset = 0; offset < parsed.data.players.length && Date.now() < deadline; offset += 4) {
    const results = await Promise.allSettled(
      parsed.data.players.slice(offset, offset + 4).map(async (steamID64) => {
        if (!(await isErasureBlocked(undefined, steamID64))) await reconcilePlayer(server, active, steamID64, deadline)
      }),
    )
    for (const result of results)
      if (
        result.status === 'rejected' &&
        !(result.reason instanceof RewardsError && result.reason.code === 'player_unavailable')
      )
        throw result.reason
  }
  const pending = await grants()
    .find({
      ...scope(server),
      steamID64: { $in: parsed.data.players },
      status: { $in: ['pending', 'uncertain'] },
      expiresAt: { $gt: iso() },
    })
    .sort({ createdAt: 1 })
    .limit(30)
    .toArray()
  const deliveries: RewardDelivery[] = []
  for (const row of pending) {
    if (deliveries.length >= 10) break
    if (!(await deliveryAuthorized(server, row))) continue
    const gameActions = row.actions.filter(
      (action) => action.type !== 'discord_role' && ['pending', 'uncertain'].includes(action.status),
    )
    if (!gameActions.length) continue
    const canDispatch = gameActions.some((action) => {
      if (action.type === 'lua') return true
      const integration =
        action.type === 'darkrp_money' ? 'darkrp' : action.type === 'pointshop_points' ? 'pointshop' : 'pointshop2'
      return parsed.data.integrations[integration] || action.status === 'uncertain'
    })
    if (!canDispatch) continue
    const eligibleActions = gameActions
    const dispatched = await mutateGrant(server, row.id, (grant) => {
      for (const action of grant.actions)
        if (eligibleActions.some((item) => item.id === action.id) && action.status === 'pending') {
          // Once exposed to the addon, only its durable journal can resolve the outcome.
          action.status = 'uncertain'
          action.reason = 'execution_uncertain'
          action.attemptedAt = iso()
        }
      return true
    })
    if (!dispatched || (await isErasureBlocked(row.discordID, row.steamID64))) continue
    deliveries.push({
      id: row.id,
      token: row.deliveryToken,
      steamID64: row.steamID64,
      ruleName: row.ruleName,
      expiresAt: Math.floor(Date.parse(row.expiresAt) / 1000),
      actions: eligibleActions.map((action) =>
        action.type === 'lua'
          ? { id: action.id, type: 'lua', code: action.code! }
          : {
              id: action.id,
              type: action.type as 'darkrp_money' | 'pointshop_points' | 'pointshop2_points',
              amount: action.amount!,
            },
      ),
    })
  }
  return RewardPollResponseSchema.parse({ deliveries })
}

export async function acknowledgeRewards(serverID: string, raw: unknown): Promise<{ success: true }> {
  const parsed = RewardAckSchema.safeParse(raw)
  if (!parsed.success) throw invalid()
  const server = await context(serverID)
  const row = await grants().findOne({ ...scope(server), _id: parsed.data.id, deliveryToken: parsed.data.token })
  if (!row) throw notFound()
  if (
    parsed.data.results.some(
      (result) => !row.actions.some((action) => action.id === result.id && action.type !== 'discord_role'),
    )
  )
    throw invalid()
  await mutateGrant(server, row.id, (grant) => {
    let changed = false
    for (const result of parsed.data.results) {
      const action = grant.actions.find((item) => item.id === result.id)!
      // Terminal success is immutable; a duplicate or late failure receipt cannot undo it.
      if (action.status === 'delivered' || action.status === 'expired' || action.status === 'failed') continue
      if (!action.attemptedAt) throw invalid()
      action.status = result.status
      action.reason = result.reason ?? null
      changed = true
    }
    return changed
  })
  return { success: true }
}

/** A bounded background pass also delivers Discord-only rewards while the game server is offline. */
export async function sweepPendingRewards(): Promise<void> {
  await ensureIndexes()
  const pending = await grants()
    .find({ status: { $in: ['pending', 'uncertain'] } })
    .sort({ sweptAt: 1, createdAt: 1 })
    .limit(100)
    .toArray()
  const servers = [...new Set(pending.map((row) => row.serverID))].slice(0, 25)
  for (const serverID of servers) {
    try {
      await processPendingDiscordRewards(serverID)
      await grants().updateMany({ serverID, status: { $in: ['pending', 'uncertain'] } }, { $set: { sweptAt: iso() } })
    } catch {
      /* A provider failure for one server must not stall other communities. */
    }
  }
}
