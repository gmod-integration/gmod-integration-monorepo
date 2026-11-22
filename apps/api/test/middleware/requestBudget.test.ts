import express from 'express'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { requestBudget } from '../../src/middleware/requestBudget.js'
const app = () => {
  const server = express()
  server.use(express.json({ limit: '10mb' }), requestBudget)
  server.use((_req, res) => res.json({ accepted: true }))
  return server
}
describe('HTTP request structural limits', () => {
  it.each(['/v6/guilds/g1/servers/s1/status/configuration', '/V6/GUILDS/g1/SERVERS/s1/STATUS/CONFIGURATION'])(
    'rejects excessive status buttons before validation for %s',
    async (path) => {
      const data = { buttons: Array.from({ length: 26 }, () => ({})) }
      const result = await request(app()).put(path).send(data)
      expect(result.status).toBe(413)
      expect(result.body).toEqual({
        error: { code: 'invalid_request', message: 'The request structure is too large or unsupported.' },
      })
      expect(JSON.stringify(result.body).length).toBeLessThan(150)
    },
  )
  it('bounds generic arrays, depth, keys and text without reflecting the submitted payload', async () => {
    for (const value of [
      { a: new Array(501).fill({ private: 'marker' }) },
      { a: 'private-marker'.repeat(6000) },
      JSON.parse('{"constructor":{"private":"marker"}}'),
    ]) {
      const result = await request(app()).post('/v6/settings').send(value)
      expect(result.status).toBe(413)
      expect(JSON.stringify(result.body)).not.toContain('marker')
    }
  })
  it('allows a bounded avatar payload only on the existing custom bot route', async () => {
    const value = { avatar: `data:image/png;base64,${'A'.repeat(100000)}` }
    expect((await request(app()).put('/v3/users/u1/guilds/g1/bot').send(value)).status).toBe(200)
    expect((await request(app()).put('/v6/settings').send(value)).status).toBe(413)
  })
  it('keeps legacy capture requests bounded while supporting image-sized strings', async () => {
    const value = { screenshot: 'A'.repeat(100000) }
    expect((await request(app()).post('/v3/clients/u1/servers/s1/screenshots').send(value)).status).toBe(200)
    expect((await request(app()).post('/v3/servers/s1/settings').send(value)).status).toBe(413)
  })
  it('bounds query parameters and does not call the downstream handler on rejected structure', () => {
    const req = { path: '/v6/settings', body: undefined, query: { a: new Array(101).fill('value') } }
    const res = { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() }
    const next = vi.fn()
    requestBudget(req as unknown as express.Request, res as unknown as express.Response, next)
    expect(res.status).toHaveBeenCalledWith(413)
    expect(next).not.toHaveBeenCalled()
  })
})
