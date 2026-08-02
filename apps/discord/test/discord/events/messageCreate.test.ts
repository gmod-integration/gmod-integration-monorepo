import { beforeEach, describe, expect, it, vi } from 'vitest'

const processDiscordMessageToGmodMock = vi.fn()
vi.mock('@gmod/core/models/v3/guildsControllerModels.js', () => ({
  processDiscordMessageToGmod: processDiscordMessageToGmodMock,
}))

const getUserFromDiscordIDMock = vi.fn()
vi.mock('@gmod/domain-user/User.js', () => ({ getUserFromDiscordID: getUserFromDiscordIDMock }))

const addAutoRoleToUserMock = vi.fn()
const givePremiumRoleOfMainGuildMock = vi.fn()
const verifyUserMock = vi.fn()
vi.mock('@gmod/domain-guild/discordModels.js', () => ({
  addAutoRoleToUser: addAutoRoleToUserMock,
  givePremiumRoleOfMainGuild: givePremiumRoleOfMainGuildMock,
  verifyUser: verifyUserMock,
}))

const gmLogMock = vi.fn()
vi.mock('@gmod/core/utils/logger.js', () => ({ gmLog: gmLogMock }))

const wsSendToServerQueueAddMock = vi.fn()
vi.mock('@gmod/infra-websocket/queues.js', () => ({
  wsSendToServerQueue: { add: wsSendToServerQueueAddMock },
}))

function makeDeveloperUser(overrides: any = {}) {
  return {
    discordID: 'dev1',
    isDeveloper: vi.fn().mockReturnValue(true),
    ...overrides,
  }
}

function makeMessage(overrides: any = {}) {
  return {
    author: { id: 'author1' },
    content: '',
    react: vi.fn(),
    reply: vi.fn(),
    member: null,
    guild: null,
    channel: { messages: { fetch: vi.fn() } },
    ...overrides,
  }
}

