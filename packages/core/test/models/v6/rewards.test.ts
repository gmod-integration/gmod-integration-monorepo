import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  collections: new Map<string, Map<string, any>>(),
  premium: true,
  accessState: 'ready' as 'ready' | 'unknown',
  erased: false,
  user: { discordID: '123456789012345678' } as { discordID: string } | null,
  playedSeconds: 0,
  votes: [] as { id: number; createdAt: Date }[],
  role: vi.fn(),
  server: vi.fn(),
  privacy: vi.fn(),
  statistics: vi.fn(),
  beforeRead: vi.fn(),
  beforeWrite: vi.fn(),
  createIndex: vi.fn(),
  indexes: [] as unknown[],
}))

vi.mock('@gmod/infra-prisma', () => ({
  default: {
    gm_server: { findUnique: state.server },
    gm_server_stat: { findUnique: state.statistics },
    gm_server_vote: {
      findMany: async ({ where }: any) => state.votes.filter((vote) => vote.createdAt >= where.createdAt.gte),
      findFirst: async ({ where }: any) =>
        [...state.votes].filter((vote) => vote.createdAt >= where.createdAt.gte).at(-1) ?? null,
    },
  },
}))
vi.mock('@gmod/domain-user/User.js', () => ({ getUserFromSteamID64: async () => state.user }))
vi.mock('@gmod/domain-user/privacy.js', () => ({ isErasureBlocked: state.privacy }))
vi.mock('@gmod/domain-access/index.js', () => ({
  resolveGuildAccess: async () => ({ premium: state.premium, state: state.accessState }),
  hasCapability: (access: any) => access.premium,
  assertCapability: (access: any) => {
    if (!access.premium) throw Object.assign(new Error('Access denied'), { status: 403 })
  },
}))
vi.mock('@gmod/infra-bullmq/discordQueueAdapters.js', () => ({ enqueueDiscordRewardRole: state.role }))
vi.mock('@gmod/infra-mongo', () => {
  const values = (row: any, path: string): any[] =>
    path.split('.').reduce<any[]>(
      (rows, part) =>
        rows.flatMap((item) => {
          const value = item?.[part]
          return Array.isArray(value) ? value : [value]
        }),
      [row],
    )
  const matches = (row: any, query: any): boolean =>
    Object.entries(query).every(([key, expected]: any) => {
      if (key === '$or') return expected.some((candidate: any) => matches(row, candidate))
      const found = values(row, key)
      if (expected && typeof expected === 'object' && !Array.isArray(expected))
        return found.some((value) =>
          Object.entries(expected).every(([operator, limit]: any) => {
            if (operator === '$in') return limit.includes(value)
            if (operator === '$gt') return value > limit
            if (operator === '$gte') return value >= limit
            if (operator === '$lte') return value <= limit
            return value === expected
          }),
        )
      return found.some((value) => value === expected || (expected === null && value == null))
    })
  const collection = (name: string) => {
    let store = state.collections.get(name)
    if (!store) {
      store = new Map()
      state.collections.set(name, store)
    }
    const cursor = (query: any) => {
      let order: any = {},
        offset = 0,
        limit = Infinity
      return {
        sort(spec: any) {
          order = spec
          return this
        },
        skip(value: number) {
          offset = value
          return this
        },
        limit(value: number) {
          limit = value
          return this
        },
        async toArray() {
          return [...store!.values()]
            .filter((row) => matches(row, query))
            .sort((left, right) => {
              for (const [key, direction] of Object.entries(order) as [string, number][]) {
                const a = values(left, key)[0] ?? '',
                  b = values(right, key)[0] ?? ''
                if (a !== b) return (a < b ? -1 : 1) * direction
              }
              return 0
            })
            .slice(offset, offset + limit)
            .map((row) => structuredClone(row))
        },
      }
    }
    const update = async (query: any, mutation: any, options: any = {}) => {
      const override = await state.beforeWrite(name, query, mutation, options)
      if (override !== undefined) return override
      const row = [...store!.values()].find((candidate) => matches(candidate, query))
      if (!row) {
        if (!options.upsert) return { modifiedCount: 0 }
        const inserted = { ...query, ...mutation.$setOnInsert, ...mutation.$set }
        if (
          [...store!.values()].some(
            (candidate) =>
              candidate._id === inserted._id ||
              (inserted.dedupeKey && candidate.dedupeKey === inserted.dedupeKey) ||
              (inserted.onceSteamKey && candidate.onceSteamKey === inserted.onceSteamKey) ||
              (inserted.onceDiscordKey && candidate.onceDiscordKey === inserted.onceDiscordKey) ||
              (inserted.requestID &&
                candidate.serverID === inserted.serverID &&
                candidate.guildID === inserted.guildID &&
                candidate.requestID === inserted.requestID),
          )
        )
          throw Object.assign(new Error('duplicate'), { code: 11000 })
        store!.set(inserted._id, structuredClone(inserted))
        return { modifiedCount: 0, upsertedCount: 1 }
      }
      Object.assign(row, structuredClone(mutation.$set ?? {}))
      for (const [key, value] of Object.entries(mutation.$inc ?? {}) as [string, number][])
        row[key] = (row[key] ?? 0) + value
      return { modifiedCount: 1 }
    }
    return {
      createIndex: async (...input: unknown[]) => {
        await state.createIndex()
        state.indexes.push(input)
        return 'index'
      },
      find: cursor,
      findOne: async (query: any, options?: any) => {
        await state.beforeRead(name, query)
        return (
          (
            await cursor(query)
              .sort(options?.sort ?? {})
              .limit(1)
              .toArray()
          )[0] ?? null
        )
      },
      countDocuments: async (query: any) => [...store!.values()].filter((row) => matches(row, query)).length,
      insertOne: async (row: any) => {
        store!.set(row._id, structuredClone(row))
        return { insertedId: row._id }
      },
      updateOne: update,
      updateMany: async (query: any, mutation: any) => {
        for (const row of [...store!.values()].filter((candidate) => matches(candidate, query)))
          await update({ _id: row._id }, mutation)
      },
      deleteMany: async (query: any) => {
        for (const row of store!.values()) if (matches(row, query)) store!.delete(row._id)
      },
    }
  }
  return { mongoClient: { db: () => ({ collection }) } }
})

