import { beforeEach, describe, expect, it, vi } from 'vitest'

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

const { userValidator, userAdminGuildValidator, userServerValidator, userAdminValidator } =
  await import('../../../src/middleware/v3/userValidator.js')

function makeRes() {
  const res: any = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  return res
}

function resetAllMocks() {
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

  describe('userServerValidator', () => {
    function makeReq(overrides: Record<string, any> = {}) {
      return { params: { serverID: 's1' }, dscGuild: { id: 'g1' }, ...overrides } as any
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

    it('attaches the server and calls next on success', async () => {
      const server = { getGuildID: () => 'g1' }
      getServerFromIDMock.mockResolvedValueOnce(server)
      const req = makeReq()
      const next = vi.fn()

      await userServerValidator(req, makeRes(), next)

      expect(req.server).toBe(server)
      expect(next).toHaveBeenCalledWith()
    })

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
