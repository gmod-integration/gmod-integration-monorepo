import express from 'express'
vi.mock('@gmod/domain-user/dashboardAccess.js', async () => ({
  canAccessDashboardGuild: (await import('../../helpers/dashboardAccessFixture.js')).dashboardAccessFromAdminFixture,
  resolveDashboardAccess: (await import('../../helpers/dashboardAccessFixture.js'))
    .resolveDashboardAccessFromAdminFixture,
}))
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  sessions: vi.fn(),
  session: vi.fn(),
  panel: vi.fn(),
  admin: vi.fn(),
  server: vi.fn(),
  dashboard: vi.fn(),
  history: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  simulate: vi.fn(),
  grant: vi.fn(),
}))
vi.mock('@gmod/infra-prisma', () => ({
  default: { gm_panelToken: { findMany: mocks.sessions, findFirst: mocks.session } },
}))
vi.mock('@gmod/domain-user/PanelUser.js', () => ({ getPanelUserFromDiscordID: mocks.panel }))
vi.mock('@gmod/domain-server/Server.js', () => ({ getServerFromID: mocks.server }))
vi.mock('@gmod/domain-guild/Guild.js', () => ({ Guild: class {} }))
vi.mock('@gmod/config', () => ({
  ConfigServer: { websiteUrl: 'https://dashboard.example.test', domain: 'https://api.example.test', dev: false },
  ConfigDiscord: { clientSecret: 'test-oauth-client-secret' },
  ConfigAuth: { credentialEncryptionKey: 'test-auth-key', sessionIdleTtlSeconds: 604800 },
}))
vi.mock('@gmod/config/developers.js', () => ({ isDeveloper: (id: string) => id === 'developer' }))
vi.mock('@gmod/infra-prisma/privacy.js', () => ({ isErasureBlocked: vi.fn().mockResolvedValue(false) }))
vi.mock('@gmod/infra-redis', () => ({ default: { publish: vi.fn() } }))
vi.mock('@gmod/core/models/v6/rewards.js', () => ({
  getRewardsDashboard: mocks.dashboard,
  getRewardHistory: mocks.history,
  createRewardRule: mocks.create,
  updateRewardRule: mocks.update,
  deleteRewardRule: mocks.remove,
  simulateReward: mocks.simulate,
  grantManualReward: mocks.grant,
  RewardsError: class extends Error {
    constructor(
      public status: number,
      public code: string,
    ) {
      super(code)
    }
  },
}))
const { csrfTokenForSession, hashSessionToken } = await import('@gmod/domain-auth/authSessions.js')
const { default: router } = await import('../../../src/routes/v6/rewardsRoutes.js')
const { RewardsError } = await import('@gmod/core/models/v6/rewards.js')

const endpoint = '/v6/guilds/g1/servers/s1/rewards'
const ruleID = '9e7a47dc-e647-4418-b511-294100c34930'
const requestID = '6b81ab6f-4a9a-40be-af45-d5580d1a6938'
const steamID64 = '76561198012345678'
const ruleURL = `${endpoint}/rules/${ruleID}`
const target = { id: 's1', guild: 'g1' }
const rule = {
  name: 'Welcome',
  description: 'First account link',
  enabled: true,
  trigger: { type: 'verification' },
  actions: [{ type: 'darkrp_money', amount: 5000 }],
  pendingDays: 7,
  startsAt: null,
  endsAt: null,
}
const saved = { ...rule, id: ruleID, revision: 3 }
const simulation = {
  eligible: true,
  reason: null,
  linked: true,
  playedSeconds: 3600,
  requiredSeconds: null,
  alreadyReceived: false,
  missingIntegrations: [],
}
const manual = { steamID64, reason: 'Tournament winner', requestID, revision: 3 }
const grant = { id: requestID, status: 'pending' }

