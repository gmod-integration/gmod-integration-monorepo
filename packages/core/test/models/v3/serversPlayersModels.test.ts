import { beforeEach, describe, expect, it, vi } from 'vitest'

const getSteamUserAvatarLargeMock = vi.fn(async () => 'https://avatar.example')
vi.mock('@gmod/infra-steam', () => ({ getSteamUserAvatarLarge: getSteamUserAvatarLargeMock }))

const getRandomDiscordRelayMock = vi.fn(() => 'https://relay.example')
vi.mock('../../../src/utils/tools.js', () => ({ getRandomDiscordRelay: getRandomDiscordRelayMock }))

vi.mock('@gmod/config', () => ({ ConfigDiscord: { barerTokenRelay: 'relay-token' } }))

const prismaMock: any = {
  users: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
  gm_user_steam: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
}
vi.mock('@gmod/infra-prisma', () => ({ default: prismaMock }))

const { sendPlayerSay, saveConnectionGlobalInfo, saveConnectionSteamInfo } = await import(
  '../../../src/models/v3/serversPlayersModels.js'
)

function makePlayer(overrides: Record<string, any> = {}) {
  return {
    steamID64: '765',
    name: 'Bob',
    userGroup: 'user',
    team: { name: 'Red' },
    ...overrides,
  } as any
}

