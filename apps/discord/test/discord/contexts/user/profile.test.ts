import { beforeEach, describe, expect, it, vi } from 'vitest'

const getProfileMessageMock = vi.fn(async () => ({ content: 'profile' }))
vi.mock('../../../../src/discord/utils/messages.js', () => ({ getProfileMessage: getProfileMessageMock }))

const profileContext = (await import('../../../../src/discord/contexts/user/profile.js')).default

function makeInteraction(overrides: Record<string, any> = {}) {
  return {
    guild: { id: 'g1' },
    options: { getUser: vi.fn(() => null) },
    reply: vi.fn(),
    ...overrides,
  } as any
}

beforeEach(() => {
  getProfileMessageMock.mockClear()
})

describe('contexts/user/profile execute', () => {
  it('replies "Something went wrong!" when there is no guild', async () => {
    const interaction = makeInteraction({ guild: null, options: { getUser: vi.fn(() => ({ id: 't1' })) } })
    await profileContext.execute(interaction)
    expect(interaction.reply).toHaveBeenCalledWith('Something went wrong!')
  })

  it('replies "Something went wrong!" when the target user option is missing', async () => {
    const interaction = makeInteraction()
    await profileContext.execute(interaction)
    expect(interaction.reply).toHaveBeenCalledWith('Something went wrong!')
    expect(getProfileMessageMock).not.toHaveBeenCalled()
  })

  it('replies with the profile of the target user', async () => {
    const targetUser = { id: 't1' }
    const interaction = makeInteraction({ options: { getUser: vi.fn(() => targetUser) } })

    await profileContext.execute(interaction)

    expect(getProfileMessageMock).toHaveBeenCalledWith(interaction.guild, targetUser)
    expect(interaction.reply).toHaveBeenCalledWith({ content: 'profile' })
  })
})
