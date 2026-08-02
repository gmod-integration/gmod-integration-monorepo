import { beforeEach, describe, expect, it, vi } from 'vitest'

const replaceStoredAvatarMock = vi.fn()
vi.mock('@gmod/infra-minio', () => ({ replaceStoredAvatar: replaceStoredAvatarMock }))

describe('userUpdate event', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    replaceStoredAvatarMock.mockResolvedValue(undefined)
  })

  it('returns early when the new user has no id (partial user)', async () => {
    const mod = await import('../../../src/discord/events/userUpdate.js')
    const oldUser = { id: 'user1', avatar: 'a' }
    const newUser = { id: '', avatar: 'a', displayAvatarURL: vi.fn() }

    await mod.default.execute(oldUser as any, newUser as any)

    expect(replaceStoredAvatarMock).not.toHaveBeenCalled()
  })

  it('returns early when the avatar has not changed', async () => {
    const mod = await import('../../../src/discord/events/userUpdate.js')
    const oldUser = { id: 'user1', avatar: 'same' }
    const newUser = { id: 'user1', avatar: 'same', displayAvatarURL: vi.fn() }

    await mod.default.execute(oldUser as any, newUser as any)

    expect(replaceStoredAvatarMock).not.toHaveBeenCalled()
  })

  it('replaces the stored avatar when it changed', async () => {
    const mod = await import('../../../src/discord/events/userUpdate.js')
    const oldUser = { id: 'user1', avatar: 'old' }
    const newUser = {
      id: 'user1',
      avatar: 'new',
      displayAvatarURL: vi.fn().mockReturnValue('https://cdn.example/avatar.png'),
    }

    await mod.default.execute(oldUser as any, newUser as any)

    expect(replaceStoredAvatarMock).toHaveBeenCalledWith('discord', 'user1', 'https://cdn.example/avatar.png')
  })

  it('swallows a failing avatar replacement', async () => {
    replaceStoredAvatarMock.mockRejectedValue(new Error('minio down'))
    const mod = await import('../../../src/discord/events/userUpdate.js')
    const oldUser = { id: 'user1', avatar: 'old' }
    const newUser = { id: 'user1', avatar: 'new', displayAvatarURL: vi.fn().mockReturnValue('url') }

    await expect(mod.default.execute(oldUser as any, newUser as any)).resolves.toBeUndefined()
  })
})
