import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEV,
  DEV_SHOW_MISSING_TRANSLATIONS,
  INVITE_URL,
  getDiscordUser,
  getGuild,
  getServer,
  isDevEnvironment,
  isProduction,
  linkifyEmails,
} from '../../src/utils/utils.js'

describe('utils/utils.tsx', () => {
  it('DEV/DEV_SHOW_MISSING_TRANSLATIONS mirror the test WEBSITE_CONFIG', () => {
    expect(DEV).toBe(false)
    expect(isDevEnvironment()).toBe(false)
    expect(DEV_SHOW_MISSING_TRANSLATIONS).toBe(false)
  })

  it('builds the discord bot invite URL from the configured client id', () => {
    expect(INVITE_URL).toBe(
      'https://discord.com/oauth2/authorize?client_id=test-discord-client-id&permissions=8&scope=bot',
    )
  })

  describe('isProduction', () => {
    it('is true when the current origin is the production domain', () => {
      Object.defineProperty(window, 'location', {
        value: new URL('https://gmod-integration.com/dashboard'),
        writable: true,
      })
      expect(isProduction()).toBe(true)
    })

    it('is false for any other origin', () => {
      Object.defineProperty(window, 'location', {
        value: new URL('http://localhost:3000/dashboard'),
        writable: true,
      })
      expect(isProduction()).toBe(false)
    })
  })

  describe('linkifyEmails', () => {
    it('wraps email addresses in a mailto link', () => {
      expect(linkifyEmails('contact us at hello@example.com please')).toBe(
        'contact us at <a class="text-info hover:text-info-content" href="mailto:hello@example.com">hello@example.com</a> please',
      )
    })

    it('leaves text without emails untouched', () => {
      expect(linkifyEmails('no email here')).toBe('no email here')
    })
  })

  describe('localStorage-backed getters', () => {
    beforeEach(() => {
      window.localStorage.clear()
    })

    it('parse stored JSON when present', () => {
      window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1' }))
      window.localStorage.setItem('server', JSON.stringify({ id: 's1' }))
      window.localStorage.setItem('discordUser', JSON.stringify({ id: 'd1' }))
      expect(getGuild()).toEqual({ id: 'g1' })
      expect(getServer()).toEqual({ id: 's1' })
      expect(getDiscordUser()).toEqual({ id: 'd1' })
    })

    it('fall back to an empty object when nothing is stored', () => {
      expect(getGuild()).toEqual({})
      expect(getServer()).toEqual({})
      expect(getDiscordUser()).toEqual({})
    })
  })
})
