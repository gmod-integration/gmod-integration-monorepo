import { describe, expect, it } from 'vitest'
import { ServerDashboardSettingsSchema } from '../../src/server/DashboardSettingsSchema.js'

describe('dashboard support URL validation', () => {
  it.each(['', 'https://support.example/help', 'http://localhost/help'])(
    'accepts an optional HTTP support destination: %s',
    (ig_supportLink) => {
      expect(ServerDashboardSettingsSchema.safeParse({ ig_supportLink }).success).toBe(true)
    },
  )
  it.each(['not a URL', 'https://', 'javascript:alert(1)'])(
    'rejects an invalid support destination: %s',
    (ig_supportLink) => {
      expect(ServerDashboardSettingsSchema.safeParse({ ig_supportLink }).success).toBe(false)
    },
  )
})
