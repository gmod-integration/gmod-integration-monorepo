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
  indexes: [] as unknown[],
}))

vi.mock('@gmod/infra-prisma', () => ({
  default: {
    gm_server: { findUnique: state.server },
    gm_server_stat: { findUnique: async () => ({ total_time: state.playedSeconds }) },
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
        state.indexes.push(input)
        return 'index'
      },
      find: cursor,
      findOne: async (query: any, options?: any) =>
        (
          await cursor(query)
            .sort(options?.sort ?? {})
            .limit(1)
            .toArray()
        )[0] ?? null,
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
})
afterEach(() => vi.useRealTimers())

describe('reward rules and eligibility', () => {
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
