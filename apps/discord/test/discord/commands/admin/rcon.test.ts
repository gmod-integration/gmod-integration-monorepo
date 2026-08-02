import { beforeEach, describe, expect, it, vi } from 'vitest'

const getTranslateMock = vi.fn(async (key: string) => key)
vi.mock('@gmod/core/utils/localizations.js', () => ({ getTranslate: getTranslateMock }))

const getServerListMock = vi.fn()
vi.mock('@gmod/domain-server/serversModels.js', () => ({ getServerList: getServerListMock }))

const getServerFromIDMock = vi.fn()
vi.mock('@gmod/domain-server/Server.js', () => ({ getServerFromID: getServerFromIDMock }))

const getUserFromDiscordIDMock = vi.fn()
vi.mock('@gmod/domain-user/User.js', () => ({ getUserFromDiscordID: getUserFromDiscordIDMock }))

const buttonVerificationWebsiteMock = vi.fn(async () => ({ type: 'button' }))
vi.mock('../../../../src/discord/utils/buttons.js', () => ({ ButtonVerificationWebsite: buttonVerificationWebsiteMock }))

const isGuildPremiumMock = vi.fn()
const replyNeedPremiumMock = vi.fn()
vi.mock('@gmod/domain-guild/Guild.js', () => ({
  isGuildPremium: isGuildPremiumMock,
  replyNeedPremium: replyNeedPremiumMock,
}))

const enqueueWSSendToServerAndWaitMock = vi.fn()
vi.mock('@gmod/infra-websocket/queues.js', () => ({ enqueueWSSendToServerAndWait: enqueueWSSendToServerAndWaitMock }))

const rcon = (await import('../../../../src/discord/commands/admin/rcon.js')).default

function makeInteraction(overrides: Record<string, any> = {}) {
  return {
    guild: { id: 'g1', preferredLocale: 'en-US' },
    user: { id: 'u1' },
    options: {
      getString: vi.fn(),
    },
    reply: vi.fn(),
    respond: vi.fn(),
    ...overrides,
  } as any
}

function makeServer(overrides: Record<string, any> = {}) {
  return {
    getServerPlayer: vi.fn(),
    getID: () => 's1',
    ...overrides,
  }
}

function makeUser(overrides: Record<string, any> = {}) {
  return {
    steamID64: '765611111111',
    getSteamID64: () => '765611111111',
    ...overrides,
  }
}

beforeEach(() => {
  getTranslateMock.mockClear()
  getServerListMock.mockReset()
  getServerFromIDMock.mockReset()
  getUserFromDiscordIDMock.mockReset()
  buttonVerificationWebsiteMock.mockClear()
  isGuildPremiumMock.mockReset()
  replyNeedPremiumMock.mockReset()
  enqueueWSSendToServerAndWaitMock.mockReset()
})

