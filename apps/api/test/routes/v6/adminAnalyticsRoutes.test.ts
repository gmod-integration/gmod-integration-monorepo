import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as AuthSessions from '@gmod/domain-auth/authSessions.js'

const mocks = vi.hoisted(() => ({ session: vi.fn(), operator: vi.fn(), analytics: vi.fn() }))
vi.mock('@gmod/config', () => ({
  ConfigServer: { websiteUrl: 'https://dashboard.example.test', domain: 'https://api.example.test', dev: false },
  ConfigDiscord: { clientSecret: 'test-analytics-csrf-key' },
  ConfigAuth: { credentialEncryptionKey: 'test-analytics-csrf-key' },
}))
vi.mock('@gmod/infra-prisma', () => ({ default: { gm_user: { findFirst: mocks.operator } } }))
vi.mock('@gmod/infra-redis', () => ({ default: {} }))
vi.mock('@gmod/domain-auth/authSessions.js', async (actual) => ({
  ...(await actual<typeof AuthSessions>()),
  resolveRequestSession: mocks.session,
}))
vi.mock('@gmod/shared/logger.js', () => ({ gmLog: vi.fn() }))
vi.mock('@gmod/core/models/v6/adminAnalytics.js', () => ({ getAdminAnalytics: mocks.analytics }))
const { default: router } = await import('../../../src/routes/v6/adminRoutes.js')
const developerID = '333650866747867137'
const auth = () => ({
  id: 'analytics-session',
  discordID: developerID,
  tokenHash: 'sha256:fixture',
  createdAt: new Date(),
  lastSeenAt: new Date(),
  expiresAt: new Date(Date.now() + 600_000),
  absoluteExpiresAt: new Date(Date.now() + 3_600_000),
})
const app = () => {
  const instance = express()
  instance.use('/v6/admin', router)
  instance.use(
    (
      error: { status?: number; code?: string },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => res.status(error.status || 503).json({ error: { code: error.code || 'service_unavailable' } }),
  )
  return instance
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.session.mockResolvedValue(auth())
  mocks.operator.mockResolvedValue({ id: developerID, rank: 'user' })
  mocks.analytics.mockResolvedValue({ registrations: [] })
})

describe('protected administration analytics', () => {
  it.each(['', '?days=7', '?days=30', '?days=90'])('accepts only a supported bounded period: %s', async (query) => {
    const result = await request(app()).get(`/v6/admin/analytics${query}`)
    expect(result.status).toBe(200)
    expect(result.headers['cache-control']).toBe('no-store')
    expect(mocks.analytics).toHaveBeenCalledExactlyOnceWith({ days: query ? Number(query.slice(6)) : 30 })
  })
  it.each(['?days=365', '?days=07', '?days=', '?days=7&days=30', '?days[]=7', '?days=7&includeTokens=true'])(
    'rejects invalid or ambiguous query input: %s',
    async (query) => {
      expect((await request(app()).get(`/v6/admin/analytics${query}`)).status).toBe(400)
      expect(mocks.analytics).not.toHaveBeenCalled()
    },
  )
  it('rejects missing sessions before any account or analytics read', async () => {
    mocks.session.mockResolvedValue(null)
    expect((await request(app()).get('/v6/admin/analytics')).status).toBe(401)
    expect(mocks.operator).not.toHaveBeenCalled()
    expect(mocks.analytics).not.toHaveBeenCalled()
  })
  it('rejects an unlisted account even if its database rank claims developer access', async () => {
    mocks.session.mockResolvedValue({ ...auth(), discordID: '111111111111111111' })
    mocks.operator.mockResolvedValue({ id: '111111111111111111', rank: 'developer' })
    expect((await request(app()).get('/v6/admin/analytics')).status).toBe(403)
    expect(mocks.analytics).not.toHaveBeenCalled()
  })
  it.each([{ actorDiscordID: developerID }, { actorSessionID: 'parent' }])(
    'rejects delegated administrator analytics: %j',
    async (delegation) => {
      mocks.session.mockResolvedValue({ ...auth(), ...delegation })
      expect((await request(app()).get('/v6/admin/analytics')).status).toBe(403)
      expect(mocks.analytics).not.toHaveBeenCalled()
    },
  )
  it('rejects a foreign browser origin before accessing analytics', async () => {
    const result = await request(app()).get('/v6/admin/analytics').set('Origin', 'https://foreign.example.test')
    expect(result.status).toBe(403)
    expect(mocks.analytics).not.toHaveBeenCalled()
  })
  it('propagates an unavailable aggregate without fabricating an empty successful response', async () => {
    mocks.analytics.mockRejectedValue(new Error('private storage error'))
    const result = await request(app()).get('/v6/admin/analytics')
    expect(result.status).toBe(503)
    expect(JSON.stringify(result.body)).not.toContain('private')
  })
})
