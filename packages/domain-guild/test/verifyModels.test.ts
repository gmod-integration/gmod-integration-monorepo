import { beforeEach, describe, expect, it, vi } from 'vitest'

const getPanelUserFromDiscordIDMock = vi.fn()
vi.mock('@gmod/domain-user/PanelUser.js', () => ({ getPanelUserFromDiscordID: getPanelUserFromDiscordIDMock }))

const getUserFromDiscordIDMock = vi.fn()
vi.mock('@gmod/domain-user/User.js', () => ({ getUserFromDiscordID: getUserFromDiscordIDMock }))

const verifyUserMock = vi.fn()
vi.mock('../src/discordModels.js', () => ({ verifyUser: verifyUserMock }))

const buttonVerificationWebsiteMock = vi.fn(async () => ({ toJSON: () => ({ custom_id: 'verify-website' }) }))
const getVerifiedMessageAnswerMock = vi.fn(async () => ({ content: 'answer' }))
vi.mock('../src/discordMessages.js', () => ({
  ButtonVerificationWebsite: buttonVerificationWebsiteMock,
  getVerifiedMessageAnswer: getVerifiedMessageAnswerMock,
}))

const findFirstMock = vi.fn()
vi.mock('@gmod/infra-prisma', () => ({ default: { gm_guild: { findFirst: findFirstMock } } }))

const getTranslateMock = vi.fn(async (key: string) => key)
vi.mock('../src/localizations.js', () => ({ getTranslate: getTranslateMock }))

const { handleVerifyInteraction } = await import('../src/verifyModels.js')

function makeInteraction(overrides: Record<string, any> = {}) {
  return {
    isButton: () => true,
    user: { bot: false, id: 'u1' },
    customId: 'verify',
    guild: null,
    reply: vi.fn().mockResolvedValue(undefined),
    client: { guilds: { fetch: vi.fn() } },
    ...overrides,
  }
}

