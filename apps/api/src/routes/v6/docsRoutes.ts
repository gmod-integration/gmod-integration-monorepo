import express from 'express'
import { createRequire } from 'node:module'
import { ConfigServer } from '@gmod/config'
import { ConfigWebsite } from '@gmod/config/website.js'
import { createOpenApiDocument } from '../../docs/openapi.js'
import { createAsyncApiDocument } from '../../docs/asyncapi.js'
import { createDocsPage } from '../../docs/page.js'
import { docsBrowserSource } from '../../docs/browser.js'
import { docsStyles } from '../../docs/styles.js'

type DocsConfig = { apiUrl: string; wsUrl: string; websiteUrl: string }
const require = createRequire(import.meta.url)

/** The public documentation contains connection locations, never service credentials. */
function publicConfig(config: DocsConfig): DocsConfig {
  const ws = new URL(config.wsUrl)
  if (!['ws:', 'wss:'].includes(ws.protocol)) throw new Error('Configure a ws:// or wss:// WebSocket URL.')
  ws.username = ''
  ws.password = ''
  ws.search = ''
  ws.hash = ''
  return {
    apiUrl: new URL(config.apiUrl).origin,
    websiteUrl: new URL(config.websiteUrl).origin,
    wsUrl: ws.toString(),
  }
}

export function createDocsRouter(config: DocsConfig) {
  const router = express.Router()
  router.use((_req, res, next) => {
    const settings = publicConfig(config)
    res.setHeader('Cache-Control', 'no-store')
    // Override the API's general policy only on documentation responses. In particular,
    // localhost HTTP must not be upgraded to HTTPS, and only the configured WS may connect.
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "font-src 'self'",
        `connect-src 'self' ${new URL(settings.wsUrl).origin}`,
        "object-src 'none'",
        "base-uri 'none'",
        "frame-ancestors 'none'",
        "form-action 'self'",
      ].join('; '),
    )
    next()
  })

  router.get(['/', '/ws'], (_req, res) => res.type('html').send(createDocsPage()))
  router.get('/config.json', (_req, res) => res.json(publicConfig(config)))
  router.get('/openapi.json', (_req, res) => res.json(createOpenApiDocument(publicConfig(config).apiUrl)))
  router.get('/asyncapi.json', (_req, res) => {
    const settings = publicConfig(config)
    res.json(createAsyncApiDocument(settings.wsUrl, settings.apiUrl))
  })
  router.get('/assets/browser.js', (_req, res) => res.type('application/javascript').send(docsBrowserSource))
  router.get('/assets/styles.css', (_req, res) => res.type('text/css').send(docsStyles))
  router.get('/assets/swagger-ui-bundle.js', (_req, res) =>
    res.sendFile(require.resolve('swagger-ui-dist/swagger-ui-bundle.js')),
  )
  router.get('/assets/swagger-ui.css', (_req, res) => res.sendFile(require.resolve('swagger-ui-dist/swagger-ui.css')))
  return router
}

export default createDocsRouter({
  apiUrl: ConfigServer.domain,
  websiteUrl: ConfigServer.websiteUrl,
  wsUrl: ConfigWebsite.wsUrl,
})
