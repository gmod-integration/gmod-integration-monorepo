import { beforeEach, describe, expect, it, vi } from 'vitest'

const getTranslateMock = vi.fn(async (key: string) => key)
vi.mock('@gmod/core/utils/localizations.js', () => ({ getTranslate: getTranslateMock }))

const verifyUserMock = vi.fn()
vi.mock('@gmod/domain-guild/discordModels.js', () => ({ verifyUser: verifyUserMock }))

const getVerifiedMessageAnswerMock = vi.fn(async () => ({ content: 'answer' }))
vi.mock('../../../../src/discord/utils/messages.js', () => ({
  getVerifiedMessageAnswer: getVerifiedMessageAnswerMock,
}))

const verify = (await import('../../../../src/discord/commands/admin/verify.js')).default

function makeInteraction(overrides: Record<string, any> = {}) {
  return {
    guild: { id: 'g1', preferredLocale: 'en-US' },
    user: { id: 'u1' },
    options: { getUser: vi.fn(() => null) },
    client: { guilds: { cache: new Map() } },
    reply: vi.fn(),
    ...overrides,
  } as any
}

beforeEach(() => {
  getTranslateMock.mockClear()
  verifyUserMock.mockReset()
  getVerifiedMessageAnswerMock.mockClear()
})

describe('commands/admin/verify execute', () => {
  it('returns early when there is no guild', async () => {
    const interaction = makeInteraction({ guild: null })
    const result = await verify.execute(interaction)
    expect(result).toBeUndefined()
    expect(interaction.reply).not.toHaveBeenCalled()
  })

  it('replies something_went_wrong when the member cannot be fetched', async () => {
    const membersFetch = vi.fn().mockRejectedValueOnce(new Error('unknown member'))
    const guildDomain = { preferredLocale: 'en-US', members: { fetch: membersFetch } }
    const interaction = makeInteraction({
      client: { guilds: { cache: new Map([['g1', guildDomain]]) } },
    })

    await verify.execute(interaction)

    expect(membersFetch).toHaveBeenCalledWith('u1')
    expect(interaction.reply).toHaveBeenCalledWith('something_went_wrong')
    expect(verifyUserMock).not.toHaveBeenCalled()
  })

  it('verifies the target user option when provided and replies with the answer', async () => {
    const targetMember = { id: 'target1', user: { id: 'target1', username: 'Target' } }
    const membersFetch = vi.fn().mockResolvedValueOnce(targetMember)
    const guildDomain = { preferredLocale: 'en-US', members: { fetch: membersFetch } }
    const interaction = makeInteraction({
      client: { guilds: { cache: new Map([['g1', guildDomain]]) } },
      options: { getUser: vi.fn(() => ({ id: 'target1' })) },
    })
    verifyUserMock.mockResolvedValueOnce(true)

    await verify.execute(interaction)

    expect(membersFetch).toHaveBeenCalledWith('target1')
    expect(verifyUserMock).toHaveBeenCalledWith(guildDomain, targetMember)
    expect(getVerifiedMessageAnswerMock).toHaveBeenCalledWith(true, 'en-US', targetMember.user, false)
    expect(interaction.reply).toHaveBeenCalledWith({ content: 'answer' })
  })

  it('defaults to the invoking user and treats it as self-verify', async () => {
    const selfMember = { id: 'u1', user: { id: 'u1', username: 'Self' } }
    const membersFetch = vi.fn().mockResolvedValueOnce(selfMember)
    const guildDomain = { preferredLocale: 'en-US', members: { fetch: membersFetch } }
    const interaction = makeInteraction({
      client: { guilds: { cache: new Map([['g1', guildDomain]]) } },
    })
    verifyUserMock.mockResolvedValueOnce(false)

    await verify.execute(interaction)

    expect(membersFetch).toHaveBeenCalledWith('u1')
    expect(getVerifiedMessageAnswerMock).toHaveBeenCalledWith(false, 'en-US', selfMember.user, true)
  })
})
