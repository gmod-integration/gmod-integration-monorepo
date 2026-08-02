import { beforeEach, describe, expect, it, vi } from 'vitest'

const getTranslateMock = vi.fn(async (key: string) => key)
vi.mock('@gmod/core/utils/localizations.js', () => ({ getTranslate: getTranslateMock }))

const verifyUserMock = vi.fn()
vi.mock('@gmod/domain-guild/discordModels.js', () => ({ verifyUser: verifyUserMock }))

const getVerifiedMessageAnswerMock = vi.fn(async () => ({ content: 'answer' }))
vi.mock('../../../../src/discord/utils/messages.js', () => ({
  getVerifiedMessageAnswer: getVerifiedMessageAnswerMock,
}))

const verifyContext = (await import('../../../../src/discord/contexts/admin/verify.js')).default

function makeInteraction(overrides: Record<string, any> = {}) {
  return {
    guild: { id: 'g1', preferredLocale: 'en-US', members: { fetch: vi.fn() } },
    user: { id: 'u1' },
    targetId: 'target1',
    reply: vi.fn(),
    ...overrides,
  } as any
}

beforeEach(() => {
  getTranslateMock.mockClear()
  verifyUserMock.mockReset()
  getVerifiedMessageAnswerMock.mockClear()
})

describe('contexts/admin/verify execute', () => {
  it('replies "Something went wrong!" when there is no guild', async () => {
    const interaction = makeInteraction({ guild: null })
    await verifyContext.execute(interaction)
    expect(interaction.reply).toHaveBeenCalledWith('Something went wrong!')
  })

  it('replies something_went_wrong when the target member cannot be fetched', async () => {
    const interaction = makeInteraction()
    interaction.guild.members.fetch.mockRejectedValueOnce(new Error('unknown'))

    await verifyContext.execute(interaction)

    expect(interaction.guild.members.fetch).toHaveBeenCalledWith('target1')
    expect(interaction.reply).toHaveBeenCalledWith('something_went_wrong')
    expect(verifyUserMock).not.toHaveBeenCalled()
  })

  it('verifies the target member and replies with the answer', async () => {
    const interaction = makeInteraction()
    const targetMember = { id: 'target1', user: { id: 'target1', username: 'Target' } }
    interaction.guild.members.fetch.mockResolvedValueOnce(targetMember)
    verifyUserMock.mockResolvedValueOnce(true)

    await verifyContext.execute(interaction)

    expect(verifyUserMock).toHaveBeenCalledWith(interaction.guild, targetMember)
    expect(getVerifiedMessageAnswerMock).toHaveBeenCalledWith(true, 'en-US', targetMember.user, false)
    expect(interaction.reply).toHaveBeenCalledWith({ content: 'answer' })
  })

  it('treats verifying the invoking user themself as self-verify', async () => {
    const interaction = makeInteraction()
    const selfMember = { id: 'u1', user: { id: 'u1', username: 'Self' } }
    interaction.guild.members.fetch.mockResolvedValueOnce(selfMember)
    verifyUserMock.mockResolvedValueOnce(false)

    await verifyContext.execute(interaction)

    expect(getVerifiedMessageAnswerMock).toHaveBeenCalledWith(false, 'en-US', selfMember.user, true)
  })
})
