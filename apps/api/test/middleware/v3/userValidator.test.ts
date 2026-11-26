import { beforeEach, describe, expect, it, vi } from 'vitest'
import express from 'express'
import request from 'supertest'

const resolveRequestSessionMock = vi.fn()
const assertSessionRequestMock = vi.fn()
const readSessionCredentialMock = vi.fn()
vi.mock('@gmod/domain-auth/authSessions.js', () => ({
  resolveRequestSession: resolveRequestSessionMock,
  assertSessionRequest: assertSessionRequestMock,
  readSessionCredential: readSessionCredentialMock,
}))
const exactSession = { id: 'session-a', discordID: 'd1' }

const badArgumentMock = vi.fn()
vi.mock('@gmod/core/utils/tools.js', () => ({ badArgument: badArgumentMock }))

const getPanelUserFromDiscordIDMock = vi.fn()
const dashboardAccessMock = vi.fn()
vi.mock('@gmod/domain-user/dashboardAccess.js', () => ({
  resolveDashboardAccess: async (...args: unknown[]) => {
    const result = await dashboardAccessMock(...args)
    return typeof result === 'boolean'
      ? result
        ? { allowed: true }
        : { allowed: false, reason: 'discord_admin_required' }
      : result
  },
}))
vi.mock('@gmod/domain-user/PanelUser.js', () => ({ getPanelUserFromDiscordID: getPanelUserFromDiscordIDMock }))

const getServerFromIDMock = vi.fn()
vi.mock('@gmod/domain-server/Server.js', () => ({ getServerFromID: getServerFromIDMock }))

class FakeGuild {
  id: string
  constructor(obj: { id: string }) {
    this.id = obj.id
  }
}
vi.mock('@gmod/domain-guild/Guild.js', () => ({ Guild: FakeGuild }))

const getUserFromDiscordIDMock = vi.fn()
vi.mock('@gmod/domain-user/User.js', () => ({ getUserFromDiscordID: getUserFromDiscordIDMock }))

const enqueueDiscordGuildSnapshotMock = vi.fn()
vi.mock('@gmod/infra-bullmq/discordQueueAdapters.js', () => ({
  enqueueDiscordGuildSnapshot: enqueueDiscordGuildSnapshotMock,
}))

const {
  userValidator,
  userAdminGuildValidator,
  userAdminGuildScopeValidator,
  userAdminGuildReadOnlyValidator,
  userAdminGuildBotRemovalValidator,
  userGuildSnapshotValidator,
  userServerValidator,
  userServerReadOnlyValidator,
  userAdminValidator,
} = await import('../../../src/middleware/v3/userValidator.js')

function makeRes() {
  const res: any = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  res.append = vi.fn().mockReturnValue(res)
  return res
}

function resetAllMocks() {
  dashboardAccessMock
    .mockReset()
    .mockImplementation((panel, guildID, options = {}) =>
      options.fresh ? panel.isAdminOfGuild(guildID, { fresh: true }) : panel.isAdminOfGuild(guildID),
    )
  resolveRequestSessionMock
    .mockReset()
    .mockImplementation(async (req: any) => (req.headers.authorization || req.headers.cookie ? exactSession : null))
  assertSessionRequestMock.mockReset()
  readSessionCredentialMock.mockReset().mockReturnValue('tok1')
  badArgumentMock.mockReset().mockReturnValue(false)
  getPanelUserFromDiscordIDMock.mockReset()
  getServerFromIDMock.mockReset()
  getUserFromDiscordIDMock.mockReset()
  enqueueDiscordGuildSnapshotMock.mockReset()
}

