import express from 'express'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@gmod/config', () => ({
  ConfigServer: { domain: 'https://api.example.test', websiteUrl: 'https://dashboard.example.test' },
}))
vi.mock('@gmod/config/website.js', () => ({ ConfigWebsite: { wsUrl: 'wss://ws.example.test/' } }))

const { createDocsRouter } = await import('../../../src/routes/v6/docsRoutes.js')
const config = {
  apiUrl: 'https://api.example.test',
  websiteUrl: 'https://dashboard.example.test',
  wsUrl: 'wss://ws.example.test/',
}
function app(settings = config) {
  const instance = express()
  instance.use('/v6/docs', createDocsRouter(settings))
  instance.use((_error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(503).json({ error: { code: 'docs_configuration_invalid' } })
  })
  return instance
}

describe('locally hosted v6 interactive documentation', () => {
  it.each(['/v6/docs', '/v6/docs/', '/v6/docs/ws'])('serves the accessible documentation shell at %s', async (url) => {
    const response = await request(app()).get(url)
    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toMatch(/text\/html/)
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.text).toContain('/v6/docs/assets/swagger-ui-bundle.js')
    expect(response.text).toContain('/v6/docs/assets/browser.js')
    expect(response.text).toContain('WebSocket')
    expect(response.text).not.toMatch(/https:\/\/(?:cdn|unpkg|validator)/)
  })

  it('limits the documentation policy to local assets and its configured gateway without upgrading localhost', async () => {
    const response = await request(app()).get('/v6/docs')
    const policy = response.headers['content-security-policy']
    expect(policy).toContain("script-src 'self'")
    expect(policy).toContain("connect-src 'self' wss://ws.example.test")
    expect(policy).toContain("frame-ancestors 'none'")
    expect(policy).not.toMatch(/unsafe-eval|upgrade-insecure-requests|cdn|\*/)
  })

  it('provides download-ready OpenAPI and AsyncAPI contracts independently of the request Host', async () => {
    const http = await request(app()).get('/v6/docs/openapi.json').set('Host', 'lookalike.example.test')
    expect(http.status).toBe(200)
    expect(http.body.openapi).toBe('3.1.0')
    expect(http.body.servers[0].url).toContain('https://api.example.test')
    expect(http.body.paths['/auth/session']).toBeDefined()
    expect(JSON.stringify(http.body)).not.toContain('lookalike.example.test')
    const ws = await request(app()).get('/v6/docs/asyncapi.json')
    expect(ws.status).toBe(200)
    expect(ws.body.asyncapi).toBe('3.0.0')
    expect(ws.body.components.messages).toBeDefined()
  })

  it('exposes only sanitized public connection configuration', async () => {
    const response = await request(
      app({
        apiUrl: 'https://private:password@api.example.test/?token=secret',
        websiteUrl: 'https://private:password@dashboard.example.test/?token=secret',
        wsUrl: 'wss://private:password@ws.example.test/gateway?ticket=secret#private',
      }),
    ).get('/v6/docs/config.json')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      apiUrl: 'https://api.example.test',
      websiteUrl: 'https://dashboard.example.test',
      wsUrl: 'wss://ws.example.test/gateway',
    })
    expect(response.text).not.toMatch(/password|secret|ticket|private/)
  })

  it.each([
    ['browser.js', /javascript/],
    ['styles.css', /css/],
    ['swagger-ui-bundle.js', /javascript/],
    ['swagger-ui.css', /css/],
  ])('serves the installed %s asset without a CDN', async (asset, contentType) => {
    const response = await request(app()).get('/v6/docs/assets/' + asset)
    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toMatch(contentType)
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.text.length).toBeGreaterThan(100)
  })

  it('does not serve arbitrary dependency or workspace files', async () => {
    expect((await request(app()).get('/v6/docs/assets/package.json')).status).toBe(404)
  })

  it('rejects an invalid gateway protocol without returning private configuration', async () => {
    const response = await request(app({ ...config, wsUrl: 'https://private:secret@ws.example.test' })).get('/v6/docs')
    expect(response.status).toBe(503)
    expect(response.text).not.toMatch(/private|secret/)
  })
})