const rewards = await import('../../../src/models/v6/rewards.js')
const { RewardDeliverySchema, RewardRuleInputSchema, RewardGrantSchema, PlayerRewardsSchema } =
  await import('@gmod/schema/server/RewardsSchema.js')
const steam = '76561198012345678',
  discord = '123456789012345678',
  actor = '234567890123456789'
const requestID = '90000000-0000-4000-8000-000000000001'
const now = new Date('2026-11-24T12:00:00Z')
const basicRule = (patch: Record<string, unknown> = {}) => ({
  name: 'Welcome',
  description: 'Link your account',
  enabled: true,
  trigger: { type: 'verification' },
  actions: [{ type: 'darkrp_money', amount: 5000 }],
  pendingDays: 7,
  startsAt: null,
  endsAt: null,
  ...patch,
})
const docs = (name = 'gm_reward_grants') => [...(state.collections.get(name)?.values() ?? [])]
const poll = (darkrp = true) =>
  rewards.pollRewards('s1', { integrations: { darkrp, pointshop: false, pointshop2: false }, players: [steam] })
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(now)
  state.collections.forEach((store) => store.clear())
  state.premium = true
  state.accessState = 'ready'
  state.erased = false
  state.user = { discordID: discord }
  state.playedSeconds = 0
  state.votes = []
  state.server
    .mockReset()
    .mockImplementation(async ({ where }: any) => ({ id: where.id, guild: where.id === 's2' ? 'g2' : 'g1' }))
  state.role.mockReset().mockResolvedValue({ status: 'delivered' })
  state.privacy.mockReset().mockImplementation(async () => state.erased)
  state.statistics.mockReset().mockImplementation(async () => ({ total_time: state.playedSeconds }))
  state.beforeRead.mockReset()
  state.beforeWrite.mockReset()
  state.createIndex.mockReset()
})
afterEach(() => vi.useRealTimers())

