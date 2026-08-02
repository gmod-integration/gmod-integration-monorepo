import { beforeEach, describe, expect, it, vi } from 'vitest'

const handlePremiumInteractionMock = vi.fn()
vi.mock('@gmod/domain-guild/Guild.js', () => ({ handlePremiumInteraction: handlePremiumInteractionMock }))

const handleWarnInteractionMock = vi.fn()
vi.mock('@gmod/domain-moderation/warnModels.js', () => ({ handleWarnInteraction: handleWarnInteractionMock }))

const handleVerifyInteractionMock = vi.fn()
vi.mock('@gmod/domain-guild/verifyModels.js', () => ({ handleVerifyInteraction: handleVerifyInteractionMock }))

const handleLeaderboardInteractionMock = vi.fn()
vi.mock('@gmod/core/models/v3/leaderboardModels.js', () => ({
  handleLeaderboardInteraction: handleLeaderboardInteractionMock,
}))

describe('interactionCreate event', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    handlePremiumInteractionMock.mockResolvedValue(undefined)
    handleWarnInteractionMock.mockResolvedValue(undefined)
    handleVerifyInteractionMock.mockResolvedValue(undefined)
    handleLeaderboardInteractionMock.mockResolvedValue(undefined)
  })

  it('dispatches to all button interaction handlers when the interaction is a button', async () => {
    const mod = await import('../../../src/discord/events/interactionCreate.js')
    const interaction = { isButton: vi.fn().mockReturnValue(true) }

    await mod.default.execute(interaction as any)

    expect(handleVerifyInteractionMock).toHaveBeenCalledWith(interaction)
    expect(handleWarnInteractionMock).toHaveBeenCalledWith(interaction)
    expect(handleLeaderboardInteractionMock).toHaveBeenCalledWith(interaction)
    expect(handlePremiumInteractionMock).toHaveBeenCalledWith(interaction)
  })

  it('does nothing for non-button interactions', async () => {
    const mod = await import('../../../src/discord/events/interactionCreate.js')
    const interaction = { isButton: vi.fn().mockReturnValue(false) }

    await mod.default.execute(interaction as any)

    expect(handleVerifyInteractionMock).not.toHaveBeenCalled()
    expect(handleWarnInteractionMock).not.toHaveBeenCalled()
    expect(handleLeaderboardInteractionMock).not.toHaveBeenCalled()
    expect(handlePremiumInteractionMock).not.toHaveBeenCalled()
  })
})
