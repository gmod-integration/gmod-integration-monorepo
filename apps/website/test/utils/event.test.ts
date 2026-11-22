import { describe, expect, it } from 'vitest'
import { normalizeDiscordUserPayload } from '../../src/utils/event.js'

describe('utils/event.tsx normalizeDiscordUserPayload', () => {
  it('fills every field from a full payload', () => {
    expect(
      normalizeDiscordUserPayload({
        id: '1',
        username: 'bob',
        globalName: 'Bobby',
        displayName: 'Bob D.',
        discriminator: '0001',
        avatarURL: 'https://a',
        displayAvatarURL: 'https://b',
      }),
    ).toEqual({
      id: '1',
      username: 'bob',
      globalName: 'Bobby',
      displayName: 'Bob D.',
      discriminator: '0001',
      avatarURL: 'https://a',
      displayAvatarURL: 'https://b',
    })
  })

  it('falls back to empty strings for every field on an empty payload', () => {
    expect(normalizeDiscordUserPayload({})).toEqual({
      id: '',
      username: '',
      globalName: '',
      displayName: '',
      discriminator: '',
      avatarURL: '',
      displayAvatarURL: '',
    })
  })

  it('tolerates a nullish payload', () => {
    expect(normalizeDiscordUserPayload(null)).toEqual({
      id: '',
      username: '',
      globalName: '',
      discriminator: '',
      avatarURL: '',
      displayAvatarURL: '',
      displayName: '',
    })
  })

  it('derives displayName/globalName/avatar fallbacks in priority order', () => {
    // No displayAvatarURL/avatarURL/globalName/displayName -> derives from username.
    expect(normalizeDiscordUserPayload({ username: 'bob' })).toMatchObject({
      globalName: 'bob',
      displayName: 'bob',
      avatarURL: '',
      displayAvatarURL: '',
    })

    // avatarURL present, displayAvatarURL absent -> displayAvatarURL falls back to avatarURL.
    expect(normalizeDiscordUserPayload({ avatarURL: 'https://avatar' })).toMatchObject({
      avatarURL: 'https://avatar',
      displayAvatarURL: 'https://avatar',
    })

    // globalName present takes priority over displayName/username for the derived fallback.
    expect(normalizeDiscordUserPayload({ globalName: 'Global', username: 'bob' })).toMatchObject({
      globalName: 'Global',
      displayName: 'Global',
    })
  })

  it('normalizes raw Discord OAuth names and custom avatars for the connected profile', () => {
    const avatar = '0123456789abcdef0123456789abcdef'
    expect(normalizeDiscordUserPayload({ id: '4194304', username: 'bob', global_name: 'Bobby', avatar })).toMatchObject(
      {
        id: '4194304',
        globalName: 'Bobby',
        displayName: 'Bobby',
        avatarURL: `https://cdn.discordapp.com/avatars/4194304/${avatar}.webp`,
        displayAvatarURL: `https://cdn.discordapp.com/avatars/4194304/${avatar}.webp`,
      },
    )
  })

  it('uses the account’s Discord default avatar when its normalized profile has no custom image', () => {
    expect(normalizeDiscordUserPayload({ id: '4194304', username: 'bob', discriminator: '0' })).toMatchObject({
      avatarURL: 'https://cdn.discordapp.com/embed/avatars/1.png',
      displayAvatarURL: 'https://cdn.discordapp.com/embed/avatars/1.png',
    })
  })
})