describe('reward rules and eligibility', () => {
  it('retries index initialization after a transient storage failure', async () => {
    const unavailable = new Error('Index storage unavailable')
    state.createIndex.mockRejectedValueOnce(unavailable)
    await expect(rewards.getRewardsDashboard('s1')).rejects.toBe(unavailable)
    await expect(rewards.createRewardRule('s1', basicRule(), actor)).resolves.toMatchObject({ revision: 1 })
    expect((await rewards.getRewardsDashboard('s1')).rules).toHaveLength(1)
  })
  it('rejects undeclared action types, invalid amounts, duplicate transport identities and control characters', () => {
    for (const patch of [
      { name: 'Hello\nWorld' },
      { actions: [{ type: 'console', command: 'unexpected_command' }] },
      { actions: [{ type: 'darkrp_money', amount: -1 }] },
      { trigger: { type: 'vote', cooldownSeconds: 1 } },
      { startsAt: '2026-11-25T00:00:00Z', endsAt: '2026-11-24T00:00:00Z' },
    ])
      expect(RewardRuleInputSchema.safeParse(basicRule(patch)).success).toBe(false)
  })

  it.each(['', ' \n\t', 'return\0 true', 'x'.repeat(16_385)])(
    'rejects blank, NUL-containing or oversized Lua sources',
    (code) => {
      expect(RewardRuleInputSchema.safeParse(basicRule({ actions: [{ type: 'lua', code }] })).success).toBe(false)
    },
  )

  it('preserves multiline Lua source exactly and rejects unexpected action fields', () => {
    const code = '\n\tlocal amount = 5000\nply:addMoney(amount)\n'
    const parsed = RewardRuleInputSchema.parse(basicRule({ actions: [{ type: 'lua', code }] }))
    expect(parsed.actions[0]).toEqual({ type: 'lua', code })
    expect(RewardRuleInputSchema.safeParse(basicRule({ actions: [{ type: 'lua', code, amount: 500 }] })).success).toBe(
      false,
    )
  })

  it('scopes persisted rules to the current community and enforces Premium on creation', async () => {
    const rule = await rewards.createRewardRule('s1', basicRule(), actor)
    expect((await rewards.getRewardsDashboard('s1')).rules).toEqual([rule])
    expect((await rewards.getRewardsDashboard('s2')).rules).toEqual([])
    await expect(rewards.simulateReward('s2', rule.id, steam)).rejects.toMatchObject({ status: 404 })
    state.premium = false
    await expect(rewards.createRewardRule('s1', basicRule(), actor)).rejects.toMatchObject({ status: 403 })
    expect((await rewards.getRewardsDashboard('s1')).rules).toHaveLength(1)
  })

  it('uses revisions to prevent stale overwrites and permits disabling after entitlement expires', async () => {
    const rule = await rewards.createRewardRule('s1', basicRule(), actor)
    const updated = await rewards.updateRewardRule(
      's1',
      rule.id,
      { revision: 1, rule: basicRule({ name: 'Changed' }) },
      actor,
    )
    expect(updated.revision).toBe(2)
    await expect(
      rewards.updateRewardRule('s1', rule.id, { revision: 1, rule: basicRule() }, actor),
    ).rejects.toMatchObject({ code: 'conflict' })
    state.premium = false
    const disabled = await rewards.updateRewardRule(
      's1',
      rule.id,
      { revision: 2, rule: basicRule({ name: 'Changed', enabled: false }) },
      actor,
    )
    expect(disabled.enabled).toBe(false)
    await expect(
      rewards.updateRewardRule(
        's1',
        rule.id,
        { revision: 3, rule: basicRule({ enabled: false, name: 'Other' }) },
        actor,
      ),
    ).rejects.toMatchObject({ status: 403 })
    expect(await rewards.deleteRewardRule('s1', rule.id, 3, actor)).toEqual({ success: true })
  })

  it('simulates eligibility without creating grants, including missing links, playtime and integrations', async () => {
    const rule = await rewards.createRewardRule(
      's1',
      basicRule({ trigger: { type: 'playtime', seconds: 3600 } }),
      actor,
    )
    expect(await rewards.simulateReward('s1', rule.id, steam)).toMatchObject({
      eligible: false,
      reason: 'playtime_required',
      missingIntegrations: ['darkrp'],
    })
    state.playedSeconds = 3600
    expect(await rewards.simulateReward('s1', rule.id, steam)).toMatchObject({ eligible: true, requiredSeconds: 3600 })
    state.user = null
    expect(await rewards.simulateReward('s1', rule.id, steam)).toMatchObject({
      eligible: false,
      reason: 'account_not_linked',
    })
    expect(docs()).toHaveLength(0)
  })

  it('deduplicates a welcome reward across concurrent reconciliation and relinking to another Discord identity', async () => {
    await rewards.createRewardRule('s1', basicRule(), actor)
    await Promise.all([rewards.reconcilePlayerRewards('s1', steam), rewards.reconcilePlayerRewards('s1', steam)])
    expect(docs()).toHaveLength(1)
    state.user = { discordID: '345678901234567890' }
    await rewards.reconcilePlayerRewards('s1', steam)
    expect(docs()).toHaveLength(1)
    expect((await poll()).deliveries).toHaveLength(0)
  })

  it('also prevents farming a welcome reward by moving the same Discord identity between Steam accounts', async () => {
    const rule = await rewards.createRewardRule('s1', basicRule(), actor)
    await rewards.reconcilePlayerRewards('s1', steam)
    await rewards.reconcilePlayerRewards('s1', '76561198087654321')
    expect(docs()).toHaveLength(1)
    expect(await rewards.simulateReward('s1', rule.id, '76561198087654321')).toMatchObject({
      eligible: false,
      reason: 'already_received',
    })
  })

  it('binds every accepted vote to its original recipient across Steam relinking', async () => {
    const rule = await rewards.createRewardRule(
      's1',
      basicRule({ trigger: { type: 'vote', cooldownSeconds: 10800 } }),
      actor,
    )
    state.votes = [{ id: 77, createdAt: now }]
    await rewards.reconcilePlayerRewards('s1', steam)
    await rewards.reconcilePlayerRewards('s1', '76561198087654321')
    expect(docs()).toHaveLength(1)
    expect(docs()[0].steamID64).toBe(steam)
    expect(await rewards.simulateReward('s1', rule.id, '76561198087654321')).toMatchObject({
      eligible: false,
      reason: 'cooldown',
    })
  })

  it('reconciles only persisted votes and applies the rule rolling cooldown without duplicating older votes', async () => {
    await rewards.createRewardRule('s1', basicRule({ trigger: { type: 'vote', cooldownSeconds: 21600 } }), actor)
    expect((await poll()).deliveries).toHaveLength(0)
    state.votes = [0, 3, 6].map((hours, id) => ({ id: id + 1, createdAt: new Date(now.getTime() + hours * 3600_000) }))
    vi.setSystemTime(new Date(now.getTime() + 7 * 3600_000))
    await rewards.reconcilePlayerRewards('s1', steam)
    await rewards.reconcilePlayerRewards('s1', steam)
    expect(docs()).toHaveLength(2)
    expect(docs().map((row) => row.dedupeKey)).toEqual([
      expect.stringContaining('vote:1'),
      expect.stringContaining('vote:3'),
    ])
  })

  it('returns the same accepted manual grant on retry and rejects reuse for another target or reason', async () => {
    const rule = await rewards.createRewardRule('s1', basicRule({ trigger: { type: 'manual' } }), actor)
    const input = { revision: 1, steamID64: steam, reason: 'Tournament winner', requestID }
    const grant = await rewards.grantManualReward('s1', rule.id, input, actor)
    expect(await rewards.grantManualReward('s1', rule.id, input, actor)).toEqual(grant)
    expect(grant.actorDiscordID).toBe(actor)
    await expect(
      rewards.grantManualReward('s1', rule.id, { ...input, reason: 'Other reason' }, actor),
    ).rejects.toMatchObject({ code: 'idempotency_conflict' })
    expect(docs()).toHaveLength(1)
  })

  it('preserves one-shot manual grant acknowledgement even if the rule is disabled after acceptance', async () => {
    const rule = await rewards.createRewardRule('s1', basicRule(), actor)
    const input = { revision: 1, steamID64: steam, reason: 'Welcome', requestID }
    const first = await rewards.grantManualReward('s1', rule.id, input, actor)
    await rewards.updateRewardRule('s1', rule.id, { revision: 1, rule: basicRule({ enabled: false }) }, actor)
    expect((await rewards.grantManualReward('s1', rule.id, input, actor)).id).toBe(first.id)
  })

  it('rejects a new manual attribution if its confirmed rule contents have changed', async () => {
    const rule = await rewards.createRewardRule('s1', basicRule({ trigger: { type: 'manual' } }), actor)
    await rewards.updateRewardRule(
      's1',
      rule.id,
      {
        revision: 1,
        rule: basicRule({ trigger: { type: 'manual' }, actions: [{ type: 'darkrp_money', amount: 9999 }] }),
      },
      actor,
    )
    await expect(
      rewards.grantManualReward(
        's1',
        rule.id,
        { revision: 1, steamID64: steam, reason: 'Confirmed 5000 only', requestID },
        actor,
      ),
    ).rejects.toMatchObject({ code: 'conflict' })
    expect(docs()).toHaveLength(0)
  })
})

