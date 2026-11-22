import { describe, expect, it } from 'vitest'
import {
  CustomBotProfileCommandSchema,
  CustomBotAvatarSchema,
  CustomBotInfoSchema,
  CustomBotTokenCommandSchema,
  CUSTOM_BOT_AVATAR_MAX_BYTES,
} from '../../src/server/CustomBotProfileSchema.js'

describe('custom bot profile contracts', () => {
  it('accepts explicit profile changes and bounded raster uploads without a credential field', () => {
    expect(CustomBotProfileCommandSchema.parse({ username: ' Example ', status: 'disabled' })).toEqual({
      username: 'Example',
      status: 'disabled',
    })
    expect(CustomBotAvatarSchema.safeParse('data:image/png;base64,AA==').success).toBe(true)
    expect(CustomBotProfileCommandSchema.safeParse({ username: 'Example', token: 'private' }).success).toBe(false)
  })
  it.each([
    'http://127.0.0.1/avatar',
    '/tmp/avatar.png',
    'file:///tmp/avatar.png',
    'data:image/svg+xml;base64,AAAA',
    'data:image/png;base64,AAA',
    'data:image/png;base64,A===',
  ])('rejects non-upload sources and invalid encodings: %s', (input) =>
    expect(CustomBotAvatarSchema.safeParse(input).success).toBe(false),
  )
  it('rejects oversized bytes before an image decoder or queue is invoked', () => {
    const data = Buffer.alloc(CUSTOM_BOT_AVATAR_MAX_BYTES + 1).toString('base64')
    expect(CustomBotAvatarSchema.safeParse(`data:image/png;base64,${data}`).success).toBe(false)
  })
  it('makes returned bot credentials impossible while allowing a separate token command', () => {
    const info = {
      id: 'b1',
      username: 'Example',
      avatar: null,
      status: 'disabled',
      custom: true,
      purchased: true,
      onGuild: true,
      active: true,
      tokenConfigured: true,
    }
    expect(CustomBotInfoSchema.parse(info)).toEqual(info)
    expect(CustomBotInfoSchema.safeParse({ ...info, token: 'private' }).success).toBe(false)
    expect(CustomBotTokenCommandSchema.parse({ token: 'replacement-token' })).toEqual({ token: 'replacement-token' })
    expect(CustomBotTokenCommandSchema.safeParse({ token: { value: 'invalid' } }).success).toBe(false)
  })
})
