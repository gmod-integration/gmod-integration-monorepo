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
})