describe('durable reward delivery', () => {
  it('dispatches Lua without an economy integration while keeping source private in player and history DTOs', async () => {
    const code = 'local secret = "server-only-script"\nply:Give("weapon_crowbar")'
    const rule = await rewards.createRewardRule('s1', basicRule({ actions: [{ type: 'lua', code }] }), actor)
    expect((await rewards.getRewardsDashboard('s1')).rules[0]!.actions[0]).toEqual({ type: 'lua', code })
    expect(await rewards.simulateReward('s1', rule.id, steam)).toMatchObject({
      eligible: true,
      missingIntegrations: [],
    })
    const delivery = (await poll(false)).deliveries[0]!
    expect(delivery.actions).toEqual([{ id: expect.any(String), type: 'lua', code }])
    expect(RewardDeliverySchema.safeParse(delivery).success).toBe(true)
    expect(docs()[0].actions[0].code).toBe(code)
    const history = await rewards.getRewardHistory('s1')
    expect(history.items[0]!.actions[0]).toMatchObject({ type: 'lua', status: 'uncertain' })
    expect(history.items[0]!.actions[0]).not.toHaveProperty('code')
    expect(RewardGrantSchema.safeParse(history.items[0]).success).toBe(true)
    const player = await rewards.getPlayerRewards('s1', steam)
    expect(player.rewards[0]!.rule.actions).toEqual([{ type: 'lua' }])
    expect(PlayerRewardsSchema.safeParse(player).success).toBe(true)
    expect(JSON.stringify(player)).not.toContain('server-only-script')
    expect(JSON.stringify(history)).not.toContain('server-only-script')
  })

  it('replays the frozen Lua source and journal identity after a rule edit, then preserves terminal failure', async () => {
    const firstCode = 'ply:Give("weapon_crowbar")'
    const rule = await rewards.createRewardRule('s1', basicRule({ actions: [{ type: 'lua', code: firstCode }] }), actor)
    const delivery = (await poll(false)).deliveries[0]!
    await rewards.updateRewardRule(
      's1',
      rule.id,
      {
        revision: 1,
        rule: basicRule({ actions: [{ type: 'lua', code: 'ply:Give("weapon_pistol")' }] }),
      },
      actor,
    )
    expect((await poll(false)).deliveries[0]).toEqual(delivery)
    await rewards.acknowledgeRewards('s1', {
      id: delivery.id,
      token: delivery.token,
      results: [{ id: delivery.actions[0]!.id, status: 'failed', reason: 'lua_compile_failed' }],
    })
    expect(docs()[0].actions[0]).toMatchObject({ code: firstCode, status: 'failed', reason: 'lua_compile_failed' })
    expect((await poll(false)).deliveries).toHaveLength(0)
    expect(docs()).toHaveLength(1)
  })

  it('queues unavailable integrations, uses stable journal identities after lost receipts and never exposes delivery tokens in history', async () => {
    await rewards.createRewardRule('s1', basicRule(), actor)
    expect((await poll(false)).deliveries).toHaveLength(0)
    expect(docs()[0].status).toBe('pending')
    const first = (await poll()).deliveries[0]!
    expect(RewardDeliverySchema.safeParse(first).success).toBe(true)
    expect((await poll()).deliveries[0]).toEqual(first)
    const history = await rewards.getRewardHistory('s1')
    expect(history.items[0]).not.toHaveProperty('deliveryToken')
    expect(history.items[0]).not.toHaveProperty('dedupeKey')
    expect(RewardGrantSchema.safeParse(history.items[0]).success).toBe(true)
    expect(state.role).not.toHaveBeenCalled()
  })

  it('accepts a pending pre-effect receipt then delivery, and rejects foreign tokens, server scope and unknown actions', async () => {
    await rewards.createRewardRule('s1', basicRule(), actor)
    const delivery = (await poll()).deliveries[0]!
    const acknowledgement = {
      id: delivery.id,
      token: delivery.token,
      results: [{ id: delivery.actions[0]!.id, status: 'pending', reason: 'player_offline' }],
    }
    await expect(rewards.acknowledgeRewards('s2', acknowledgement)).rejects.toMatchObject({ status: 404 })
    await expect(rewards.acknowledgeRewards('s1', { ...acknowledgement, token: requestID })).rejects.toMatchObject({
      status: 404,
    })
    await expect(
      rewards.acknowledgeRewards('s1', { ...acknowledgement, results: [{ id: requestID, status: 'delivered' }] }),
    ).rejects.toMatchObject({ status: 400 })
    await rewards.acknowledgeRewards('s1', acknowledgement)
    expect(docs()[0].status).toBe('pending')
    expect((await poll()).deliveries[0]!.token).toBe(delivery.token)
    await rewards.acknowledgeRewards('s1', {
      ...acknowledgement,
      results: [{ id: delivery.actions[0]!.id, status: 'delivered' }],
    })
    await rewards.acknowledgeRewards('s1', acknowledgement)
    expect(docs()[0].status).toBe('delivered')
    expect((await poll()).deliveries).toHaveLength(0)
  })

  it('tracks bundles per action and resends only unconfirmed actions for journal recovery', async () => {
    await rewards.createRewardRule(
      's1',
      basicRule({
        actions: [
          { type: 'darkrp_money', amount: 500 },
          { type: 'darkrp_money', amount: 250 },
        ],
      }),
      actor,
    )
    const delivery = (await poll()).deliveries[0]!
    await rewards.acknowledgeRewards('s1', {
      id: delivery.id,
      token: delivery.token,
      results: [
        { id: delivery.actions[0]!.id, status: 'delivered' },
        { id: delivery.actions[1]!.id, status: 'uncertain', reason: 'execution_uncertain' },
      ],
    })
    const retried = (await poll()).deliveries[0]!
    expect(retried.actions.map((action) => action.id)).toEqual([delivery.actions[1]!.id])
    expect(docs()[0].status).toBe('uncertain')
  })

  it('expires undelivered rewards but preserves uncertain outcomes and never dispatches beyond the journal retention horizon', async () => {
    await rewards.createRewardRule('s1', basicRule({ pendingDays: 1 }), actor)
    await poll(false)
    vi.setSystemTime(new Date(now.getTime() + 2 * 86_400_000))
    expect((await poll()).deliveries).toHaveLength(0)
    expect(docs()[0].status).toBe('expired')
  })

  it('stops dispatch on expired access, disabled rules or changed ownership', async () => {
    const rule = await rewards.createRewardRule('s1', basicRule(), actor)
    await rewards.reconcilePlayerRewards('s1', steam)
    state.premium = false
    expect((await poll()).deliveries).toHaveLength(0)
    state.premium = true
    await rewards.updateRewardRule('s1', rule.id, { revision: 1, rule: basicRule({ enabled: false }) }, actor)
    expect((await poll()).deliveries).toHaveLength(0)
    state.server.mockResolvedValue({ id: 's1', guild: 'another-guild' })
    expect((await rewards.getRewardsDashboard('s1')).rules).toHaveLength(0)
  })

  it('revalidates frozen role identities and confirms actual Discord results separately from socket delivery', async () => {
    await rewards.createRewardRule(
      's1',
      basicRule({ actions: [{ type: 'discord_role', roleID: '456789012345678901' }] }),
      actor,
    )
    await rewards.reconcilePlayerRewards('s1', steam)
    const grant = docs()[0]
    const input = {
      serverID: 's1',
      grantID: grant.id,
      actionID: grant.actions[0].id,
      steamID64: steam,
      discordID: discord,
      roleID: '456789012345678901',
    }
    expect(await rewards.authorizeDiscordRewardAction(input)).toBe(true)
    expect(await rewards.authorizeDiscordRewardAction({ ...input, roleID: '567890123456789012' })).toBe(false)
    state.role.mockResolvedValueOnce({ status: 'uncertain', reason: 'discord_unavailable' })
    await rewards.processPendingDiscordRewards('s1')
    expect(docs()[0].status).toBe('uncertain')
    await rewards.processPendingDiscordRewards('s1')
    expect(state.role).toHaveBeenCalledTimes(1)
    vi.setSystemTime(new Date(now.getTime() + 31_000))
    await rewards.processPendingDiscordRewards('s1')
    expect(docs()[0].status).toBe('delivered')
    expect(await rewards.authorizeDiscordRewardAction(input)).toBe(false)
  })

  it('blocks erased recipients and cleans up a grant if erasure begins during persistence', async () => {
    await rewards.createRewardRule('s1', basicRule(), actor)
    state.erased = true
    await expect(rewards.reconcilePlayerRewards('s1', steam)).rejects.toMatchObject({ code: 'player_unavailable' })
    expect(docs()).toHaveLength(0)
    state.erased = false
    let checks = 0
    state.privacy.mockImplementation(async () => ++checks >= 4)
    await rewards.reconcilePlayerRewards('s1', steam)
    expect(docs()).toHaveLength(0)
  })

  it('keeps database failures and unknown entitlements retryable during Discord authorization', async () => {
    await rewards.createRewardRule(
      's1',
      basicRule({ actions: [{ type: 'discord_role', roleID: '456789012345678901' }] }),
      actor,
    )
    await rewards.reconcilePlayerRewards('s1', steam)
    const grant = docs()[0]
    const input = {
      serverID: 's1',
      grantID: grant.id,
      actionID: grant.actions[0].id,
      steamID64: steam,
      discordID: discord,
      roleID: '456789012345678901',
    }
    state.server.mockRejectedValueOnce(new Error('Database unavailable'))
    await expect(rewards.authorizeDiscordRewardAction(input)).rejects.toThrow('Database unavailable')
    state.premium = false
    state.accessState = 'unknown'
    await expect(rewards.authorizeDiscordRewardAction(input)).rejects.toMatchObject({
      status: 503,
      code: 'entitlement_unavailable',
    })
    expect(docs()[0].status).toBe('pending')
    state.accessState = 'ready'
    expect(await rewards.authorizeDiscordRewardAction(input)).toBe(false)
    state.server.mockResolvedValueOnce(null)
    expect(await rewards.authorizeDiscordRewardAction(input)).toBe(false)
  })
})