function sessionRow(overrides: Record<string, unknown> = {}) {
  const now = new Date()
  return {
    id: 'session-A',
    discordID: 'owner',
    accessToken: hashSessionToken('session-token'),
    revoke: false,
    creationDate: now,
    createdAt: now,
    lastSeenAt: now,
    expirationDate: new Date(now.getTime() + 600_000),
    absoluteExpiresAt: new Date(now.getTime() + 3_600_000),
    ...overrides,
  }
}
function csrf() {
  const row = sessionRow()
  return csrfTokenForSession({
    id: row.id,
    discordID: row.discordID,
    tokenHash: row.accessToken,
    createdAt: row.createdAt,
    lastSeenAt: row.lastSeenAt,
    expiresAt: row.expirationDate,
    absoluteExpiresAt: row.absoluteExpiresAt,
  })
}
function app() {
  const instance = express()
  instance.use(express.json())
  instance.use('/v6', router)
  instance.use(
    (
      error: { status?: number; code?: string },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => res.status(error.status || 503).json({ error: { code: error.code || 'service_unavailable' } }),
  )
  return instance
}
type Method = 'get' | 'post' | 'put' | 'delete'
const perform = (method: Method, path = endpoint, body?: unknown) => {
  const pending = request(app())[method](path).set('Authorization', 'Bearer session-token')
  return body === undefined ? pending : pending.send(body)
}
const domain = [mocks.dashboard, mocks.history, mocks.create, mocks.update, mocks.remove, mocks.simulate, mocks.grant]

beforeEach(() => {
  vi.resetAllMocks()
  mocks.sessions.mockResolvedValue([sessionRow()])
  mocks.panel.mockResolvedValue({ isAdminOfGuild: mocks.admin })
  mocks.admin.mockResolvedValue(true)
  mocks.server.mockResolvedValue(target)
  mocks.dashboard.mockResolvedValue({ rules: [saved], integrations: null })
  mocks.history.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 25 })
  mocks.create.mockResolvedValue(saved)
  mocks.update.mockResolvedValue({ ...saved, revision: 4 })
  mocks.remove.mockResolvedValue({ success: true })
  mocks.simulate.mockResolvedValue(simulation)
  mocks.grant.mockResolvedValue(grant)
})

