import { describe, expect, it } from 'vitest'
import { WEBSITE_CONFIG } from '../src/config.js'

describe('config.ts', () => {
  it('exposes the build-time-injected website runtime config', () => {
    expect(WEBSITE_CONFIG).toEqual({
      dev: false,
      devShowMissingTranslations: false,
      apiUrl: 'http://localhost:5001',
      wsUrl: 'ws://localhost:5002',
      discordClientId: 'test-discord-client-id',
      websiteUrl: 'http://localhost:3000',
    })
  })
})