describe('reward boundaries and concurrent persistence', () => {
  it('waits for a linked account and the required playtime before reconciling an automatic rule', async () => {
    await rewards.createRewardRule('s1', basicRule({ trigger: { type: 'playtime', seconds: 3600 } }), actor)
    state.user = null
    await rewards.reconcilePlayerRewards('s1', steam)
    expect(docs()).toHaveLength(0)
    state.user = { discordID: discord }
    state.playedSeconds = 3599
    await rewards.reconcilePlayerRewards('s1', steam)
    expect(docs()).toHaveLength(0)
    state.playedSeconds = 3600
    await rewards.reconcilePlayerRewards('s1', steam)
    expect(docs()).toHaveLength(1)
  })

  it('honors a vote rule start boundary and drops a vote whose recipient is erased during persistence', async () => {
    await rewards.createRewardRule(
      's1',
      basicRule({ startsAt: now.toISOString(), trigger: { type: 'vote', cooldownSeconds: 10800 } }),
      actor,
    )
    state.votes = [{ id: 1, createdAt: now }]
    let checks = 0
    state.privacy.mockImplementation(async () => ++checks === 3)
    await rewards.reconcilePlayerRewards('s1', steam)
    expect(docs()).toHaveLength(0)
  })

  it('denies Discord execution after the grant expiry and leaves role-only grants off the addon transport', async () => {
    await rewards.createRewardRule(
      's1',
      basicRule({ pendingDays: 1, actions: [{ type: 'discord_role', roleID: '456789012345678901' }] }),
      actor,
    )
    expect(await poll()).toEqual({ deliveries: [] })
    const grant = docs()[0]
    vi.setSystemTime(new Date(now.getTime() + 86_400_000))
    expect(
      await rewards.authorizeDiscordRewardAction({
        serverID: 's1',
        grantID: grant.id,
        actionID: grant.actions[0].id,
        steamID64: steam,
        discordID: discord,
        roleID: '456789012345678901',
      }),
    ).toBe(false)
    expect(state.role).not.toHaveBeenCalled()
  })

  it.each(['pointshop_points', 'pointshop2_points'] as const)(
    'dispatches %s only through its detected economy integration',
    async (type) => {
      await rewards.createRewardRule('s1', basicRule({ actions: [{ type, amount: 250 }] }), actor)
      expect(await poll(false)).toEqual({ deliveries: [] })
      const integrations = {
        darkrp: false,
        pointshop: type === 'pointshop_points',
        pointshop2: type === 'pointshop2_points',
      }
      const result = await rewards.pollRewards('s1', { integrations, players: [steam] })
      expect(result.deliveries).toHaveLength(1)
      expect(result.deliveries[0]!.actions).toEqual([{ id: expect.any(String), type, amount: 250 }])
    },
  )

  it('rejects malformed public requests and absent rule identities without changing storage', async () => {
    const invalidID = 'not-a-reward-id'
    const missingID = '91000000-0000-4000-8000-000000000001'
    for (const request of [
      () => rewards.createRewardRule('s1', {}, actor),
      () => rewards.updateRewardRule('s1', invalidID, { revision: 1, rule: basicRule() }, actor),
      () => rewards.updateRewardRule('s1', missingID, {}, actor),
      () => rewards.deleteRewardRule('s1', invalidID, 1, actor),
      () => rewards.deleteRewardRule('s1', missingID, 1.5, actor),
      () => rewards.deleteRewardRule('s1', missingID, 0, actor),
      () => rewards.getRewardHistory('s1', { page: 'invalid' }),
      () => rewards.simulateReward('s1', invalidID, steam),
      () => rewards.getPlayerRewards('s1', 'not-steam'),
      () =>
        rewards.grantManualReward(
          's1',
          invalidID,
          { revision: 1, steamID64: steam, reason: 'Winner', requestID },
          actor,
        ),
      () => rewards.grantManualReward('s1', missingID, {}, actor),
      () => rewards.pollRewards('s1', {}),
      () => rewards.acknowledgeRewards('s1', {}),
    ])
      await expect(request()).rejects.toMatchObject({ status: 400, code: 'invalid_request' })
    for (const request of [
      () => rewards.updateRewardRule('s1', missingID, { revision: 1, rule: basicRule() }, actor),
      () => rewards.deleteRewardRule('s1', missingID, 1, actor),
      () => rewards.simulateReward('s1', missingID, steam),
      () =>
        rewards.grantManualReward(
          's1',
          missingID,
          { revision: 1, steamID64: steam, reason: 'Winner', requestID },
          actor,
        ),
    ])
      await expect(request()).rejects.toMatchObject({ status: 404, code: 'reward_not_found' })
    expect(docs('gm_reward_rules')).toHaveLength(0)
    expect(docs()).toHaveLength(0)
  })

  it('bounds the saved rule count and preserves a rule when a stale deletion loses its revision race', async () => {
    const first = await rewards.createRewardRule('s1', basicRule(), actor)
    await expect(rewards.deleteRewardRule('s1', first.id, 2, actor)).rejects.toMatchObject({ code: 'conflict' })
    for (let index = 1; index < 100; index++) await rewards.createRewardRule('s1', basicRule(), actor)
    await expect(rewards.createRewardRule('s1', basicRule(), actor)).rejects.toMatchObject({
      code: 'reward_rule_limit',
    })
    expect((await rewards.getRewardsDashboard('s1')).rules).toHaveLength(100)
  })

  it.each([
    { patch: { enabled: false }, reason: 'disabled' },
    { patch: { startsAt: new Date(now.getTime() + 60_000).toISOString() }, reason: 'not_started' },
    { patch: { endsAt: now.toISOString() }, reason: 'ended' },
  ])('does not issue inactive rules: $reason', async ({ patch, reason }) => {
    const rule = await rewards.createRewardRule('s1', basicRule(patch), actor)
    expect(await rewards.simulateReward('s1', rule.id, steam)).toMatchObject({ eligible: false, reason })
    await rewards.reconcilePlayerRewards('s1', steam)
    expect(docs()).toHaveLength(0)
    await expect(
      rewards.grantManualReward('s1', rule.id, { revision: 1, steamID64: steam, reason: 'Winner', requestID }, actor),
    ).rejects.toMatchObject({ code: reason })
  })

  it('treats unavailable entitlements, missing votes and missing statistics as distinct eligibility outcomes', async () => {
    const rule = await rewards.createRewardRule(
      's1',
      basicRule({ trigger: { type: 'vote', cooldownSeconds: 10800 } }),
      actor,
    )
    expect(await rewards.simulateReward('s1', rule.id, steam)).toMatchObject({ reason: 'vote_required' })
    state.votes = [{ id: 1, createdAt: now }]
    await expect(
      rewards.grantManualReward('s1', rule.id, { revision: 1, steamID64: steam, reason: 'Winner', requestID }, actor),
    ).rejects.toMatchObject({ code: 'vote_required' })
    state.premium = false
    expect(await rewards.simulateReward('s1', rule.id, steam)).toMatchObject({ reason: 'entitlement_unavailable' })
    await rewards.reconcilePlayerRewards('s1', steam)
    expect(docs()).toHaveLength(0)
    state.premium = true
    state.statistics.mockResolvedValueOnce(null)
    expect(await rewards.simulateReward('s1', rule.id, steam)).toMatchObject({ playedSeconds: 0, eligible: true })
    state.playedSeconds = -10
    expect(await rewards.simulateReward('s1', rule.id, steam)).toMatchObject({ playedSeconds: 0 })
  })

  it('reports each economy integration, expires stale observations and returns public role and amount data', async () => {
    const rule = await rewards.createRewardRule(
      's1',
      basicRule({
        actions: [
          { type: 'darkrp_money', amount: 100 },
          { type: 'pointshop_points', amount: 200 },
          { type: 'pointshop2_points', amount: 300 },
          { type: 'discord_role', roleID: '456789012345678901' },
        ],
      }),
      actor,
    )
    expect(await rewards.simulateReward('s1', rule.id, steam)).toMatchObject({
      missingIntegrations: ['darkrp', 'pointshop', 'pointshop2'],
    })
    await rewards.pollRewards('s1', { integrations: { darkrp: true, pointshop: true, pointshop2: true }, players: [] })
    expect((await rewards.getRewardsDashboard('s1')).integrations).toEqual({
      darkrp: true,
      pointshop: true,
      pointshop2: true,
      updatedAt: now.toISOString(),
    })
    expect(await rewards.simulateReward('s1', rule.id, steam)).toMatchObject({ missingIntegrations: [] })
    await rewards.reconcilePlayerRewards('s1', steam)
    const player = await rewards.getPlayerRewards('s1', steam)
    expect(player.rewards[0]!.rule.actions).toEqual(rule.actions)
    expect(player.history[0]!.actions[3]).toMatchObject({ type: 'discord_role', roleID: '456789012345678901' })
    vi.setSystemTime(new Date(now.getTime() + 120_001))
    expect(await rewards.simulateReward('s1', rule.id, steam)).toMatchObject({
      missingIntegrations: ['darkrp', 'pointshop', 'pointshop2'],
    })
  })

  it('retries competing grant revisions and bounds a persistent conflict to eight attempts', async () => {
    await rewards.createRewardRule('s1', basicRule(), actor)
    await poll(false)
    let conflicts = 0
    state.beforeWrite.mockImplementation(async (name, query) => {
      if (name === 'gm_reward_grants' && query.version !== undefined && ++conflicts <= 2) return { modifiedCount: 0 }
    })
    const delivery = (await poll()).deliveries[0]!
    expect(conflicts).toBe(3)
    expect(docs()[0].status).toBe('uncertain')
    state.beforeWrite.mockClear().mockImplementation(async (name, query) => {
      if (name === 'gm_reward_grants' && query.version !== undefined) return { modifiedCount: 0 }
    })
    await expect(
      rewards.acknowledgeRewards('s1', {
        id: delivery.id,
        token: delivery.token,
        results: [{ id: delivery.actions[0]!.id, status: 'delivered' }],
      }),
    ).rejects.toMatchObject({ status: 409, code: 'reward_busy' })
    expect(state.beforeWrite).toHaveBeenCalledTimes(8)
    expect(docs()[0].status).toBe('uncertain')
  })

  it('rejects a receipt before dispatch and suppresses a delivery whose grant is erased during its claim', async () => {
    await rewards.createRewardRule('s1', basicRule(), actor)
    await poll(false)
    const row = docs()[0]
    await expect(
      rewards.acknowledgeRewards('s1', {
        id: row.id,
        token: row.deliveryToken,
        results: [{ id: row.actions[0].id, status: 'delivered' }],
      }),
    ).rejects.toMatchObject({ code: 'invalid_request' })
    state.beforeRead.mockImplementation(async (name, query) => {
      if (name === 'gm_reward_grants' && query._id === row.id && !query.deliveryToken)
        state.collections.get(name)!.delete(row.id)
    })
    expect((await poll()).deliveries).toEqual([])
    expect(docs()).toHaveLength(0)
  })

  it.each([null, 'connection reset', {}, { code: 12345 }])(
    'preserves unexpected persistence failures: %j',
    async (failure) => {
      await rewards.createRewardRule('s1', basicRule(), actor)
      state.beforeWrite.mockImplementationOnce(async () => {
        throw failure
      })
      await expect(rewards.reconcilePlayerRewards('s1', steam)).rejects.toBe(failure)
      expect(docs()).toHaveLength(0)
    },
  )

  it('does not replace the recipient when concurrent manual requests reuse one idempotency key', async () => {
    const rule = await rewards.createRewardRule('s1', basicRule({ trigger: { type: 'manual' } }), actor)
    const input = { revision: 1, steamID64: steam, reason: 'Winner', requestID }
    const outcomes = await Promise.allSettled([
      rewards.grantManualReward('s1', rule.id, input, actor),
      rewards.grantManualReward('s1', rule.id, { ...input, steamID64: '76561198087654321' }, actor),
    ])
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(outcomes.find((result) => result.status === 'rejected')).toMatchObject({
      reason: { code: 'idempotency_conflict' },
    })
    expect(docs()).toHaveLength(1)
    const saved = structuredClone(docs()[0])
    for (const patch of [{ revision: 2 }, { steamID64: '76561198087654321' }])
      await expect(rewards.grantManualReward('s1', rule.id, { ...input, ...patch }, actor)).rejects.toMatchObject({
        code: 'idempotency_conflict',
      })
    await expect(rewards.grantManualReward('s1', rule.id, input, '345678901234567890')).rejects.toMatchObject({
      code: 'idempotency_conflict',
    })
    const otherRule = await rewards.createRewardRule('s1', basicRule({ trigger: { type: 'manual' } }), actor)
    await expect(rewards.grantManualReward('s1', otherRule.id, input, actor)).rejects.toMatchObject({
      code: 'idempotency_conflict',
    })
    expect(docs()[0]).toEqual(saved)
    expect(docs()[0]).toMatchObject({
      steamID64: saved.steamID64,
      discordID: discord,
      actorDiscordID: actor,
      requestRevision: input.revision,
      version: saved.version,
    })
    state.erased = true
    await expect(rewards.grantManualReward('s1', rule.id, input, actor)).rejects.toMatchObject({
      code: 'player_unavailable',
    })
  })

  it('fails closed if an account is unlinked or erased between eligibility and the durable grant', async () => {
    const rule = await rewards.createRewardRule('s1', basicRule({ trigger: { type: 'manual' } }), actor)
    const input = { revision: 1, steamID64: steam, reason: 'Winner', requestID }
    state.statistics.mockImplementationOnce(async () => {
      state.user = null
      return { total_time: 0 }
    })
    await expect(rewards.grantManualReward('s1', rule.id, input, actor)).rejects.toMatchObject({
      code: 'account_not_linked',
    })
    state.user = { discordID: discord }
    let checks = 0
    state.privacy.mockImplementation(async () => ++checks >= 5)
    await expect(rewards.grantManualReward('s1', rule.id, input, actor)).rejects.toMatchObject({
      code: 'player_unavailable',
    })
    expect(docs()).toHaveLength(0)
  })

  it('revalidates erasure after player facts and again before returning a player dashboard', async () => {
    await rewards.createRewardRule('s1', basicRule(), actor)
    state.privacy.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    await expect(rewards.getPlayerRewards('s1', steam)).rejects.toMatchObject({ code: 'player_unavailable' })
    let checks = 0
    state.privacy.mockImplementation(async () => ++checks === 5)
    await expect(rewards.getPlayerRewards('s1', steam)).rejects.toMatchObject({ code: 'player_unavailable' })
  })

  it('expires only pending actions while retaining an uncertain delivery for journal reconciliation', async () => {
    await rewards.createRewardRule(
      's1',
      basicRule({
        pendingDays: 1,
        actions: [
          { type: 'darkrp_money', amount: 100 },
          { type: 'pointshop_points', amount: 200 },
        ],
      }),
      actor,
    )
    const delivery = (await poll()).deliveries[0]!
    await rewards.acknowledgeRewards('s1', {
      id: delivery.id,
      token: delivery.token,
      results: [{ id: delivery.actions[0]!.id, status: 'pending' }],
    })
    vi.setSystemTime(new Date(now.getTime() + 2 * 86_400_000))
    const history = await rewards.getRewardHistory('s1')
    expect(history.items[0]!.actions.map((action) => action.status)).toEqual(['expired', 'uncertain'])
    expect(history.items[0]!.status).toBe('uncertain')
    expect((await rewards.getRewardHistory('s1')).items[0]).toEqual(history.items[0])
  })

  it('contains failed Discord providers, truncates public failure reasons and preserves a concurrent terminal success', async () => {
    await rewards.createRewardRule(
      's1',
      basicRule({
        actions: [
          { type: 'discord_role', roleID: '456789012345678901' },
          { type: 'darkrp_money', amount: 100 },
        ],
      }),
      actor,
    )
    await rewards.reconcilePlayerRewards('s1', steam)
    state.role.mockRejectedValueOnce(new Error('Discord offline'))
    await rewards.processPendingDiscordRewards('s1')
    expect(docs()[0].actions[0]).toMatchObject({ status: 'uncertain', reason: 'discord_unavailable' })
    vi.setSystemTime(new Date(now.getTime() + 31_000))
    await rewards.processPendingDiscordRewards('s1', async () => {
      docs()[0].actions[0].status = 'delivered'
      return { status: 'failed', reason: 'late failure must not undo the other worker' }
    })
    expect(docs()[0].actions[0].status).toBe('delivered')
    await rewards.processPendingDiscordRewards('s1')
    expect(state.role).toHaveBeenCalledTimes(1)
    const second = await rewards.createRewardRule(
      's1',
      basicRule({ actions: [{ type: 'discord_role', roleID: '567890123456789012' }] }),
      actor,
    )
    await rewards.reconcilePlayerRewards('s1', steam)
    await rewards.processPendingDiscordRewards('s1', async () => ({ status: 'failed', reason: 'x'.repeat(100) }))
    expect(docs().find((row) => row.ruleID === second.id)).toMatchObject({
      status: 'failed',
      actions: [{ reason: 'x'.repeat(64) }],
    })
    state.premium = false
    await rewards.processPendingDiscordRewards('s1')
    expect(state.role).toHaveBeenCalledTimes(1)
  })

  it('skips deleted rules and mismatched or missing Discord action identities', async () => {
    const rule = await rewards.createRewardRule(
      's1',
      basicRule({ actions: [{ type: 'discord_role', roleID: '456789012345678901' }] }),
      actor,
    )
    await rewards.reconcilePlayerRewards('s1', steam)
    const grant = docs()[0]
    const input = {
      serverID: 's1',
      grantID: grant.id,
      actionID: grant.actions[0].id,
      steamID64: steam,
      discordID: discord,
      roleID: '456789012345678901',
    }
    expect(await rewards.authorizeDiscordRewardAction({ ...input, grantID: requestID })).toBe(false)
    expect(await rewards.authorizeDiscordRewardAction({ ...input, actionID: requestID })).toBe(false)
    await rewards.deleteRewardRule('s1', rule.id, 1, actor)
    expect(await rewards.authorizeDiscordRewardAction(input)).toBe(false)
    await rewards.processPendingDiscordRewards('s1')
    expect(state.role).not.toHaveBeenCalled()
  })

  it('bounds reconciliation time and a poll batch without issuing rewards after its deadline', async () => {
    await rewards.createRewardRule('s1', basicRule(), actor)
    state.statistics.mockImplementation(async () => {
      vi.setSystemTime(new Date(now.getTime() + 10_001))
      return { total_time: 0 }
    })
    await rewards.reconcilePlayerRewards('s1', steam)
    expect(docs()).toHaveLength(0)
    vi.setSystemTime(now)
    state.statistics.mockClear()
    const players = Array.from({ length: 5 }, (_, index) => (BigInt(steam) + BigInt(index)).toString())
    expect(
      await rewards.pollRewards('s1', { integrations: { darkrp: true, pointshop: false, pointshop2: false }, players }),
    ).toEqual({ deliveries: [] })
    expect(state.statistics).toHaveBeenCalledTimes(4)
    expect(docs()).toHaveLength(0)
  })

  it.each(['storage', 'other-reward', 'erasure'] as const)(
    'propagates only retryable poll failures: %s',
    async (kind) => {
      await rewards.createRewardRule('s1', basicRule(), actor)
      const failure =
        kind === 'storage'
          ? new Error('Statistics unavailable')
          : new rewards.RewardsError(
              kind === 'erasure' ? 404 : 503,
              kind === 'erasure' ? 'player_unavailable' : 'provider_unavailable',
            )
      state.statistics.mockRejectedValueOnce(failure)
      if (kind === 'erasure') expect(await poll()).toEqual({ deliveries: [] })
      else await expect(poll()).rejects.toBe(failure)
      expect(docs()).toHaveLength(0)
    },
  )

  it('limits a poll to ten delivery envelopes and excludes erased players before loading their facts', async () => {
    for (let index = 0; index < 12; index++) await rewards.createRewardRule('s1', basicRule(), actor)
    const result = await poll()
    expect(result.deliveries).toHaveLength(10)
    expect(new Set(result.deliveries.map((delivery) => delivery.id)).size).toBe(10)
    expect(docs()).toHaveLength(12)
    state.collections.get('gm_reward_grants')!.clear()
    state.statistics.mockClear()
    state.erased = true
    expect(await poll()).toEqual({ deliveries: [] })
    expect(state.statistics).not.toHaveBeenCalled()
  })

  it('sweeps at most twenty-five server groups and continues after one community is unavailable', async () => {
    for (let index = 0; index < 26; index++) {
      const serverID = `sweep-${index}`
      await rewards.createRewardRule(
        serverID,
        basicRule({ actions: [{ type: 'discord_role', roleID: '456789012345678901' }] }),
        actor,
      )
      await rewards.reconcilePlayerRewards(serverID, steam)
    }
    state.server.mockImplementation(async ({ where }: any) => {
      if (where.id === 'sweep-0') throw new Error('One community is unavailable')
      return { id: where.id, guild: 'g1' }
    })
    state.role.mockResolvedValue({ status: 'uncertain' })
    await rewards.sweepPendingRewards()
    expect(state.role).toHaveBeenCalledTimes(24)
    expect(docs().filter((row) => row.sweptAt === now.toISOString())).toHaveLength(24)
    expect(docs().find((row) => row.serverID === 'sweep-0').sweptAt).toBeNull()
    expect(docs().find((row) => row.serverID === 'sweep-25').sweptAt).toBeNull()
  })
})
