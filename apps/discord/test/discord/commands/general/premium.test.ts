import { beforeEach, describe, expect, it, vi } from 'vitest'

const getTranslateMock = vi.fn(async (key: string) => key)
vi.mock('@gmod/core/utils/localizations.js', () => ({ getTranslate: getTranslateMock }))

const resolveAccessMock = vi.fn()
vi.mock('@gmod/domain-access/index.js', () => ({ resolveGuildAccess: resolveAccessMock }))
const replyNeedPremiumMock = vi.fn()
vi.mock('@gmod/domain-guild/Guild.js', () => ({
  replyNeedPremium: replyNeedPremiumMock,
}))

const premium = (await import('../../../../src/discord/commands/general/premium.js')).default

function makeInteraction(overrides: Record<string, any> = {}) {
  return {
    guild: { id: 'g1', preferredLocale: 'en-US' },
    reply: vi.fn(),
    ...overrides,
  } as any
}

beforeEach(() => {
  getTranslateMock.mockClear()
  resolveAccessMock.mockReset()
  replyNeedPremiumMock.mockReset()
})

describe('commands/general/premium execute', () => {
  it('returns early when there is no guild', async () => {
    const interaction = makeInteraction({ guild: null })
    const result = await premium.execute(interaction)
    expect(result).toBeUndefined()
    expect(resolveAccessMock).not.toHaveBeenCalled()
  })

  it('replies your_guild_is_premium when the guild is premium', async () => {
    const interaction = makeInteraction()
    resolveAccessMock.mockResolvedValueOnce({ premium: true, state: 'ready' })

    await premium.execute(interaction)

    expect(resolveAccessMock).toHaveBeenCalledWith('g1')
    expect(interaction.reply).toHaveBeenCalledWith({ content: 'your_guild_is_premium', ephemeral: true })
    expect(replyNeedPremiumMock).not.toHaveBeenCalled()
  })

  it('delegates to replyNeedPremium when the guild is not premium', async () => {
    const interaction = makeInteraction()
    resolveAccessMock.mockResolvedValueOnce({ premium: false, state: 'ready' })

    await premium.execute(interaction)

    expect(replyNeedPremiumMock).toHaveBeenCalledWith(interaction)
    expect(interaction.reply).not.toHaveBeenCalled()
  })
  it('shows a retryable verification error instead of an upgrade CTA when the provider is unavailable', async () => {
    const interaction = makeInteraction()
    resolveAccessMock.mockResolvedValueOnce({ premium: false, state: 'unknown' })
    await premium.execute(interaction)
    expect(interaction.reply).toHaveBeenCalledWith({ content: 'access_verification_unavailable', ephemeral: true })
    expect(replyNeedPremiumMock).not.toHaveBeenCalled()
  })
})
