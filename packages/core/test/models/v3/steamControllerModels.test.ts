import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@gmod/config', () => ({
  ConfigServer: { domain: 'https://gmod-integration.com', websiteUrl: 'https://gmod-integration.com' },
}))

const axiosPostMock = vi.fn()
vi.mock('axios', () => ({ default: { post: axiosPostMock } }))

const gmLogMock = vi.fn()
vi.mock('../../../src/utils/logger.js', () => ({ gmLog: gmLogMock }))

const removeDiscordSyncMock = vi.fn()
const removeServerSyncMock = vi.fn()
vi.mock('../../../src/classes/v3/PlayerGmod.js', () => ({
  removeDiscordSync: removeDiscordSyncMock,
  removeServerSync: removeServerSyncMock,
}))

const getPanelUserFromDiscordIDMock = vi.fn()
vi.mock('@gmod/domain-user/PanelUser.js', () => ({ getPanelUserFromDiscordID: getPanelUserFromDiscordIDMock }))

const enqueueDiscordGuildVerifyUserMock = vi.fn()
vi.mock('@gmod/infra-bullmq/discordQueueAdapters.js', () => ({
  enqueueDiscordGuildVerifyUser: enqueueDiscordGuildVerifyUserMock,
}))

const prismaMock: any = {
  gm_user: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  gm_users_transfers: { create: vi.fn() },
  gm_guild: { findFirst: vi.fn() },
}
vi.mock('@gmod/infra-prisma', () => ({ default: prismaMock }))

const { processSteamVerification, processSteamVerificationReturn } = await import(
  '../../../src/models/v3/steamControllerModels.js'
)

function resetAllMocks() {
  axiosPostMock.mockReset()
  gmLogMock.mockClear()
  removeDiscordSyncMock.mockReset()
  removeServerSyncMock.mockReset()
  getPanelUserFromDiscordIDMock.mockReset()
  enqueueDiscordGuildVerifyUserMock.mockReset()
  for (const table of Object.values(prismaMock)) {
    for (const fn of Object.values(table as Record<string, any>)) {
      ;(fn as ReturnType<typeof vi.fn>).mockReset()
    }
  }
}

