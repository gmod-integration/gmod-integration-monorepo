import { describe, expect, it } from 'vitest'
import {
  getDiscordAvatarUrl,
  getDiscordDefaultAvatarUrl,
  type DiscordAvatarIdentity,
} from '../../src/utils/discordAvatar.js'

const id = '4194304'
const hash = '0123456789abcdef0123456789abcdef'

describe('Discord avatar URLs', () => {
  it('uses the supplied display avatar before the global avatar and retains application proxy URLs', () => {
    expect(
      getDiscordAvatarUrl({
        id,
        displayAvatarURL: '/avatars/discord/4194304',
        avatarURL: 'https://cdn/global.png',
        avatar: hash,
      }),
    ).toBe('/avatars/discord/4194304')
    expect(getDiscordAvatarUrl({ id, avatarURL: 'https://cdn/global.png', avatar: hash })).toBe(
      'https://cdn/global.png',
    )
  })

  it('resolves raw OAuth avatar hashes, including animated avatars', () => {
    expect(getDiscordAvatarUrl({ id, avatar: hash })).toBe(`https://cdn.discordapp.com/avatars/${id}/${hash}.webp`)
    expect(getDiscordAvatarUrl({ id, avatar: `a_${hash}` })).toBe(
      `https://cdn.discordapp.com/avatars/${id}/a_${hash}.gif`,
    )
  })

  it('uses Discord defaults for legacy and migrated accounts without custom avatars', () => {
    expect(getDiscordDefaultAvatarUrl({ id, discriminator: '1234' })).toBe(
      'https://cdn.discordapp.com/embed/avatars/4.png',
    )
    expect(getDiscordDefaultAvatarUrl({ id, discriminator: '0' })).toBe(
      'https://cdn.discordapp.com/embed/avatars/1.png',
    )
    expect(getDiscordDefaultAvatarUrl({ id: '25165824' })).toBe('https://cdn.discordapp.com/embed/avatars/0.png')
    expect(getDiscordAvatarUrl({ id, avatar: null })).toBe('https://cdn.discordapp.com/embed/avatars/1.png')
  })

  it('falls back to the default for invalid raw hashes without building untrusted CDN paths', () => {
    expect(getDiscordAvatarUrl({ id, avatar: '../other/avatar.png' })).toBe(
      'https://cdn.discordapp.com/embed/avatars/1.png',
    )
    expect(getDiscordAvatarUrl({ id, avatar: 'https://example.com/image.png' })).toBe(
      'https://cdn.discordapp.com/embed/avatars/1.png',
    )
  })

  it('tolerates malformed avatar fields in an older presentation cache', () => {
    const cached = {
      id,
      displayAvatarURL: 42,
      avatarURL: {},
      avatar: false,
      discriminator: [],
    } as unknown as DiscordAvatarIdentity
    expect(getDiscordAvatarUrl(cached)).toBe('https://cdn.discordapp.com/embed/avatars/1.png')
  })

  it.each([undefined, {}, { id: '' }, { id: '../other' }, { id: '-1' }, { id: '1'.repeat(100) }])(
    'does not invent an avatar for an absent or malformed identity: %j',
    (user) => {
      expect(getDiscordDefaultAvatarUrl(user)).toBe('')
      expect(getDiscordAvatarUrl(user)).toBe('')
    },
  )
})