describe('messageCreate event', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    processDiscordMessageToGmodMock.mockResolvedValue(undefined)
    givePremiumRoleOfMainGuildMock.mockResolvedValue(undefined)
    addAutoRoleToUserMock.mockResolvedValue(undefined)
    verifyUserMock.mockResolvedValue(true)
    wsSendToServerQueueAddMock.mockResolvedValue(undefined)
  })

  it('always forwards the message to gmod', async () => {
    getUserFromDiscordIDMock.mockResolvedValue(null)
    const mod = await import('../../../src/discord/events/messageCreate.js')
    const message = makeMessage()

    await mod.default.execute(message as any)

    expect(processDiscordMessageToGmodMock).toHaveBeenCalledWith(message)
  })

  it('returns when there is no matching user', async () => {
    getUserFromDiscordIDMock.mockResolvedValue(null)
    const mod = await import('../../../src/discord/events/messageCreate.js')
    const message = makeMessage({ content: '§test' })

    await mod.default.execute(message as any)

    expect(message.react).not.toHaveBeenCalled()
  })

  it('returns when the user is not a developer', async () => {
    getUserFromDiscordIDMock.mockResolvedValue(makeDeveloperUser({ isDeveloper: vi.fn().mockReturnValue(false) }))
    const mod = await import('../../../src/discord/events/messageCreate.js')
    const message = makeMessage({ content: '§test' })

    await mod.default.execute(message as any)

    expect(message.react).not.toHaveBeenCalled()
  })

  it('returns when the message does not start with the dev command prefix', async () => {
    getUserFromDiscordIDMock.mockResolvedValue(makeDeveloperUser())
    const mod = await import('../../../src/discord/events/messageCreate.js')
    const message = makeMessage({ content: 'hello there' })

    await mod.default.execute(message as any)

    expect(message.react).not.toHaveBeenCalled()
    expect(gmLogMock).not.toHaveBeenCalled()
  })

  describe('dev commands', () => {
    beforeEach(() => {
      getUserFromDiscordIDMock.mockResolvedValue(makeDeveloperUser())
    })

    it('runWS: parses JSON payload and enqueues it', async () => {
      const mod = await import('../../../src/discord/events/messageCreate.js')
      const message = makeMessage({ content: '§runWS server1 {"foo":"bar"}' })

      await mod.default.execute(message as any)

      expect(wsSendToServerQueueAddMock).toHaveBeenCalledWith('wsSendToServer', {
        id: 'server1',
        data: { foo: 'bar' },
      })
      expect(message.react).toHaveBeenCalledWith('✅')
    })

    it('runWS: reacts with an error when the JSON payload is invalid', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const mod = await import('../../../src/discord/events/messageCreate.js')
      const message = makeMessage({ content: '§runWS server1 not-json' })

      await mod.default.execute(message as any)

      expect(message.react).toHaveBeenCalledWith('❌')
      expect(consoleErrorSpy).toHaveBeenCalled()
      consoleErrorSpy.mockRestore()
    })

    it('checkPremium: refreshes the premium role and reacts', async () => {
      const mod = await import('../../../src/discord/events/messageCreate.js')
      const message = makeMessage({ content: '§checkPremium' })

      await mod.default.execute(message as any)

      expect(givePremiumRoleOfMainGuildMock).toHaveBeenCalled()
      expect(message.react).toHaveBeenCalledWith('✅')
    })

    describe('moveMe', () => {
      it('returns silently when the author has no member/voice channel', async () => {
        const mod = await import('../../../src/discord/events/messageCreate.js')
        const message = makeMessage({ content: '§moveMe chan1', member: null })

        await mod.default.execute(message as any)

        expect(message.react).not.toHaveBeenCalled()
        expect(message.reply).not.toHaveBeenCalled()
      })

      it('returns silently when the member has no voice channel', async () => {
        const mod = await import('../../../src/discord/events/messageCreate.js')
        const message = makeMessage({
          content: '§moveMe chan1',
          member: { voice: { channel: null } },
          guild: { channels: { cache: new Map() }, members: { cache: new Map() } },
        })

        await mod.default.execute(message as any)

        expect(message.react).not.toHaveBeenCalled()
      })

      it('returns silently when there is no guild', async () => {
        const mod = await import('../../../src/discord/events/messageCreate.js')
        const message = makeMessage({
          content: '§moveMe chan1',
          member: { voice: { channel: { id: 'voicechan' } } },
          guild: null,
        })

        await mod.default.execute(message as any)

        expect(message.react).not.toHaveBeenCalled()
      })

      it('replies when no channel id is provided', async () => {
        const mod = await import('../../../src/discord/events/messageCreate.js')
        const message = makeMessage({
          content: '§moveMe',
          member: { voice: { channel: { id: 'voicechan' } } },
          guild: { channels: { cache: new Map() }, members: { cache: new Map() } },
        })

        await mod.default.execute(message as any)

        expect(message.reply).toHaveBeenCalledWith({ content: 'No channel ID provided' })
        expect(message.react).not.toHaveBeenCalled()
      })

      it('replies when the target channel does not exist', async () => {
        const mod = await import('../../../src/discord/events/messageCreate.js')
        const message = makeMessage({
          content: '§moveMe missingChan',
          member: { voice: { channel: { id: 'voicechan' } } },
          guild: { channels: { cache: new Map() }, members: { cache: new Map() } },
        })

        await mod.default.execute(message as any)

        expect(message.reply).toHaveBeenCalledWith({ content: 'Invalid channel ID provided' })
        expect(message.react).not.toHaveBeenCalled()
      })

      it('replies when the target channel is not voice-based', async () => {
        const mod = await import('../../../src/discord/events/messageCreate.js')
        const textChannel = { id: 'chan1', isVoiceBased: vi.fn().mockReturnValue(false) }
        const message = makeMessage({
          content: '§moveMe chan1',
          member: { voice: { channel: { id: 'voicechan' } } },
          guild: { channels: { cache: new Map([['chan1', textChannel]]) }, members: { cache: new Map() } },
        })

        await mod.default.execute(message as any)

        expect(message.reply).toHaveBeenCalledWith({ content: 'Invalid channel ID provided' })
      })

      it('moves the member when the guild member cache entry exists', async () => {
        const mod = await import('../../../src/discord/events/messageCreate.js')
        const voiceChannel = { id: 'chan1', isVoiceBased: vi.fn().mockReturnValue(true) }
        const setChannelMock = vi.fn()
        const guildMember = { voice: { setChannel: setChannelMock } }
        const message = makeMessage({
          content: '§moveMe chan1',
          author: { id: 'author1' },
          member: { voice: { channel: { id: 'voicechan' } } },
          guild: {
            channels: { cache: new Map([['chan1', voiceChannel]]) },
            members: { cache: new Map([['author1', guildMember]]) },
          },
        })

        await mod.default.execute(message as any)

        expect(setChannelMock).toHaveBeenCalledWith(voiceChannel)
        expect(message.react).toHaveBeenCalledWith('✅')
      })

      it('skips the move but still reacts when the guild member cache entry is missing', async () => {
        const mod = await import('../../../src/discord/events/messageCreate.js')
        const voiceChannel = { id: 'chan1', isVoiceBased: vi.fn().mockReturnValue(true) }
        const message = makeMessage({
          content: '§moveMe chan1',
          author: { id: 'author1' },
          member: { voice: { channel: { id: 'voicechan' } } },
          guild: {
            channels: { cache: new Map([['chan1', voiceChannel]]) },
            members: { cache: new Map() },
          },
        })

        await mod.default.execute(message as any)

        expect(message.react).toHaveBeenCalledWith('✅')
      })
    })

    describe('giveMe', () => {
      it('returns silently when there is no member or guild', async () => {
        const mod = await import('../../../src/discord/events/messageCreate.js')
        const message = makeMessage({ content: '§giveMe role1', member: null, guild: null })

        await mod.default.execute(message as any)

        expect(message.react).not.toHaveBeenCalled()
        expect(message.reply).not.toHaveBeenCalled()
      })

      it('replies when no role id is provided', async () => {
        const mod = await import('../../../src/discord/events/messageCreate.js')
        const message = makeMessage({
          content: '§giveMe',
          member: { roles: { add: vi.fn() } },
          guild: { roles: { cache: new Map() } },
        })

        await mod.default.execute(message as any)

        expect(message.reply).toHaveBeenCalledWith({ content: 'No role ID provided' })
      })

      it('replies when the role does not exist', async () => {
        const mod = await import('../../../src/discord/events/messageCreate.js')
        const message = makeMessage({
          content: '§giveMe role1',
          member: { roles: { add: vi.fn() } },
          guild: { roles: { cache: new Map() } },
        })

        await mod.default.execute(message as any)

        expect(message.reply).toHaveBeenCalledWith({ content: 'Invalid role ID provided' })
      })

      it('adds the role to the member and reacts', async () => {
        const mod = await import('../../../src/discord/events/messageCreate.js')
        const addMock = vi.fn()
        const role = { id: 'role1' }
        const message = makeMessage({
          content: '§giveMe role1',
          member: { roles: { add: addMock } },
          guild: { roles: { cache: new Map([['role1', role]]) } },
        })

        await mod.default.execute(message as any)

        expect(addMock).toHaveBeenCalledWith(role)
        expect(message.react).toHaveBeenCalledWith('✅')
      })
    })

    describe('deleteMessage', () => {
      it('replies when no message id is provided', async () => {
        const mod = await import('../../../src/discord/events/messageCreate.js')
        const message = makeMessage({ content: '§deleteMessage' })

        await mod.default.execute(message as any)

        expect(message.reply).toHaveBeenCalledWith({ content: 'No message ID provided' })
      })

      it('fetches and deletes the target message, then reacts', async () => {
        const deleteMock = vi.fn().mockResolvedValue(undefined)
        const fetchMock = vi.fn().mockResolvedValue({ delete: deleteMock })
        const mod = await import('../../../src/discord/events/messageCreate.js')
        const message = makeMessage({ content: '§deleteMessage msg1', channel: { messages: { fetch: fetchMock } } })

        await mod.default.execute(message as any)

        expect(fetchMock).toHaveBeenCalledWith('msg1')
        expect(deleteMock).toHaveBeenCalled()
        expect(message.react).toHaveBeenCalledWith('✅')
      })

      it('reacts with an error when the fetch rejects (message not found)', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        const fetchMock = vi.fn().mockRejectedValue(new Error('Unknown Message'))
        const mod = await import('../../../src/discord/events/messageCreate.js')
        const message = makeMessage({ content: '§deleteMessage msg1', channel: { messages: { fetch: fetchMock } } })

        await mod.default.execute(message as any)

        expect(message.react).toHaveBeenCalledWith('❌')
        consoleErrorSpy.mockRestore()
      })
    })

    describe('verifyAll', () => {
      it('returns silently when there is no guild', async () => {
        const mod = await import('../../../src/discord/events/messageCreate.js')
        const message = makeMessage({ content: '§verifyAll', guild: null })

        await mod.default.execute(message as any)

        expect(message.react).not.toHaveBeenCalled()
      })

      it('verifies every fetched member and reacts', async () => {
        const member1 = { id: 'm1' }
        const member2 = { id: 'm2' }
        const membersCollection = new Map([
          ['m1', member1],
          ['m2', member2],
        ])
        const guild = { members: { fetch: vi.fn().mockResolvedValue(membersCollection) } }
        const mod = await import('../../../src/discord/events/messageCreate.js')
        const message = makeMessage({ content: '§verifyAll', guild })

        await mod.default.execute(message as any)

        expect(addAutoRoleToUserMock).toHaveBeenCalledWith(guild, member1)
        expect(addAutoRoleToUserMock).toHaveBeenCalledWith(guild, member2)
        expect(verifyUserMock).toHaveBeenCalledWith(guild, member1)
        expect(verifyUserMock).toHaveBeenCalledWith(guild, member2)
        expect(message.react).toHaveBeenCalledWith('✅')
      })
    })

    it('test: logs to the console and reacts', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const mod = await import('../../../src/discord/events/messageCreate.js')
      const message = makeMessage({ content: '§test foo bar' })

      await mod.default.execute(message as any)

      expect(consoleLogSpy).toHaveBeenCalledWith('test', ['foo', 'bar'])
      expect(message.react).toHaveBeenCalledWith('✅')
      consoleLogSpy.mockRestore()
    })

    it('reacts with a question mark for an unknown command and does not react again', async () => {
      const mod = await import('../../../src/discord/events/messageCreate.js')
      const message = makeMessage({ content: '§unknownCommand' })

      await mod.default.execute(message as any)

      expect(message.react).toHaveBeenCalledWith('❓')
      expect(message.react).toHaveBeenCalledTimes(1)
    })
  })
})