describe('steamControllerModels', () => {
  beforeEach(() => {
    resetAllMocks()
  })

  describe('processSteamVerification', () => {
    it('returns 400 when the verification code is missing', () => {
      const result = processSteamVerification({})
      expect(result).toEqual({ kind: 'text', status: 400, text: 'Verification code is required' })
    })

    it('extracts the code from an array-valued query param', () => {
      const result = processSteamVerification({ verificationCode: ['code1'] })
      expect(result.kind).toBe('redirect')
    })

    it('returns a redirect to the Steam OpenID login URL', () => {
      const result = processSteamVerification({ verificationCode: 'code1' })
      expect(result).toEqual(
        expect.objectContaining({ kind: 'redirect', status: 302, url: expect.stringContaining('steamcommunity.com/openid/login') }),
      )
      expect((result as any).url).toContain('code1')
    })

    it('falls back to an empty realm when ConfigServer.domain is unset', async () => {
      const { ConfigServer } = await import('@gmod/config')
      const original = (ConfigServer as any).domain
      ;(ConfigServer as any).domain = ''
      try {
        const result = processSteamVerification({ verificationCode: 'code1' })
        expect((result as any).url).toContain('openid.realm=')
      } finally {
        ;(ConfigServer as any).domain = original
      }
    })
  })

  describe('processSteamVerificationReturn', () => {
    it('returns 400 when the verification code is missing', async () => {
      const result = await processSteamVerificationReturn({})
      expect(result).toEqual({ kind: 'text', status: 400, text: 'Verification code is missing' })
    })

    it('returns 400 when the verification code does not match any user', async () => {
      prismaMock.gm_user.findFirst.mockResolvedValueOnce(null)
      const result = await processSteamVerificationReturn({ verificationCode: 'code1' })
      expect(result).toEqual({ kind: 'text', status: 400, text: 'Verification code is invalid or expired' })
    })

    it('returns a 200 failure message when Steam reports the assertion as invalid', async () => {
      prismaMock.gm_user.findFirst.mockResolvedValueOnce({ id: 'u1' })
      axiosPostMock.mockResolvedValueOnce({ data: 'is_valid:false' })

      const result = await processSteamVerificationReturn({ verificationCode: 'code1' })

      expect(result).toEqual({ kind: 'json', status: 200, body: { message: 'Authentication failed' } })
    })

    it('returns a 200 failure message when the claimed_id has no steamID64 segment', async () => {
      prismaMock.gm_user.findFirst.mockResolvedValueOnce({ id: 'u1' })
      axiosPostMock.mockResolvedValueOnce({ data: 'is_valid:true' })

      const result = await processSteamVerificationReturn({
        verificationCode: 'code1',
        'openid.claimed_id': '',
      })

      expect(result).toEqual({ kind: 'json', status: 200, body: { message: 'Authentication failed' } })
    })

    it('links the steam account and redirects on success, with no panel user', async () => {
      prismaMock.gm_user.findFirst.mockResolvedValueOnce({ id: 'u1' })
      axiosPostMock.mockResolvedValueOnce({ data: 'is_valid:true' })
      prismaMock.gm_user.findMany.mockResolvedValueOnce([])
      prismaMock.gm_user.update.mockResolvedValueOnce({})
      getPanelUserFromDiscordIDMock.mockResolvedValueOnce(null)

      const result = await processSteamVerificationReturn({
        verificationCode: 'code1',
        'openid.claimed_id': 'https://steamcommunity.com/openid/id/765',
      })

      expect(prismaMock.gm_user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'u1' }, data: expect.objectContaining({ steam: '765' }) }),
      )
      expect(result).toEqual({ kind: 'redirect', status: 302, url: 'https://gmod-integration.com/account' })
    })

    it('cleans up prior owners of the same steamID64, skipping the current user, and enqueues guild verification', async () => {
      prismaMock.gm_user.findFirst.mockResolvedValueOnce({ id: 'u1' })
      axiosPostMock.mockResolvedValueOnce({ data: 'is_valid:true' })
      prismaMock.gm_user.findMany.mockResolvedValueOnce([
        { id: 'u1', steam: '765' }, // same user+steam -> skipped
        { id: 'u2', steam: '111' }, // prior owner, different old steam value -> cleaned up
        { id: 'u2', steam: '111' }, // duplicate discord/steam id -> dedupe branches
      ])
      prismaMock.gm_users_transfers.create.mockResolvedValue({})
      prismaMock.gm_user.update.mockResolvedValue({})
      getPanelUserFromDiscordIDMock.mockResolvedValueOnce({
        findGuilds: vi.fn().mockResolvedValueOnce([{ id: 'g1' }, { id: 'g2' }]),
      })
      prismaMock.gm_guild.findFirst
        .mockResolvedValueOnce(null) // g1: no db guild -> skipped
        .mockResolvedValueOnce({ guild: 'g2' }) // g2: has db guild -> enqueue

      const result = await processSteamVerificationReturn({
        verificationCode: 'code1',
        'openid.claimed_id': 'https://steamcommunity.com/openid/id/765',
      })

      expect(removeDiscordSyncMock).toHaveBeenCalledTimes(1)
      expect(removeDiscordSyncMock).toHaveBeenCalledWith('u2')
      expect(removeServerSyncMock).toHaveBeenCalledTimes(1)
      expect(enqueueDiscordGuildVerifyUserMock).toHaveBeenCalledTimes(1)
      expect(enqueueDiscordGuildVerifyUserMock).toHaveBeenCalledWith('g2', 'u1')
      expect(result.kind).toBe('redirect')
    })

    it('handles a prior owner with no steam value set', async () => {
      prismaMock.gm_user.findFirst.mockResolvedValueOnce({ id: 'u1' })
      axiosPostMock.mockResolvedValueOnce({ data: 'is_valid:true' })
      prismaMock.gm_user.findMany.mockResolvedValueOnce([{ id: 'u2', steam: null }])
      prismaMock.gm_users_transfers.create.mockResolvedValue({})
      prismaMock.gm_user.update.mockResolvedValue({})
      getPanelUserFromDiscordIDMock.mockResolvedValueOnce(null)

      await processSteamVerificationReturn({
        verificationCode: 'code1',
        'openid.claimed_id': 'https://steamcommunity.com/openid/id/765',
      })

      expect(prismaMock.gm_users_transfers.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ oldSteamID64: '' }) }),
      )
      expect(removeServerSyncMock).not.toHaveBeenCalled()
    })

    it('returns a 500 error result when axios throws', async () => {
      prismaMock.gm_user.findFirst.mockResolvedValueOnce({ id: 'u1' })
      axiosPostMock.mockRejectedValueOnce(new Error('steam api down'))

      const result = await processSteamVerificationReturn({ verificationCode: 'code1' })

      expect(result).toEqual({
        kind: 'json',
        status: 500,
        body: { message: 'An error occurred during authentication', error: 'steam api down' },
      })
    })
  })
})