describe('userValidator', () => {
  beforeEach(() => {
    resetAllMocks()
  })

  it.each(['discord_admin_required', 'steam_link_required', 'game_admin_required', 'scope_unavailable'] as const)(
    'returns only the closed denial reason across legacy dashboard guards: %s',
    async (reason) => {
      getServerFromIDMock.mockResolvedValue({ getGuildID: () => 'g1' })
      dashboardAccessMock.mockResolvedValue({ allowed: false, reason })
      for (const guard of [
        userAdminGuildValidator,
        userAdminGuildScopeValidator,
        userAdminGuildReadOnlyValidator,
        userAdminGuildBotRemovalValidator,
        userServerValidator,
        userServerReadOnlyValidator,
      ]) {
        const response = makeRes()
        const next = vi.fn()
        await guard(
          {
            method: 'PUT',
            params: { guildID: 'g1', serverID: 's1' },
            guild: { id: 'g1' },
            panelUser: {},
            body: { rank: 'private-rank', ownerID: 'private-owner' },
          } as any,
          response,
          next,
        )
        expect(response.status).toHaveBeenCalledWith(403)
        expect(response.json).toHaveBeenCalledExactlyOnceWith({ error: 'dashboard_access_denied', reason })
        expect(JSON.stringify(response.json.mock.calls)).not.toContain('private-')
        expect(next).not.toHaveBeenCalled()
      }
      expect(enqueueDiscordGuildSnapshotMock).not.toHaveBeenCalled()
    },
  )

  it.each([
    [503, 'provider_unavailable'],
    [403, 'discord_reauth_required'],
  ] as const)(
    'preserves provider/auth failures instead of turning %s %s into a dashboard denial',
    async (status, code) => {
      const error = Object.assign(new Error('Provider unavailable'), { status, code })
      dashboardAccessMock.mockRejectedValueOnce(error)
      const response = makeRes()
      const next = vi.fn()
      await userAdminGuildScopeValidator({ params: { guildID: 'g1' }, panelUser: {} } as any, response, next)
      expect(next).toHaveBeenCalledExactlyOnceWith(error)
      expect(response.json).not.toHaveBeenCalled()
    },
  )

  describe('userValidator', () => {
    it('passes an absent compatibility credential as undefined after exact session resolution', async () => {
      readSessionCredentialMock.mockReturnValue(undefined)
      getPanelUserFromDiscordIDMock.mockResolvedValue({ discordID: 'd1' })
      const req = { params: { discordID: 'd1' }, headers: { authorization: 'Bearer tok1' } } as any
      const next = vi.fn()
      await userValidator(req, makeRes(), next)
      expect(getPanelUserFromDiscordIDMock).toHaveBeenCalledWith('d1', undefined, exactSession)
      expect(next).toHaveBeenCalledWith()
    })
    function makeReq(overrides: Record<string, any> = {}) {
      return { params: { discordID: 'd1' }, headers: { authorization: 'Bearer tok1' }, ...overrides } as any
    }

    it('returns 400 when discordID is missing', async () => {
      badArgumentMock.mockReturnValueOnce(true)
      const res = makeRes()
      await userValidator(makeReq(), res, vi.fn())
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('accepts an array-valued authorization header', async () => {
      getPanelUserFromDiscordIDMock.mockResolvedValueOnce({ authAllowed: vi.fn().mockResolvedValueOnce(true) })
      const next = vi.fn()
      await userValidator(makeReq({ headers: { authorization: ['Bearer tok1'] } }), makeRes(), next)
      expect(next).toHaveBeenCalledWith()
    })

    it('returns 401 when authorization is missing the Bearer prefix', async () => {
      const res = makeRes()
      await userValidator(makeReq({ headers: {} }), res, vi.fn())
      expect(res.status).toHaveBeenCalledWith(401)
    })

    it('returns 401 when there is no panel user', async () => {
      getPanelUserFromDiscordIDMock.mockResolvedValueOnce(null)
      const res = makeRes()
      await userValidator(makeReq(), res, vi.fn())
      expect(res.status).toHaveBeenCalledWith(401)
    })

    it('returns 401 when the presented session belongs to another account', async () => {
      resolveRequestSessionMock.mockResolvedValueOnce({ id: 'other-session', discordID: 'other-user' })
      const res = makeRes()
      await userValidator(makeReq(), res, vi.fn())
      expect(res.status).toHaveBeenCalledWith(401)
      expect(getPanelUserFromDiscordIDMock).not.toHaveBeenCalled()
    })

    it('accepts a cookie session and validates the mutation protections before dispatch', async () => {
      getPanelUserFromDiscordIDMock.mockResolvedValueOnce({ discordID: 'd1' })
      const req = makeReq({ method: 'POST', headers: { cookie: 'gmi_session=session-cookie' } })
      readSessionCredentialMock.mockReturnValueOnce('session-cookie')
      const next = vi.fn()
      await userValidator(req, makeRes(), next)
      expect(assertSessionRequestMock).toHaveBeenCalledWith(req, exactSession)
      expect(getPanelUserFromDiscordIDMock).toHaveBeenCalledWith('d1', 'session-cookie', exactSession)
      expect(req.authSession).toBe(exactSession)
      expect(next).toHaveBeenCalledWith()
    })

    it('does not dispatch a cookie mutation rejected by CSRF validation', async () => {
      const rejected = Object.assign(new Error('CSRF rejected'), { status: 403 })
      assertSessionRequestMock.mockImplementationOnce(() => {
        throw rejected
      })
      const next = vi.fn()
      await userValidator(makeReq(), makeRes(), next)
      expect(next).toHaveBeenCalledWith(rejected)
      expect(getPanelUserFromDiscordIDMock).not.toHaveBeenCalled()
    })

    it('attaches the panel user and calls next on success', async () => {
      const panelUser = { authAllowed: vi.fn().mockResolvedValueOnce(true) }
      getPanelUserFromDiscordIDMock.mockResolvedValueOnce(panelUser)
      const req = makeReq()
      const next = vi.fn()

      await userValidator(req, makeRes(), next)

      expect(req.panelUser).toBe(panelUser)
      expect(req.authSession).toBe(exactSession)
      expect(getPanelUserFromDiscordIDMock).toHaveBeenCalledWith('d1', 'tok1', exactSession)
      expect(next).toHaveBeenCalledWith()
    })

    it('forwards a thrown error to next', async () => {
      getPanelUserFromDiscordIDMock.mockRejectedValueOnce(new Error('db down'))
      const next = vi.fn()
      await userValidator(makeReq(), makeRes(), next)
      expect(next).toHaveBeenCalledWith(expect.any(Error))
    })
  })

  describe('userAdminGuildValidator', () => {
    function makeReq(overrides: Record<string, any> = {}) {
      return {
        params: { guildID: 'g1' },
        panelUser: { isAdminOfGuild: vi.fn().mockResolvedValue(true) },
        ...overrides,
      } as any
    }

    it.each([{ params: {} }, { panelUser: undefined }])(
      'rejects an incomplete guild scope before checking permissions: %j',
      async (overrides) => {
        const req = makeReq(overrides)
        const res = makeRes()
        const next = vi.fn()

        await userAdminGuildValidator(req, res, next)

        expect(res.status).toHaveBeenCalledWith(403)
        expect(res.json).toHaveBeenCalledWith({ error: 'dashboard_access_denied', reason: 'scope_unavailable' })
        expect(dashboardAccessMock).not.toHaveBeenCalled()
        expect(enqueueDiscordGuildSnapshotMock).not.toHaveBeenCalled()
        expect(req.guild).toBeUndefined()
        expect(next).not.toHaveBeenCalled()
      },
    )

    it('returns 403 when the panel user is not an admin of the guild', async () => {
      const req = makeReq({ panelUser: { isAdminOfGuild: vi.fn().mockResolvedValueOnce(false) } })
      const res = makeRes()
      await userAdminGuildValidator(req, res, vi.fn())
      expect(res.status).toHaveBeenCalledWith(403)
    })

    it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('requires fresh Discord permissions before %s', async (method) => {
      const request = makeReq({ method })
      enqueueDiscordGuildSnapshotMock.mockResolvedValueOnce({ id: 'g1' })
      await userAdminGuildValidator(request, makeRes(), vi.fn())
      expect(request.panelUser.isAdminOfGuild).toHaveBeenCalledWith('g1', { fresh: true })
    })

    it('checks the target guild rather than a body override when removing a custom bot', async () => {
      const admin = vi.fn(async (guildID) => guildID === 'g1')
      const req = makeReq({
        method: 'DELETE',
        params: { guildID: 'g2' },
        body: { guildID: 'g1' },
        panelUser: { isAdminOfGuild: admin },
      })
      const res = makeRes()
      const next = vi.fn()
      await userAdminGuildValidator(req, res, next)
      expect(admin).toHaveBeenCalledWith('g2', { fresh: true })
      expect(res.status).toHaveBeenCalledWith(403)
      expect(enqueueDiscordGuildSnapshotMock).not.toHaveBeenCalled()
      expect(next).not.toHaveBeenCalled()
    })

    it('returns 404 when the discord guild snapshot is not found', async () => {
      enqueueDiscordGuildSnapshotMock.mockResolvedValueOnce(null)
      const res = makeRes()
      await userAdminGuildValidator(makeReq(), res, vi.fn())
      expect(res.status).toHaveBeenCalledWith(404)
    })

    it('attaches the guild/dscGuild and calls next on success', async () => {
      const dscGuild = { id: 'g1' }
      enqueueDiscordGuildSnapshotMock.mockResolvedValueOnce(dscGuild)
      const req = makeReq()
      const next = vi.fn()

      await userAdminGuildValidator(req, makeRes(), next)

      expect(req.guild).toBeInstanceOf(FakeGuild)
      expect(req.dscGuild).toBe(dscGuild)
      expect(next).toHaveBeenCalledWith()
    })

    it('forwards a thrown error to next', async () => {
      const req = makeReq({ panelUser: { isAdminOfGuild: vi.fn().mockRejectedValueOnce(new Error('boom')) } })
      const next = vi.fn()
      await userAdminGuildValidator(req, makeRes(), next)
      expect(next).toHaveBeenCalledWith(expect.any(Error))
    })
  })

  describe('userGuildSnapshotValidator', () => {
    it.each([undefined, {}])('rejects a missing guild identity without contacting Discord: %j', async (guild) => {
      const res = makeRes()
      const next = vi.fn()

      await userGuildSnapshotValidator({ guild } as any, res, next)

      expect(res.status).toHaveBeenCalledWith(403)
      expect(res.json).toHaveBeenCalledWith({ error: 'dashboard_access_denied', reason: 'scope_unavailable' })
      expect(enqueueDiscordGuildSnapshotMock).not.toHaveBeenCalled()
      expect(next).not.toHaveBeenCalled()
    })

    it('forwards a snapshot provider failure without attaching Discord metadata', async () => {
      const unavailable = new Error('Discord snapshot unavailable')
      enqueueDiscordGuildSnapshotMock.mockRejectedValueOnce(unavailable)
      const req = { guild: { id: 'g1' } } as any
      const res = makeRes()
      const next = vi.fn()

      await userGuildSnapshotValidator(req, res, next)

      expect(enqueueDiscordGuildSnapshotMock).toHaveBeenCalledExactlyOnceWith('g1')
      expect(req.dscGuild).toBeUndefined()
      expect(res.json).not.toHaveBeenCalled()
      expect(next).toHaveBeenCalledExactlyOnceWith(unavailable)
    })
  })

  describe('userAdminGuildBotRemovalValidator', () => {
    it('permits authorized expired-bot cleanup without requiring an effective-bot snapshot', async () => {
      const administrator = vi.fn().mockResolvedValueOnce(true)
      enqueueDiscordGuildSnapshotMock.mockResolvedValueOnce(null)
      const req = {
        method: 'DELETE',
        params: { guildID: 'expired-guild' },
        panelUser: { isAdminOfGuild: administrator },
      } as any
      const next = vi.fn()
      await userAdminGuildBotRemovalValidator(req, makeRes(), next)
      expect(administrator).toHaveBeenCalledWith('expired-guild', { fresh: true })
      expect(enqueueDiscordGuildSnapshotMock).not.toHaveBeenCalled()
      expect(req.guild).toBeInstanceOf(FakeGuild)
      expect(req.guild.id).toBe('expired-guild')
      expect(next).toHaveBeenCalledWith()
    })

    it('refuses another guild’s administrator before constructing a cleanup target', async () => {
      const administrator = vi.fn(async (guildID) => guildID === 'g1')
      const req = {
        method: 'DELETE',
        params: { guildID: 'g2' },
        body: { guildID: 'g1' },
        panelUser: { isAdminOfGuild: administrator },
      } as any
      const res = makeRes()
      const next = vi.fn()
      await userAdminGuildBotRemovalValidator(req, res, next)
      expect(administrator).toHaveBeenCalledWith('g2', { fresh: true })
      expect(res.status).toHaveBeenCalledWith(403)
      expect(req.guild).toBeUndefined()
      expect(next).not.toHaveBeenCalled()
    })

    it('forwards an unavailable permission check without running cleanup', async () => {
      const unavailable = new Error('Permissions unavailable')
      const req = {
        method: 'DELETE',
        params: { guildID: 'g1' },
        panelUser: { isAdminOfGuild: vi.fn().mockRejectedValueOnce(unavailable) },
      } as any
      const next = vi.fn()
      await userAdminGuildBotRemovalValidator(req, makeRes(), next)
      expect(req.guild).toBeUndefined()
      expect(next).toHaveBeenCalledWith(unavailable)
    })
  })

  describe('configuration reads without a Discord bot snapshot', () => {
    const app = express()
    const settings = { ig_debug: true }
    const readSettings = vi.fn()
    app.get(
      '/users/:discordID/guilds/:guildID/servers/:serverID/config',
      userValidator,
      userAdminGuildScopeValidator,
      userServerValidator,
      async (req, res) => res.json({ settings: await req.server!.getAllIGSettings() }),
    )
    app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(503).json({ error: 'provider_unavailable' })
    })
    const endpoint = '/users/d1/guilds/g1/servers/s1/config'
    const get = (url = endpoint) => request(app).get(url).set('Authorization', 'Bearer tok1')

    beforeEach(() => {
      readSettings.mockReset().mockResolvedValue(settings)
      getPanelUserFromDiscordIDMock.mockResolvedValue({ isAdminOfGuild: vi.fn().mockResolvedValue(true) })
      getServerFromIDMock.mockResolvedValue({ getGuildID: () => 'g1', getAllIGSettings: readSettings })
      enqueueDiscordGuildSnapshotMock.mockRejectedValue(new Error('The Discord worker must not be needed'))
    })

    it('reads stored settings after authorization even when the Discord worker is unavailable', async () => {
      const response = await get()
      expect(response.status).toBe(200)
      expect(response.body).toEqual({ settings })
      expect(getServerFromIDMock).toHaveBeenCalledWith('s1')
      expect(readSettings).toHaveBeenCalledOnce()
      expect(enqueueDiscordGuildSnapshotMock).not.toHaveBeenCalled()
      const timings = response.headers['server-timing']
      for (const step of ['session', 'user', 'permissions', 'server']) {
        expect(timings).toMatch(new RegExp(`${step};dur=\\d+\\.\\d`))
      }
      expect(timings).not.toContain('discord;')
    })

    it('rejects an anonymous or mismatched account before reading settings', async () => {
      expect((await request(app).get(endpoint)).status).toBe(401)
      expect((await get('/users/other/guilds/g1/servers/s1/config')).status).toBe(401)
      expect(getServerFromIDMock).not.toHaveBeenCalled()
      expect(readSettings).not.toHaveBeenCalled()
    })

    it('requires administration of the guild from the route', async () => {
      const administrator = vi.fn(async (guildID) => guildID === 'g1')
      getPanelUserFromDiscordIDMock.mockResolvedValue({ isAdminOfGuild: administrator })
      const response = await get('/users/d1/guilds/g2/servers/s1/config')
      expect(response.status).toBe(403)
      expect(administrator).toHaveBeenCalledWith('g2')
      expect(getServerFromIDMock).not.toHaveBeenCalled()
      expect(readSettings).not.toHaveBeenCalled()
    })

    it('rejects a server belonging to another guild without consulting a bot snapshot', async () => {
      getServerFromIDMock.mockResolvedValueOnce({ getGuildID: () => 'g2', getAllIGSettings: readSettings })
      expect((await get()).status).toBe(403)
      expect(readSettings).not.toHaveBeenCalled()
      expect(enqueueDiscordGuildSnapshotMock).not.toHaveBeenCalled()
    })

    it('returns 404 for a missing server', async () => {
      getServerFromIDMock.mockResolvedValueOnce(null)
      expect((await get()).status).toBe(404)
      expect(readSettings).not.toHaveBeenCalled()
    })

    it('forwards a failed administrator lookup without reading settings', async () => {
      getPanelUserFromDiscordIDMock.mockResolvedValue({
        isAdminOfGuild: vi.fn().mockRejectedValue(new Error('Discord permissions unavailable')),
      })
      expect((await get()).status).toBe(503)
      expect(getServerFromIDMock).not.toHaveBeenCalled()
      expect(readSettings).not.toHaveBeenCalled()
    })
  })

  describe('read-only status preview authorization', () => {
    const app = express()
    const renderPreview = vi.fn()
    const publish = vi.fn()
    const prefix = '/users/:discordID/guilds/:guildID/servers/:serverID/status'
    app.use(express.json())
    app.post(
      `${prefix}/preview`,
      userValidator,
      userAdminGuildReadOnlyValidator,
      userServerReadOnlyValidator,
      (_req, res) => {
        renderPreview()
        res.json({ preview: true })
      },
    )
    app.post(prefix, userValidator, userAdminGuildValidator, userServerValidator, (_req, res) => {
      publish()
      res.json({ published: true })
    })
    app.use(
      (
        error: Error & { status?: number },
        _req: express.Request,
        res: express.Response,
        _next: express.NextFunction,
      ) => {
        res.status(error.status || 503).json({ error: 'request_rejected' })
      },
    )
    const endpoint = '/users/d1/guilds/g1/servers/s1/status'
    const post = (url = `${endpoint}/preview`) => request(app).post(url).set('Authorization', 'Bearer tok1')
    let administrator: ReturnType<typeof vi.fn>

    beforeEach(() => {
      renderPreview.mockReset()
      publish.mockReset()
      administrator = vi.fn().mockResolvedValue(true)
      getPanelUserFromDiscordIDMock.mockResolvedValue({ isAdminOfGuild: administrator })
      getServerFromIDMock.mockResolvedValue({ getGuildID: () => 'g1' })
      enqueueDiscordGuildSnapshotMock.mockResolvedValue({ id: 'g1' })
    })

    it('renders successive draft previews with cached guild and exact-server authorization', async () => {
      administrator.mockImplementation(async (_guildID, options) => {
        if (options?.fresh) throw Object.assign(new Error('Discord rate limited'), { status: 503 })
        return true
      })
      expect((await post()).status).toBe(200)
      expect((await post()).status).toBe(200)
      expect(renderPreview).toHaveBeenCalledTimes(2)
      expect(dashboardAccessMock).toHaveBeenCalledTimes(4)
      for (const [, guildID, options] of dashboardAccessMock.mock.calls) {
        expect(guildID).toBe('g1')
        expect(options.fresh).toBe(false)
      }
      expect(dashboardAccessMock).toHaveBeenCalledWith(expect.anything(), 'g1', {
        serverID: 's1',
        fresh: false,
        permissionScope: expect.any(Object),
      })
      expect(enqueueDiscordGuildSnapshotMock).not.toHaveBeenCalled()
    })

    it('still requires fresh permission checks when publishing a message', async () => {
      expect((await post(endpoint)).status).toBe(200)
      expect(administrator).toHaveBeenCalledTimes(2)
      expect(administrator).toHaveBeenNthCalledWith(1, 'g1', { fresh: true })
      expect(administrator).toHaveBeenNthCalledWith(2, 'g1', { fresh: true })
      expect(publish).toHaveBeenCalledOnce()
    })

    it('rejects an anonymous preview before any permission or server lookup', async () => {
      expect((await request(app).post(`${endpoint}/preview`)).status).toBe(401)
      expect(dashboardAccessMock).not.toHaveBeenCalled()
      expect(getServerFromIDMock).not.toHaveBeenCalled()
      expect(renderPreview).not.toHaveBeenCalled()
    })

    it('keeps POST session and CSRF validation before preview authorization', async () => {
      assertSessionRequestMock.mockImplementationOnce(() => {
        throw Object.assign(new Error('CSRF rejected'), { status: 403 })
      })
      expect((await post()).status).toBe(403)
      expect(assertSessionRequestMock).toHaveBeenCalledOnce()
      expect(dashboardAccessMock).not.toHaveBeenCalled()
      expect(getServerFromIDMock).not.toHaveBeenCalled()
      expect(renderPreview).not.toHaveBeenCalled()
    })

    it('rejects access to a foreign route guild despite an authorized body override', async () => {
      administrator.mockImplementation(async (guildID) => guildID === 'g1')
      expect((await post(`${endpoint.replace('/g1/', '/g2/')}/preview`).send({ guildID: 'g1' })).status).toBe(403)
      expect(administrator).toHaveBeenCalledExactlyOnceWith('g2')
      expect(getServerFromIDMock).not.toHaveBeenCalled()
      expect(renderPreview).not.toHaveBeenCalled()
    })

    it('rejects a server from another guild before rendering the preview', async () => {
      getServerFromIDMock.mockResolvedValueOnce({ getGuildID: () => 'g2' })
      expect((await post()).status).toBe(403)
      expect(renderPreview).not.toHaveBeenCalled()
    })

    it('rechecks exact-server access even after guild authorization succeeds', async () => {
      dashboardAccessMock
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce({ allowed: false, reason: 'game_admin_required' })
      const result = await post()
      expect(result.status).toBe(403)
      expect(result.body).toEqual({ error: 'dashboard_access_denied', reason: 'game_admin_required' })
      expect(renderPreview).not.toHaveBeenCalled()
    })

    it.each([
      [403, 'discord_reauth_required'],
      [503, 'provider_unavailable'],
    ])('forwards permission credential failure %s %s without rendering', async (status, code) => {
      administrator.mockRejectedValueOnce(Object.assign(new Error('Credentials unavailable'), { status, code }))
      expect((await post()).status).toBe(status)
      expect(getServerFromIDMock).not.toHaveBeenCalled()
      expect(renderPreview).not.toHaveBeenCalled()
    })
  })

  describe('userServerValidator', () => {
    function makeReq(overrides: Record<string, any> = {}) {
      return {
        params: { serverID: 's1' },
        guild: { id: 'g1' },
        panelUser: { isAdminOfGuild: vi.fn().mockResolvedValue(true) },
        ...overrides,
      } as any
    }

    it('returns 404 when the server is not found', async () => {
      getServerFromIDMock.mockResolvedValueOnce(null)
      const res = makeRes()
      await userServerValidator(makeReq(), res, vi.fn())
      expect(res.status).toHaveBeenCalledWith(404)
    })

    it('returns 403 when the server does not belong to the guild', async () => {
      getServerFromIDMock.mockResolvedValueOnce({ getGuildID: () => 'other-guild' })
      const res = makeRes()
      await userServerValidator(makeReq(), res, vi.fn())
      expect(res.status).toHaveBeenCalledWith(403)
    })

    it('rejects a missing panel context without granting access to the server', async () => {
      getServerFromIDMock.mockResolvedValueOnce({ getGuildID: () => 'g1' })
      const req = makeReq({ panelUser: undefined })
      const res = makeRes()
      const next = vi.fn()

      await userServerValidator(req, res, next)

      expect(res.status).toHaveBeenCalledWith(403)
      expect(res.json).toHaveBeenCalledWith({ error: 'dashboard_access_denied', reason: 'scope_unavailable' })
      expect(dashboardAccessMock).not.toHaveBeenCalled()
      expect(req.server).toBeUndefined()
      expect(next).not.toHaveBeenCalled()
    })

    it('attaches the server and calls next on success', async () => {
      const server = { getGuildID: () => 'g1' }
      getServerFromIDMock.mockResolvedValueOnce(server)
      const req = makeReq()
      const next = vi.fn()

      await userServerValidator(req, makeRes(), next)

      expect(req.server).toBe(server)
      expect(next).toHaveBeenCalledWith()
    })

    it.each(['GET', 'PUT', 'POST', 'DELETE'])(
      'rechecks the exact target server instead of inheriting another server’s guild grant: %s',
      async (method) => {
        getServerFromIDMock.mockResolvedValueOnce({ getGuildID: () => 'g1' })
        dashboardAccessMock.mockResolvedValueOnce(false)
        const req = makeReq({ method })
        const res = makeRes()
        const next = vi.fn()
        await userServerValidator(req, res, next)
        expect(dashboardAccessMock).toHaveBeenCalledWith(req.panelUser, 'g1', {
          serverID: 's1',
          fresh: method !== 'GET',
          permissionScope: req,
        })
        expect(res.status).toHaveBeenCalledWith(403)
        expect(req.server).toBeUndefined()
        expect(next).not.toHaveBeenCalled()
      },
    )

    it('forwards a thrown error to next', async () => {
      getServerFromIDMock.mockRejectedValueOnce(new Error('db down'))
      const next = vi.fn()
      await userServerValidator(makeReq(), makeRes(), next)
      expect(next).toHaveBeenCalledWith(expect.any(Error))
    })
  })

  describe('userAdminValidator', () => {
    function makeReq(overrides: Record<string, any> = {}) {
      return { panelUser: { discordID: 'd1' }, ...overrides } as any
    }

    it.each([{ actorDiscordID: 'operator' }, { actorSessionID: 'parent' }])(
      'rejects delegated access to legacy admin routes %j',
      async (authSession) => {
        const res = makeRes()
        const next = vi.fn()
        await userAdminValidator(makeReq({ authSession }), res, next)
        expect(res.status).toHaveBeenCalledWith(403)
        expect(res.json).toHaveBeenCalledWith({ error: 'own_admin_session_required' })
        expect(getUserFromDiscordIDMock).not.toHaveBeenCalled()
        expect(next).not.toHaveBeenCalled()
      },
    )

    it('returns 404 when the user is not found', async () => {
      getUserFromDiscordIDMock.mockResolvedValueOnce(null)
      const res = makeRes()
      await userAdminValidator(makeReq(), res, vi.fn())
      expect(res.status).toHaveBeenCalledWith(404)
    })

    it('returns 403 when the user is not a developer', async () => {
      getUserFromDiscordIDMock.mockResolvedValueOnce({ isDeveloper: () => false })
      const res = makeRes()
      await userAdminValidator(makeReq(), res, vi.fn())
      expect(res.status).toHaveBeenCalledWith(403)
    })

    it('calls next when the user is a developer', async () => {
      getUserFromDiscordIDMock.mockResolvedValueOnce({ isDeveloper: () => true })
      const next = vi.fn()
      await userAdminValidator(makeReq(), makeRes(), next)
      expect(next).toHaveBeenCalledWith()
    })

    it('forwards a thrown error to next', async () => {
      getUserFromDiscordIDMock.mockRejectedValueOnce(new Error('db down'))
      const next = vi.fn()
      await userAdminValidator(makeReq(), makeRes(), next)
      expect(next).toHaveBeenCalledWith(expect.any(Error))
    })
  })
})
