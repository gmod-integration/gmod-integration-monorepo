import { beforeEach, describe, expect, it, vi } from 'vitest'

const getProfileMessageMock = vi.fn(async () => ({ content: 'profile' }))
vi.mock('../../../../src/discord/utils/messages.js', () => ({ getProfileMessage: getProfileMessageMock }))

const getUserFromSteamID64Mock = vi.fn()
vi.mock('@gmod/domain-user/User.js', () => ({ getUserFromSteamID64: getUserFromSteamID64Mock }))

const profile = (await import('../../../../src/discord/commands/player/profile.js')).default

function makeInteraction(overrides: Record<string, any> = {}) {
  return {
    guild: { id: 'g1', preferredLocale: 'en-US', members: { fetch: vi.fn() } },
    user: { id: 'u1' },
    client: { users: { fetch: vi.fn() } },
    options: {
      getUser: vi.fn(() => null),
      getString: vi.fn(() => null),
    },
    reply: vi.fn(),
    ...overrides,
  } as any
}

beforeEach(() => {
  getProfileMessageMock.mockClear()
  getUserFromSteamID64Mock.mockReset()
})

describe('commands/player/profile execute', () => {
  it('returns early when there is no guild', async () => {
    const interaction = makeInteraction({ guild: null })
    const result = await profile.execute(interaction)
    expect(result).toBeUndefined()
  })

  it('replies with the profile of the given discord user option', async () => {
    const interaction = makeInteraction()
    const targetUser = { id: 'target1' }
    interaction.options.getUser.mockReturnValue(targetUser)

    await profile.execute(interaction)

    expect(getProfileMessageMock).toHaveBeenCalledWith(interaction.guild, targetUser)
    expect(interaction.reply).toHaveBeenCalledWith({ content: 'profile' })
  })

  it('replies with a not-linked message when the given steamID64 has no linked account', async () => {
    const interaction = makeInteraction()
    interaction.options.getString.mockReturnValue('76561')
    getUserFromSteamID64Mock.mockResolvedValueOnce(null)

    await profile.execute(interaction)

    expect(interaction.reply).toHaveBeenCalledWith({
      content: 'This steamID64 is not linked to any discord account.',
      flags: expect.anything(),
    })
  })

  it('fetches the discord member for the resolved steamID64 user and replies with their profile', async () => {
    const interaction = makeInteraction()
    interaction.options.getString.mockReturnValue('76561')
    getUserFromSteamID64Mock.mockResolvedValueOnce({ discordID: 'd1' })
    const discordUser = { id: 'd1' }
    interaction.guild.members.fetch.mockResolvedValueOnce({ user: discordUser })

    await profile.execute(interaction)

    expect(interaction.guild.members.fetch).toHaveBeenCalledWith('d1')
    expect(getProfileMessageMock).toHaveBeenCalledWith(interaction.guild, discordUser)
    expect(interaction.reply).toHaveBeenCalledWith({ content: 'profile' })
  })

  it('falls back to fetching the raw discord user when the member fetch fails', async () => {
    const interaction = makeInteraction()
    interaction.options.getString.mockReturnValue('76561')
    getUserFromSteamID64Mock.mockResolvedValueOnce({ discordID: 'd1' })
    interaction.guild.members.fetch.mockRejectedValueOnce(new Error('not a member'))
    const fallbackUser = { id: 'd1' }
    interaction.client.users.fetch.mockResolvedValueOnce(fallbackUser)

    await profile.execute(interaction)

    expect(interaction.client.users.fetch).toHaveBeenCalledWith('d1')
    expect(getProfileMessageMock).toHaveBeenCalledWith(interaction.guild, fallbackUser)
  })

  it('replies with an issue message when the fallback discord user fetch resolves falsy', async () => {
    const interaction = makeInteraction()
    interaction.options.getString.mockReturnValue('76561')
    getUserFromSteamID64Mock.mockResolvedValueOnce({ discordID: 'd1' })
    interaction.guild.members.fetch.mockRejectedValueOnce(new Error('not a member'))
    interaction.client.users.fetch.mockResolvedValueOnce(null)

    await profile.execute(interaction)

    expect(interaction.reply).toHaveBeenCalledWith({
      content: 'We have an issue fetching the discord user.',
      flags: expect.anything(),
    })
  })

  it('replies with the profile of the invoking user when no options are provided', async () => {
    const interaction = makeInteraction()

    await profile.execute(interaction)

    expect(getProfileMessageMock).toHaveBeenCalledWith(interaction.guild, interaction.user)
    expect(interaction.reply).toHaveBeenCalledWith({ content: 'profile' })
  })
})