describe('commands/admin/rcon execute', () => {
  it('returns early when there is no guild', async () => {
    const interaction = makeInteraction({ guild: null })
    const result = await rcon.execute(interaction)
    expect(result).toBeUndefined()
    expect(interaction.reply).not.toHaveBeenCalled()
  })

  it('replies server_not_found when the server option is missing', async () => {
    const interaction = makeInteraction()
    interaction.options.getString.mockReturnValue(null)
    await rcon.execute(interaction)
    expect(interaction.reply).toHaveBeenCalledWith({ content: 'server_not_found', ephemeral: true })
  })

  it('replies server_not_found when the server cannot be found', async () => {
    const interaction = makeInteraction()
    interaction.options.getString.mockReturnValue('s1')
    getServerFromIDMock.mockResolvedValueOnce(null)
    await rcon.execute(interaction)
    expect(interaction.reply).toHaveBeenCalledWith({ content: 'server_not_found', ephemeral: true })
  })

  it('replies rcon_steam_link when the user is not linked', async () => {
    const interaction = makeInteraction()
    interaction.options.getString.mockReturnValue('s1')
    getServerFromIDMock.mockResolvedValueOnce(makeServer())
    getUserFromDiscordIDMock.mockResolvedValueOnce(null)
    await rcon.execute(interaction)
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'rcon_steam_link', ephemeral: true }),
    )
    expect(buttonVerificationWebsiteMock).toHaveBeenCalledWith('en-US')
  })

  it('replies rcon_steam_link when the user has no steamID64', async () => {
    const interaction = makeInteraction()
    interaction.options.getString.mockReturnValue('s1')
    getServerFromIDMock.mockResolvedValueOnce(makeServer())
    getUserFromDiscordIDMock.mockResolvedValueOnce(makeUser({ steamID64: null }))
    await rcon.execute(interaction)
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'rcon_steam_link' }),
    )
  })

  it('replies rcon_superadmin when the player cannot be found on the server', async () => {
    const interaction = makeInteraction()
    interaction.options.getString.mockReturnValue('s1')
    const server = makeServer()
    server.getServerPlayer.mockResolvedValueOnce(null)
    getServerFromIDMock.mockResolvedValueOnce(server)
    getUserFromDiscordIDMock.mockResolvedValueOnce(makeUser())
    await rcon.execute(interaction)
    expect(interaction.reply).toHaveBeenCalledWith({ content: 'rcon_superadmin', ephemeral: true })
  })

  it('replies rcon_superadmin when the player rank is not superadmin', async () => {
    const interaction = makeInteraction()
    interaction.options.getString.mockReturnValue('s1')
    const server = makeServer()
    server.getServerPlayer.mockResolvedValueOnce({ rank: 'admin' })
    getServerFromIDMock.mockResolvedValueOnce(server)
    getUserFromDiscordIDMock.mockResolvedValueOnce(makeUser())
    await rcon.execute(interaction)
    expect(interaction.reply).toHaveBeenCalledWith({ content: 'rcon_superadmin', ephemeral: true })
  })

  it('replies with need-premium when the guild is not premium', async () => {
    const interaction = makeInteraction()
    interaction.options.getString.mockReturnValue('s1')
    const server = makeServer()
    server.getServerPlayer.mockResolvedValueOnce({ rank: 'superadmin' })
    getServerFromIDMock.mockResolvedValueOnce(server)
    getUserFromDiscordIDMock.mockResolvedValueOnce(makeUser())
    isGuildPremiumMock.mockResolvedValueOnce(false)
    await rcon.execute(interaction)
    expect(replyNeedPremiumMock).toHaveBeenCalledWith(interaction)
    expect(interaction.reply).not.toHaveBeenCalled()
  })

  it('enqueues the rcon command and replies success when the queue resolves', async () => {
    const interaction = makeInteraction()
    interaction.options.getString.mockImplementation((name: string) => (name === 'server' ? 's1' : 'say hi'))
    const server = makeServer()
    server.getServerPlayer.mockResolvedValueOnce({ rank: 'superadmin' })
    getServerFromIDMock.mockResolvedValueOnce(server)
    getUserFromDiscordIDMock.mockResolvedValueOnce(makeUser())
    isGuildPremiumMock.mockResolvedValueOnce(true)
    enqueueWSSendToServerAndWaitMock.mockResolvedValueOnce(true)

    await rcon.execute(interaction)

    expect(enqueueWSSendToServerAndWaitMock).toHaveBeenCalledWith(
      {
        id: 's1',
        data: {
          method: 'wsRcon',
          steamID: '765611111111',
          command: 'say hi',
        },
      },
      5000,
    )
    expect(interaction.reply).toHaveBeenCalledWith({ content: 'rcon_command_success', ephemeral: true })
  })

  it('replies with error content when the enqueue rejects', async () => {
    const interaction = makeInteraction()
    interaction.options.getString.mockImplementation((name: string) => (name === 'server' ? 's1' : 'say hi'))
    const server = makeServer()
    server.getServerPlayer.mockResolvedValueOnce({ rank: 'superadmin' })
    getServerFromIDMock.mockResolvedValueOnce(server)
    getUserFromDiscordIDMock.mockResolvedValueOnce(makeUser())
    isGuildPremiumMock.mockResolvedValueOnce(true)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    enqueueWSSendToServerAndWaitMock.mockRejectedValueOnce(new Error('timeout'))

    await rcon.execute(interaction)

    expect(errorSpy).toHaveBeenCalledWith('Failed to enqueue wsRcon job:', expect.any(Error))
    expect(interaction.reply).toHaveBeenCalledWith({ content: 'rcon_command_error', ephemeral: true })
    errorSpy.mockRestore()
  })
})

describe('commands/admin/rcon autocomplete', () => {
  it('responds with the mapped filtered choices', async () => {
    const interaction = makeInteraction({
      options: { getFocused: vi.fn(() => ({ name: 'server', value: 'se' })) },
    })
    getServerListMock.mockImplementation(async (_interaction, _focused, choices) => {
      choices['Server One'] = 's1'
      return ['Server One']
    })

    await rcon.autocomplete(interaction)

    expect(interaction.respond).toHaveBeenCalledWith([{ name: 'Server One', value: 's1' }])
  })
})