describe('v6 rewards authorization and rule endpoints', () => {
  it('loads server rewards through a resolved session and guild-scoped server identity', async () => {
    const response = await perform('get')
    expect(response.status).toBe(200)
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.body.rules).toEqual([saved])
    expect(mocks.dashboard).toHaveBeenCalledExactlyOnceWith('s1')
    expect(mocks.panel).toHaveBeenCalledWith(
      'owner',
      'session-token',
      expect.objectContaining({ id: 'session-A', discordID: 'owner' }),
    )
    expect(mocks.admin).toHaveBeenCalledExactlyOnceWith('g1')
    expect(mocks.server).toHaveBeenCalledExactlyOnceWith('s1')
  })

  it('creates a complete rule and forwards optimistic revisions for updates and deletion', async () => {
    expect((await perform('post', `${endpoint}/rules`, rule)).status).toBe(201)
    expect(mocks.create).toHaveBeenCalledExactlyOnceWith('s1', rule, 'owner')
    const update = { revision: 3, rule: { ...rule, name: 'New name' } }
    const response = await perform('put', ruleURL, update)
    expect(response.status).toBe(200)
    expect(response.body.revision).toBe(4)
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith('s1', ruleID, update, 'owner')
    expect((await perform('delete', ruleURL, { revision: 4 })).status).toBe(200)
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith('s1', ruleID, 4, 'owner')
    expect(mocks.admin.mock.calls).toEqual(Array.from({ length: 3 }, () => ['g1', { fresh: true }]))
  })

  it('simulates eligibility without creating a rule or granting a reward', async () => {
    const response = await perform('post', `${ruleURL}/simulate`, { steamID64 })
    expect(response.status).toBe(200)
    expect(response.body).toEqual(simulation)
    expect(mocks.simulate).toHaveBeenCalledExactlyOnceWith('s1', ruleID, steamID64)
    expect(mocks.grant).not.toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('accepts an administrator Lua action without executing it while saving the rule', async () => {
    const code = 'local message = "Thanks!"\n\tply:ChatPrint(message)\n'
    const luaRule = { ...rule, actions: [{ type: 'lua', code }] }
    mocks.create.mockResolvedValueOnce({ ...luaRule, id: ruleID, revision: 1 })
    const response = await perform('post', `${endpoint}/rules`, luaRule)
    expect(response.status).toBe(201)
    expect(response.body.actions).toEqual([{ type: 'lua', code }])
    expect(mocks.create).toHaveBeenCalledExactlyOnceWith('s1', luaRule, 'owner')
    expect(mocks.grant).not.toHaveBeenCalled()
    expect(mocks.admin).toHaveBeenCalledExactlyOnceWith('g1', { fresh: true })
  })

  it('requires an explicit manual reason and request identity, attributing the action to the authenticated user', async () => {
    const response = await perform('post', `${ruleURL}/grant`, manual)
    expect(response.status).toBe(202)
    expect(response.body).toEqual(grant)
    expect(mocks.grant).toHaveBeenCalledExactlyOnceWith('s1', ruleID, manual, 'owner')
    expect(mocks.admin).toHaveBeenCalledExactlyOnceWith('g1', { fresh: true })
  })

  it('records the actual developer actor during a valid delegated session', async () => {
    mocks.sessions.mockResolvedValue([sessionRow({ actorDiscordID: 'developer', actorSessionID: 'parent-session' })])
    mocks.session.mockResolvedValue(
      sessionRow({ id: 'parent-session', discordID: 'developer', accessToken: hashSessionToken('parent-token') }),
    )
    expect((await perform('post', `${ruleURL}/grant`, manual)).status).toBe(202)
    expect(mocks.grant).toHaveBeenCalledExactlyOnceWith('s1', ruleID, manual, 'developer')
    expect(mocks.panel).toHaveBeenCalledWith(
      'owner',
      'session-token',
      expect.objectContaining({ actorDiscordID: 'developer' }),
    )
  })

  it('parses bounded history filters and supplies explicit pagination defaults', async () => {
    expect((await perform('get', `${endpoint}/history`)).status).toBe(200)
    expect(mocks.history).toHaveBeenLastCalledWith('s1', { page: 1, pageSize: 25 })
    expect(
      (
        await perform(
          'get',
          `${endpoint}/history?page=2&pageSize=50&status=uncertain&ruleID=${ruleID}&steamID64=${steamID64}`,
        )
      ).status,
    ).toBe(200)
    expect(mocks.history).toHaveBeenLastCalledWith('s1', {
      page: 2,
      pageSize: 50,
      status: 'uncertain',
      ruleID,
      steamID64,
    })
  })

  it.each([
    ['get', endpoint, undefined],
    ['get', `${endpoint}/history`, undefined],
    ['post', `${endpoint}/rules`, rule],
    ['put', ruleURL, { revision: 3, rule }],
    ['delete', ruleURL, { revision: 3 }],
    ['post', `${ruleURL}/simulate`, { steamID64 }],
    ['post', `${ruleURL}/grant`, manual],
  ] as const)(
    'rejects unauthenticated and unauthorized %s %s requests before domain work',
    async (method, path, body) => {
      const unauthenticated = request(app())[method](path)
      expect((await (body === undefined ? unauthenticated : unauthenticated.send(body))).status).toBe(401)
      mocks.admin.mockResolvedValue(false)
      expect((await perform(method, path, body)).status).toBe(403)
      for (const operation of domain) expect(operation).not.toHaveBeenCalled()
      expect(mocks.server).not.toHaveBeenCalled()
    },
  )

  it.each(['get', 'post'] as const)('rejects a cross-community server before reward %s operations', async (method) => {
    mocks.server.mockResolvedValue({ ...target, guild: 'g2' })
    const response = method === 'get' ? await perform('get') : await perform('post', `${endpoint}/rules`, rule)
    expect(response.status).toBe(404)
    for (const operation of domain) expect(operation).not.toHaveBeenCalled()
  })

  it('refreshes permissions on mutations and preserves provider failures as retryable errors', async () => {
    mocks.admin.mockRejectedValueOnce(
      Object.assign(new Error('private-provider-detail'), { status: 503, code: 'provider_unavailable' }),
    )
    const response = await perform('post', `${endpoint}/rules`, rule)
    expect(response.status).toBe(503)
    expect(response.body).toEqual({ error: { code: 'provider_unavailable' } })
    expect(mocks.admin).toHaveBeenCalledExactlyOnceWith('g1', { fresh: true })
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('allows cookie reads and requires the matching CSRF token for every cookie mutation', async () => {
    const cookie = '__Host-gmi_session=session-token'
    expect((await request(app()).get(endpoint).set('Cookie', cookie)).status).toBe(200)
    const mutate = () => request(app()).post(`${endpoint}/rules`).set('Cookie', cookie)
    expect((await mutate().send(rule)).status).toBe(403)
    expect((await mutate().set('X-CSRF-Token', 'unrelated-session').send(rule)).status).toBe(403)
    expect(mocks.create).not.toHaveBeenCalled()
    expect((await mutate().set('X-CSRF-Token', csrf()).send(rule)).status).toBe(201)
    expect(mocks.create).toHaveBeenCalledTimes(1)
  })

  it('rejects ambiguous or revoked sessions and foreign origins before domain work', async () => {
    mocks.sessions.mockResolvedValue([sessionRow(), sessionRow({ id: 'another-session', discordID: 'another-user' })])
    expect((await perform('get')).status).toBe(401)
    mocks.sessions.mockResolvedValue([sessionRow({ revoke: true })])
    expect((await perform('get')).status).toBe(401)
    mocks.sessions.mockResolvedValue([sessionRow()])
    expect(
      (await perform('post', `${endpoint}/rules`, rule).set('Origin', 'https://foreign.example.test')).status,
    ).toBe(403)
    for (const operation of domain) expect(operation).not.toHaveBeenCalled()
  })

  it.each([
    {},
    { ...rule, enabled: 'true' },
    { ...rule, actorDiscordID: 'victim' },
    { ...rule, actions: [{ type: 'lua', code: '   ' }] },
    { ...rule, actions: [{ type: 'lua', code: 'x'.repeat(16_385) }] },
    { ...rule, actions: [{ type: 'lua', code: 'print("x")\0' }] },
    { ...rule, actions: [{ type: 'lua', code: 'ply:ChatPrint("hello")', realm: 'client' }] },
    { ...rule, actions: [{ type: 'darkrp_money', amount: 0 }] },
    { ...rule, trigger: { type: 'vote', cooldownSeconds: 1 } },
    { ...rule, startsAt: '2030-01-02T00:00:00.000Z', endsAt: '2030-01-01T00:00:00.000Z' },
  ])('rejects malformed or overbroad complete rule bodies: %j', async (body) => {
    expect((await perform('post', `${endpoint}/rules`, body)).status).toBe(400)
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it.each([
    ['put', ruleURL, { rule }],
    ['put', ruleURL, { revision: 0, rule }],
    ['put', ruleURL, { revision: 3, rule, actor: 'victim' }],
    ['delete', ruleURL, {}],
    ['delete', ruleURL, { revision: 3, serverID: 'another-server' }],
    ['post', `${ruleURL}/simulate`, { steamID64, give: true }],
    ['post', `${ruleURL}/simulate`, { steamID64: '1234' }],
    ['post', `${ruleURL}/grant`, { steamID64, requestID }],
    ['post', `${ruleURL}/grant`, { ...manual, reason: '  ' }],
    ['post', `${ruleURL}/grant`, { ...manual, requestID: 'invalid' }],
    ['post', `${ruleURL}/grant`, { steamID64, reason: 'Tournament winner', requestID }],
    ['post', `${ruleURL}/grant`, { ...manual, actor: 'victim' }],
  ] as const)('rejects malformed %s bodies for %s', async (method, path, body) => {
    const response = await perform(method, path, body)
    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('invalid_request')
    for (const operation of domain) expect(operation).not.toHaveBeenCalled()
  })

  it.each([
    ['put', `${endpoint}/rules/not-a-uuid`, { revision: 3, rule }],
    ['delete', `${endpoint}/rules/not-a-uuid`, { revision: 3 }],
    ['post', `${endpoint}/rules/not-a-uuid/simulate`, { steamID64 }],
    ['post', `${endpoint}/rules/not-a-uuid/grant`, manual],
    ['get', `${endpoint}?unknown=true`, undefined],
    ['get', `${endpoint}/history?status=unknown`, undefined],
    ['get', `${endpoint}/history?pageSize=999`, undefined],
    ['get', `${endpoint}/history?page=1&page=2`, undefined],
    ['get', `${endpoint}/history?actor=victim`, undefined],
    ['post', `${endpoint}/rules?unknown=true`, rule],
    ['put', `${ruleURL}?unknown=true`, { revision: 3, rule }],
    ['delete', `${ruleURL}?unknown=true`, { revision: 3 }],
    ['post', `${ruleURL}/simulate?unknown=true`, { steamID64 }],
    ['post', `${ruleURL}/grant?unknown=true`, manual],
  ] as const)('rejects invalid identities and unexpected query fields on %s %s', async (method, path, body) => {
    expect((await perform(method, path, body)).status).toBe(400)
    for (const operation of domain) expect(operation).not.toHaveBeenCalled()
  })

  it.each([
    [409, 'conflict'],
    [404, 'reward_not_found'],
    [403, 'upgrade_required'],
  ] as const)('preserves domain %s %s outcomes without returning a successful save', async (status, code) => {
    mocks.update.mockRejectedValue(new RewardsError(status, code))
    const response = await perform('put', ruleURL, { revision: 3, rule })
    expect(response.status).toBe(status)
    expect(response.body.error.code).toBe(code)
  })

  it('does not expose an unexpected persistence error or report it as a successful manual grant', async () => {
    mocks.grant.mockRejectedValue(new Error('private persistence diagnostic'))
    const response = await perform('post', `${ruleURL}/grant`, manual)
    expect(response.status).toBe(503)
    expect(JSON.stringify(response.body)).not.toContain('private')
  })
})