function makeServer(overrides: Record<string, any> = {}) {
  return {
    getSyncChatChannel: vi.fn().mockResolvedValue({ id: 'wh1', token: 'tok' }),
    getSetting: vi.fn().mockImplementation(async (key: string) => {
      if (key === 'syncChatDirection') return 'both'
      if (key === 'chat_sync_relay_all') return true
      if (key === 'sync_chat_prevent_ping') return false
      return undefined
    }),
    getGmodToDiscordFilter: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as any
}

describe('serversPlayersModels', () => {
  beforeEach(() => {
    getSteamUserAvatarLargeMock.mockReset().mockResolvedValue('https://avatar.example')
    getRandomDiscordRelayMock.mockClear()
    for (const table of Object.values(prismaMock)) {
      for (const fn of Object.values(table as Record<string, any>)) {
        ;(fn as ReturnType<typeof vi.fn>).mockReset()
      }
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
  })

  describe('sendPlayerSay', () => {
    it('skips when the text is empty', async () => {
      await expect(sendPlayerSay(makeServer(), makePlayer(), '', false)).resolves.toEqual({
        skip: true,
        message: 'No message',
      })
    })

    it('skips when there is no sync chat channel', async () => {
      const server = makeServer({ getSyncChatChannel: vi.fn().mockResolvedValue(null) })
      await expect(sendPlayerSay(server, makePlayer(), 'hi', false)).resolves.toEqual({
        skip: true,
        message: 'Sync chat channel not found or not set',
      })
    })

    it('skips when the sync direction is discord-to-gmod only', async () => {
      const server = makeServer({
        getSetting: vi.fn().mockImplementation(async (key: string) => (key === 'syncChatDirection' ? 'discordToGmod' : true)),
      })
      await expect(sendPlayerSay(server, makePlayer(), 'hi', false)).resolves.toEqual({
        skip: true,
        message: 'Sync chat direction is discord to gmod',
      })
    })

    it('skips when the message is too long', async () => {
      await expect(sendPlayerSay(makeServer(), makePlayer(), 'a'.repeat(2001), false)).resolves.toEqual({
        skip: true,
        message: 'Message too long',
      })
    })

    it('skips when chat_sync_relay_all is off and no filter rule turns it back on', async () => {
      const server = makeServer({
        getSetting: vi.fn().mockImplementation(async (key: string) => {
          if (key === 'syncChatDirection') return 'both'
          if (key === 'chat_sync_relay_all') return false
          return false
        }),
      })
      await expect(sendPlayerSay(server, makePlayer(), 'hi', false)).resolves.toEqual({
        skip: true,
        message: 'Message blocked',
      })
    })

    it('sends the message via the relay on the happy path', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true })
      vi.stubGlobal('fetch', fetchMock)

      const result = await sendPlayerSay(makeServer(), makePlayer(), 'hello world', false)

      expect(fetchMock).toHaveBeenCalledWith('https://relay.example', expect.objectContaining({ method: 'POST' }))
      const body = JSON.parse((fetchMock.mock.calls[0][1] as any).body)
      expect(body.data.content).toBe('hello world')
      expect(body.data.username).toBe('Bob')
      expect(result).toEqual({ success: true })
    })

    it('masks ping-triggering "@" characters when sync_chat_prevent_ping is on', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true })
      vi.stubGlobal('fetch', fetchMock)
      const server = makeServer({
        getSetting: vi.fn().mockImplementation(async (key: string) => {
          if (key === 'syncChatDirection') return 'both'
          if (key === 'chat_sync_relay_all') return true
          if (key === 'sync_chat_prevent_ping') return true
          return undefined
        }),
      })

      await sendPlayerSay(server, makePlayer(), '@everyone hi', false)

      const body = JSON.parse((fetchMock.mock.calls[0][1] as any).body)
      expect(body.data.content).toContain('@​everyone')
    })

    it('returns a failed skip result when the relay responds not-ok', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))
      await expect(sendPlayerSay(makeServer(), makePlayer(), 'hi', false)).resolves.toEqual({
        skip: true,
        failed: true,
        message: 'Webhook relay failed with status 404',
      })
    })

    it('falls back to the default avatar when the Steam avatar lookup fails', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true })
      vi.stubGlobal('fetch', fetchMock)
      getSteamUserAvatarLargeMock.mockRejectedValueOnce(new Error('steam down'))

      await sendPlayerSay(makeServer(), makePlayer(), 'hi', false)

      const body = JSON.parse((fetchMock.mock.calls[0][1] as any).body)
      expect(body.data.avatarURL).toBe('https://i.imgur.com/MfkZJfm.jpeg')
    })

    it('falls back to "Unknown" as the username when the player has no name', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true })
      vi.stubGlobal('fetch', fetchMock)

      await sendPlayerSay(makeServer(), makePlayer({ name: '' }), 'hi', false)

      const body = JSON.parse((fetchMock.mock.calls[0][1] as any).body)
      expect(body.data.username).toBe('Unknown')
    })

    describe('chat filter rules', () => {
      const baseRule = { active: true, element: 'message', operator: 'equal', action: 'block', trigger: 'stop' }

      it('ignores an inactive rule', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true })
        vi.stubGlobal('fetch', fetchMock)
        const server = makeServer({
          getGmodToDiscordFilter: vi.fn().mockResolvedValue([{ ...baseRule, active: false }]),
        })
        await sendPlayerSay(server, makePlayer(), 'stop', false)
        expect(fetchMock).toHaveBeenCalled()
      })

      it('ignores a rule with an unrecognized element', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true })
        vi.stubGlobal('fetch', fetchMock)
        const server = makeServer({
          getGmodToDiscordFilter: vi.fn().mockResolvedValue([{ ...baseRule, element: 'not_a_real_field' }]),
        })
        await sendPlayerSay(server, makePlayer(), 'stop', false)
        expect(fetchMock).toHaveBeenCalled()
      })

      it('ignores a rule with an unrecognized operator', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true })
        vi.stubGlobal('fetch', fetchMock)
        const server = makeServer({
          getGmodToDiscordFilter: vi.fn().mockResolvedValue([{ ...baseRule, operator: 'not_a_real_operator' }]),
        })
        await sendPlayerSay(server, makePlayer(), 'stop', false)
        expect(fetchMock).toHaveBeenCalled()
      })

      it('ignores a rule with an unrecognized action', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true })
        vi.stubGlobal('fetch', fetchMock)
        const server = makeServer({
          getGmodToDiscordFilter: vi.fn().mockResolvedValue([{ ...baseRule, action: 'not_a_real_action' }]),
        })
        await sendPlayerSay(server, makePlayer(), 'stop', false)
        expect(fetchMock).toHaveBeenCalled()
      })

      it('ignores a rule with an empty trigger', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true })
        vi.stubGlobal('fetch', fetchMock)
        const server = makeServer({
          getGmodToDiscordFilter: vi.fn().mockResolvedValue([{ ...baseRule, trigger: '' }]),
        })
        await sendPlayerSay(server, makePlayer(), 'stop', false)
        expect(fetchMock).toHaveBeenCalled()
      })

      it('blocks the message when an "equal" rule on the message matches', async () => {
        const server = makeServer({ getGmodToDiscordFilter: vi.fn().mockResolvedValue([baseRule]) })
        await expect(sendPlayerSay(server, makePlayer(), 'stop', false)).resolves.toEqual({
          skip: true,
          message: 'Message blocked',
        })
      })

      it('does not block when an "equal" rule does not match', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true })
        vi.stubGlobal('fetch', fetchMock)
        const server = makeServer({ getGmodToDiscordFilter: vi.fn().mockResolvedValue([baseRule]) })
        await sendPlayerSay(server, makePlayer(), 'go', false)
        expect(fetchMock).toHaveBeenCalled()
      })

      it('blocks via a "notEqual" rule on steamID64', async () => {
        const server = makeServer({
          getGmodToDiscordFilter: vi
            .fn()
            .mockResolvedValue([{ ...baseRule, element: 'steamID64', operator: 'notEqual', trigger: 'other-id' }]),
        })
        await expect(sendPlayerSay(server, makePlayer(), 'hi', false)).resolves.toEqual({
          skip: true,
          message: 'Message blocked',
        })
      })

      it('does not block via "notEqual" when the values match', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true })
        vi.stubGlobal('fetch', fetchMock)
        const server = makeServer({
          getGmodToDiscordFilter: vi
            .fn()
            .mockResolvedValue([{ ...baseRule, element: 'steamID64', operator: 'notEqual', trigger: '765' }]),
        })
        await sendPlayerSay(server, makePlayer(), 'hi', false)
        expect(fetchMock).toHaveBeenCalled()
      })

      it('blocks via a "contain" rule on userGroup', async () => {
        const server = makeServer({
          getGmodToDiscordFilter: vi
            .fn()
            .mockResolvedValue([{ ...baseRule, element: 'userGroup', operator: 'contain', trigger: 'us' }]),
        })
        await expect(sendPlayerSay(server, makePlayer(), 'hi', false)).resolves.toEqual({
          skip: true,
          message: 'Message blocked',
        })
      })

      it('does not block via "contain" when the value does not contain the trigger', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true })
        vi.stubGlobal('fetch', fetchMock)
        const server = makeServer({
          getGmodToDiscordFilter: vi
            .fn()
            .mockResolvedValue([{ ...baseRule, element: 'userGroup', operator: 'contain', trigger: 'zz' }]),
        })
        await sendPlayerSay(server, makePlayer(), 'hi', false)
        expect(fetchMock).toHaveBeenCalled()
      })

      it('blocks via a "notContain" rule on teamName', async () => {
        const server = makeServer({
          getGmodToDiscordFilter: vi
            .fn()
            .mockResolvedValue([{ ...baseRule, element: 'teamName', operator: 'notContain', trigger: 'zz' }]),
        })
        await expect(sendPlayerSay(server, makePlayer(), 'hi', false)).resolves.toEqual({
          skip: true,
          message: 'Message blocked',
        })
      })

      it('does not block via "notContain" when the value does contain the trigger', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true })
        vi.stubGlobal('fetch', fetchMock)
        const server = makeServer({
          getGmodToDiscordFilter: vi
            .fn()
            .mockResolvedValue([{ ...baseRule, element: 'teamName', operator: 'notContain', trigger: 'Re' }]),
        })
        await sendPlayerSay(server, makePlayer(), 'hi', false)
        expect(fetchMock).toHaveBeenCalled()
      })

      it('strips the matched prefix and blocks via a "startWith" rule', async () => {
        const server = makeServer({
          getGmodToDiscordFilter: vi
            .fn()
            .mockResolvedValue([{ ...baseRule, operator: 'startWith', trigger: 'stop', action: 'anonymize' }]),
        })
        const fetchMock = vi.fn().mockResolvedValue({ ok: true })
        vi.stubGlobal('fetch', fetchMock)

        await sendPlayerSay(server, makePlayer(), 'stop the presses', false)

        const body = JSON.parse((fetchMock.mock.calls[0][1] as any).body)
        expect(body.data.content).toBe(' the presses')
        expect(body.data.username).toBe('Anonymous')
      })

      it('does not match "startWith" when the message does not start with the trigger', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true })
        vi.stubGlobal('fetch', fetchMock)
        const server = makeServer({
          getGmodToDiscordFilter: vi.fn().mockResolvedValue([{ ...baseRule, operator: 'startWith', trigger: 'zzz' }]),
        })
        await sendPlayerSay(server, makePlayer(), 'stop the presses', false)
        expect(fetchMock).toHaveBeenCalled()
      })

      it('strips the matched suffix and blocks via an "endWith" rule', async () => {
        const server = makeServer({
          getGmodToDiscordFilter: vi.fn().mockResolvedValue([{ ...baseRule, operator: 'endWith', trigger: 'presses' }]),
        })
        await expect(sendPlayerSay(server, makePlayer(), 'stop the presses', false)).resolves.toEqual({
          skip: true,
          message: 'Message blocked',
        })
      })

      it('does not match "endWith" when the message does not end with the trigger', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true })
        vi.stubGlobal('fetch', fetchMock)
        const server = makeServer({
          getGmodToDiscordFilter: vi.fn().mockResolvedValue([{ ...baseRule, operator: 'endWith', trigger: 'zzz' }]),
        })
        await sendPlayerSay(server, makePlayer(), 'stop the presses', false)
        expect(fetchMock).toHaveBeenCalled()
      })

      it('skips when the final output string is emptied out by a "startWith" rule', async () => {
        const server = makeServer({
          getGmodToDiscordFilter: vi.fn().mockResolvedValue([{ ...baseRule, operator: 'startWith', trigger: 'stop', action: 'relay' }]),
        })
        await expect(sendPlayerSay(server, makePlayer(), 'stop', false)).resolves.toEqual({
          skip: true,
          message: 'Final message is empty',
        })
      })

      it('"relay" action re-enables relaying after being blocked by an earlier rule', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true })
        vi.stubGlobal('fetch', fetchMock)
        const server = makeServer({
          getSetting: vi.fn().mockImplementation(async (key: string) => {
            if (key === 'syncChatDirection') return 'both'
            if (key === 'chat_sync_relay_all') return false
            return false
          }),
          getGmodToDiscordFilter: vi.fn().mockResolvedValue([{ ...baseRule, action: 'relay' }]),
        })

        await sendPlayerSay(server, makePlayer(), 'stop', false)

        expect(fetchMock).toHaveBeenCalled()
      })
    })
  })

  describe('saveConnectionGlobalInfo', () => {
    it('creates a new user row when none exists', async () => {
      prismaMock.users.findFirst.mockResolvedValueOnce(null)
      await saveConnectionGlobalInfo('765', 'STEAM_0:1:1', '1.2.3.4', 'Bob')
      expect(prismaMock.users.create).toHaveBeenCalledWith({
        data: { steamID64: '765', steamID: 'STEAM_0:1:1', name: 'Bob', lastIP: '1.2.3.4', IPS: JSON.stringify(['1.2.3.4']) },
      })
    })

    it('appends a new IP to the existing (parseable) IP history', async () => {
      prismaMock.users.findFirst.mockResolvedValueOnce({ IPS: JSON.stringify(['9.9.9.9']) })
      await saveConnectionGlobalInfo('765', 'STEAM_0:1:1', '1.2.3.4', 'Bob')
      expect(prismaMock.users.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ IPS: JSON.stringify(['9.9.9.9', '1.2.3.4']) }) }),
      )
    })

    it('does not duplicate an IP already present in the history', async () => {
      prismaMock.users.findFirst.mockResolvedValueOnce({ IPS: JSON.stringify(['1.2.3.4']) })
      await saveConnectionGlobalInfo('765', 'STEAM_0:1:1', '1.2.3.4', 'Bob')
      expect(prismaMock.users.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ IPS: JSON.stringify(['1.2.3.4']) }) }),
      )
    })

    it('starts a fresh IP history when the existing one is unparseable JSON', async () => {
      prismaMock.users.findFirst.mockResolvedValueOnce({ IPS: 'not-json' })
      await saveConnectionGlobalInfo('765', 'STEAM_0:1:1', '1.2.3.4', 'Bob')
      expect(prismaMock.users.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ IPS: JSON.stringify(['1.2.3.4']) }) }),
      )
    })

    it('discards non-string entries when the parsed IP history is not all strings', async () => {
      prismaMock.users.findFirst.mockResolvedValueOnce({ IPS: JSON.stringify(['9.9.9.9', 42, null]) })
      await saveConnectionGlobalInfo('765', 'STEAM_0:1:1', '1.2.3.4', 'Bob')
      expect(prismaMock.users.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ IPS: JSON.stringify(['9.9.9.9', '1.2.3.4']) }) }),
      )
    })

    it('starts a fresh IP history when the parsed JSON is not an array', async () => {
      prismaMock.users.findFirst.mockResolvedValueOnce({ IPS: JSON.stringify({ not: 'an array' }) })
      await saveConnectionGlobalInfo('765', 'STEAM_0:1:1', '1.2.3.4', 'Bob')
      expect(prismaMock.users.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ IPS: JSON.stringify(['1.2.3.4']) }) }),
      )
    })

    it('starts a fresh IP history when the existing user has no IPS field at all', async () => {
      prismaMock.users.findFirst.mockResolvedValueOnce({ IPS: null })
      await saveConnectionGlobalInfo('765', 'STEAM_0:1:1', '1.2.3.4', 'Bob')
      expect(prismaMock.users.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ IPS: JSON.stringify(['1.2.3.4']) }) }),
      )
    })
  })

  describe('saveConnectionSteamInfo', () => {
    it('creates a new steam-info row when none exists', async () => {
      prismaMock.gm_user_steam.findFirst.mockResolvedValueOnce(null)
      await saveConnectionSteamInfo('765', 'Bob', '1.2.3.4')
      expect(prismaMock.gm_user_steam.create).toHaveBeenCalledWith({
        data: { steam_id: '765', username: 'Bob', last_ip: '1.2.3.4' },
      })
    })

    it('increments total_connect on an existing row', async () => {
      prismaMock.gm_user_steam.findFirst.mockResolvedValueOnce({ total_connect: 4 })
      await saveConnectionSteamInfo('765', 'Bob', '1.2.3.4')
      expect(prismaMock.gm_user_steam.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ total_connect: 5 }) }),
      )
    })

    it('defaults total_connect to 1 when the existing row has none set', async () => {
      prismaMock.gm_user_steam.findFirst.mockResolvedValueOnce({ total_connect: 0 })
      await saveConnectionSteamInfo('765', 'Bob', '1.2.3.4')
      expect(prismaMock.gm_user_steam.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ total_connect: 1 }) }),
      )
    })

    it('rethrows and logs on failure', async () => {
      prismaMock.gm_user_steam.findFirst.mockRejectedValueOnce(new Error('db down'))
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      await expect(saveConnectionSteamInfo('765', 'Bob', '1.2.3.4')).rejects.toThrow('db down')
      expect(errorSpy).toHaveBeenCalled()
    })
  })
})