describe('handleVerifyInteraction', () => {
  beforeEach(() => {
    getPanelUserFromDiscordIDMock.mockReset()
    getUserFromDiscordIDMock.mockReset()
    verifyUserMock.mockReset()
    buttonVerificationWebsiteMock.mockClear()
    getVerifiedMessageAnswerMock.mockClear()
    findFirstMock.mockReset()
    getTranslateMock.mockClear()
  })

  it('does nothing when the interaction is not a button', async () => {
    const interaction = makeInteraction({ isButton: () => false })
    await handleVerifyInteraction(interaction as any)
    expect(interaction.reply).not.toHaveBeenCalled()
  })

  it('does nothing for bot users', async () => {
    const interaction = makeInteraction({ user: { bot: true, id: 'u1' } })
    await handleVerifyInteraction(interaction as any)
    expect(interaction.reply).not.toHaveBeenCalled()
  })

  it('does nothing for an unrelated customId', async () => {
    const interaction = makeInteraction({ customId: 'other' })
    await handleVerifyInteraction(interaction as any)
    expect(interaction.reply).not.toHaveBeenCalled()
  })

  describe('DM context (no interaction.guild)', () => {
    it('asks the user to re-verify when there is no panel user', async () => {
      getPanelUserFromDiscordIDMock.mockResolvedValueOnce(null)
      const interaction = makeInteraction()

      await handleVerifyInteraction(interaction as any)

      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('re_verify_yourself'), ephemeral: true }),
      )
    })

    it('asks the user to re-verify when the panel token has no creation date', async () => {
      getPanelUserFromDiscordIDMock.mockResolvedValueOnce({ panelToken: {} })
      const interaction = makeInteraction()

      await handleVerifyInteraction(interaction as any)

      expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }))
    })

    it('asks the user to re-verify when the panel token predates the cutoff date', async () => {
      getPanelUserFromDiscordIDMock.mockResolvedValueOnce({
        panelToken: { creationDate: '2024-01-01T00:00:00.000Z' },
      })
      const interaction = makeInteraction()

      await handleVerifyInteraction(interaction as any)

      expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }))
    })

    it('replies with the not-verified answer when the DB user has no steam ID', async () => {
      getPanelUserFromDiscordIDMock.mockResolvedValueOnce({
        panelToken: { creationDate: '2025-01-01T00:00:00.000Z' },
        findGuilds: vi.fn(),
      })
      getUserFromDiscordIDMock.mockResolvedValueOnce(null)
      const interaction = makeInteraction()

      await handleVerifyInteraction(interaction as any)

      expect(getVerifiedMessageAnswerMock).toHaveBeenCalledWith(false, 'en', interaction.user, true)
      expect(interaction.reply).toHaveBeenCalledWith({ content: 'answer' })
    })

    it('skips guilds with no DB record, unreachable guild (rejected fetch), or unfetchable member (rejected fetch)', async () => {
      getPanelUserFromDiscordIDMock.mockResolvedValueOnce({
        panelToken: { creationDate: '2025-01-01T00:00:00.000Z' },
        findGuilds: vi.fn().mockResolvedValueOnce([{ id: 'g1' }, { id: 'g2' }, { id: 'g3' }]),
      })
      getUserFromDiscordIDMock.mockResolvedValueOnce({ getSteamID64: () => '765' })
      findFirstMock
        .mockResolvedValueOnce(null) // g1: no DB guild
        .mockResolvedValueOnce({ guild: 'g2' }) // g2: has DB guild
        .mockResolvedValueOnce({ guild: 'g3' }) // g3: has DB guild

      const fetchGuild = vi
        .fn()
        .mockRejectedValueOnce(new Error('unreachable')) // g2: guild fetch rejects -> .catch(() => null)
        .mockResolvedValueOnce({
          id: 'g3',
          name: 'Guild 3',
          members: { fetch: vi.fn().mockRejectedValueOnce(new Error('no member')) }, // g3: member fetch rejects
        })

      const interaction = makeInteraction({ client: { guilds: { fetch: fetchGuild } } })

      await handleVerifyInteraction(interaction as any)

      expect(interaction.reply).toHaveBeenCalledWith('You have been verified in the following guilds: ')
    })

    it('verifies the user in every guild where verification succeeds, and skips guilds where it does not', async () => {
      getPanelUserFromDiscordIDMock.mockResolvedValueOnce({
        panelToken: { creationDate: '2025-01-01T00:00:00.000Z' },
        findGuilds: vi.fn().mockResolvedValueOnce([{ id: 'g1' }, { id: 'g2' }]),
      })
      getUserFromDiscordIDMock.mockResolvedValueOnce({ getSteamID64: () => '765' })
      findFirstMock.mockResolvedValueOnce({ guild: 'g1' }).mockResolvedValueOnce({ guild: 'g2' })
      const memberOne = { id: 'u1' }
      const memberTwo = { id: 'u1' }
      const fetchGuild = vi
        .fn()
        .mockResolvedValueOnce({
          id: 'g1',
          name: 'Guild One',
          members: { fetch: vi.fn().mockResolvedValueOnce(memberOne) },
        })
        .mockResolvedValueOnce({
          id: 'g2',
          name: 'Guild Two',
          members: { fetch: vi.fn().mockResolvedValueOnce(memberTwo) },
        })
      verifyUserMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false)

      const interaction = makeInteraction({ client: { guilds: { fetch: fetchGuild } } })

      await handleVerifyInteraction(interaction as any)

      expect(interaction.reply).toHaveBeenCalledWith('You have been verified in the following guilds: Guild One')
    })
  })

  describe('guild context (interaction.guild present)', () => {
    it('replies with the not-verified answer when the user has no linked steam account', async () => {
      getUserFromDiscordIDMock.mockResolvedValueOnce(null)
      const interaction = makeInteraction({ guild: { preferredLocale: 'en', members: { fetch: vi.fn() } } })

      await handleVerifyInteraction(interaction as any)

      expect(verifyUserMock).not.toHaveBeenCalled()
      expect(getVerifiedMessageAnswerMock).toHaveBeenCalledWith(false, 'en', interaction.user, true)
    })

    it('returns early when the member cannot be fetched (rejected fetch -> .catch(() => null))', async () => {
      getUserFromDiscordIDMock.mockResolvedValueOnce({ getSteamID64: () => '765' })
      const membersFetch = vi.fn().mockRejectedValueOnce(new Error('no member'))
      const interaction = makeInteraction({ guild: { preferredLocale: 'en', members: { fetch: membersFetch } } })

      const result = await handleVerifyInteraction(interaction as any)

      expect(result).toBeUndefined()
      expect(interaction.reply).not.toHaveBeenCalled()
    })

    it('verifies the member and replies with the verified answer', async () => {
      getUserFromDiscordIDMock.mockResolvedValueOnce({ getSteamID64: () => '765' })
      const member = { id: 'u1' }
      const membersFetch = vi.fn().mockResolvedValueOnce(member)
      const interaction = makeInteraction({ guild: { preferredLocale: 'en', members: { fetch: membersFetch } } })

      await handleVerifyInteraction(interaction as any)

      expect(verifyUserMock).toHaveBeenCalledWith(interaction.guild, member)
      expect(getVerifiedMessageAnswerMock).toHaveBeenCalledWith(true, 'en', interaction.user, true)
      expect(interaction.reply).toHaveBeenCalledWith({ content: 'answer' })
    })
  })
})
