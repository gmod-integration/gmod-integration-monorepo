// import '@gmod/core/utils/instrument.js';
import { fileURLToPath } from 'node:url'
import { ConfigPrivacy, ConfigServer } from '@gmod/config'
import '@gmod/core/utils/update-log.js'
import express, { type NextFunction, type Request, type Response } from 'express'
import { gmLog } from '@gmod/shared/logger.js'
import { requestBudget } from '@/middleware/requestBudget.js'
import loggerMiddleware from '@/middleware/v3/loggers.js'
import cors from 'cors'
import helmet from 'helmet'
import mainRoutes from '@/routes/mainRoutes.js'
import useragent from 'express-useragent'
// import * as Sentry from '@sentry/node';
import errorMiddleware from '@/middleware/errorMiddleware.js'
import { gracefulShutdownRedis } from '@gmod/infra-redis'
import { connectPrisma, gracefulShutdownPrisma } from '@gmod/infra-prisma'
import { gracefulShutdownMongo } from '@gmod/core/database/gm_server_logs.js'
import '@gmod/infra-bullmq'
import { startAccountErasureWorker } from '@gmod/domain-compliance/accountErasure.js'
import { startDiscordTokenRefreshWorker } from '@gmod/domain-auth/discordOAuth.js'

let stopAccountErasureWorker: (() => void) | undefined
let stopDiscordTokenRefreshWorker: (() => void) | undefined

// Express
export const app = express()
app.set('trust proxy', ConfigServer.trustedProxies?.length ? ConfigServer.trustedProxies : false)
let httpServer: ReturnType<typeof app.listen> | undefined
let shutdownPromise: Promise<void> | undefined

const allowedCorsOrigins = new Set<string>()
for (const candidate of [ConfigServer.websiteUrl, ConfigServer.domain]) {
  try {
    allowedCorsOrigins.add(new URL(candidate).origin)
  } catch {
    // Ignore invalid URLs: config validation should already prevent this.
  }
}

// User Agent
app.use(useragent.express())

let inShutdown = false
app.use((req: Request, res: Response, next: NextFunction) => {
  if (inShutdown) {
    if (req.path.toLowerCase() === '/v6' || req.path.toLowerCase().startsWith('/v6/')) {
      res.setHeader('Cache-Control', 'no-store')
      res
        .status(503)
        .json({ error: { code: 'service_unavailable', message: 'Server is in the process of restarting' } })
    } else res.status(503).json({ error: 'Server is in the process of restarting' })
  } else {
    next()
  }
})

// CORS
//
// IMPORTANT: cors() interprets a bare function argument as an *options delegate* -
// `(req, cb) => cb(err, corsOptions)` - not as an origin-check callback. Passing
// `callback(null, true)` from that position used to mean "here are your cors options: `true`",
// which Object.assign silently discards (a boolean has no own enumerable properties), so every
// request actually fell back to the package default of `origin: '*'` - meaning the entire
// allowlist below was being computed and then ignored, and every allowed request got a wildcard
// Access-Control-Allow-Origin instead of being scoped to its actual origin. Wrapping the check in
// `{ origin: (origin, cb) => cb(err, allow) }` uses the correct, documented per-origin callback
// signature, so `callback(null, true)` now genuinely reflects the request's own Origin header.
app.use(
  cors({
    credentials: true,
    origin: (origin: string | undefined, callback: any) => {
      if (!origin) {
        callback(null, true)
        return
      }

      let parsedOrigin: URL
      try {
        parsedOrigin = new URL(origin)
      } catch {
        callback(new Error('Not allowed by CORS'))
        return
      }

      // Match the serialized origin and hostname; substring checks also admit lookalike domains.
      const isWebOrigin = ['http:', 'https:'].includes(parsedOrigin.protocol) && parsedOrigin.origin === origin
      const isConfiguredOrigin = allowedCorsOrigins.has(origin)
      const hostname = parsedOrigin.hostname
      const isLocalOrigin = ['localhost', '127.0.0.1', '[::1]'].includes(hostname)

      if (isWebOrigin && (isConfiguredOrigin || (ConfigServer.dev && isLocalOrigin))) {
        callback(null, true)
      } else {
        callback(new Error('Not allowed by CORS'))
      }
    },
  }),
)

app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin
  if (origin && /\.gmod-integration\.com$/.test(origin)) {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
  }
  next()
})

// Helmet
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://fonts.googleapis.com',
          'https://cdnjs.cloudflare.com',
          '*.gmod-integration.com',
        ],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          'https://cdnjs.cloudflare.com',
          '*.gmod-integration.com',
        ],
        connectSrc: [
          "'self'",
          'https://cdnjs.cloudflare.com',
          'https://fonts.googleapis.com',
          'https://fonts.gstatic.com',
          '*.gmod-integration.com',
        ],
        imgSrc: ["'self'", 'data:', 'https://cdn.discordapp.com', '*.gmod-integration.com'],
        frameSrc: ["'self'", '*.gmod-integration.com', 'https://cdnjs.cloudflare.com'],
        objectSrc: ["'none'"],
        mediaSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginResourcePolicy: false,
    frameguard: true,
    hsts: true,
    xssFilter: true,
    noSniff: true,
  }),
)

// Body Parser
app.use('/v6', express.json({ limit: '256kb', type: 'application/json' }))
app.use(express.json({ limit: ConfigServer.bodyLimit, type: 'application/json' }))
// Runtime body-parser supports depth; the shared legacy type declarations omit this option.
const v6FormOptions = { limit: '256kb', extended: true, parameterLimit: 100, depth: 4 }
const legacyFormOptions = { limit: ConfigServer.bodyLimit, extended: true, parameterLimit: 200, depth: 8 }
app.use('/v6', express.urlencoded(v6FormOptions))
app.use(express.urlencoded(legacyFormOptions))
app.use(requestBudget)

// Logger
app.use(loggerMiddleware)

// Routes
app.use(mainRoutes)

// 404
app.all(/.*/, (req: Request, res: Response, _next: NextFunction) => {
  res.status(404).json({ error: '404 Not Found' })
})

// Sentry
// Sentry.setupExpressErrorHandler(app);

// Errors
app.use(errorMiddleware)

export function gracefulShutdown(): Promise<void> {
  if (shutdownPromise) return shutdownPromise
  inShutdown = true
  gmLog('shutdown', 'Gracefully shutting down...')
  shutdownPromise = (async () => {
    let deadline: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_resolve, reject) => {
      // Leave time for Docker's 120-second stop grace period to collect the exit.
      deadline = setTimeout(() => reject(new Error('API shutdown deadline exceeded')), 105_000)
      deadline.unref()
    })
    const drain = async () => {
      stopAccountErasureWorker?.()
      await Promise.all([
        new Promise<void>((resolve, reject) => {
          if (!httpServer) return resolve()
          httpServer.close((error) => (error ? reject(error) : resolve()))
          httpServer.closeIdleConnections?.()
        }),
        stopDiscordTokenRefreshWorker?.(),
      ])
      await Promise.all([gracefulShutdownRedis(), gracefulShutdownPrisma(), gracefulShutdownMongo()])
    }
    try {
      await Promise.race([drain(), timeout])
      process.exit(0)
    } catch {
      gmLog('shutdown', 'API shutdown could not complete before exit', true)
      httpServer?.closeAllConnections?.()
      process.exit(1)
    } finally {
      clearTimeout(deadline)
    }
  })()
  return shutdownPromise
}

export async function main() {
  await connectPrisma()
  if (ConfigPrivacy.hashSecret) stopAccountErasureWorker = startAccountErasureWorker()
  stopDiscordTokenRefreshWorker = startDiscordTokenRefreshWorker()

  // Listen
  httpServer = app.listen(ConfigServer.ports.api, () => {
    gmLog('express', '- - - - - - - - - - - - - - - - - - -')
    gmLog('express', `Server started and listening on port ${ConfigServer.ports.api}`)
    gmLog('express', '- - - - - - - - - - - - - - - - - - -')
  })

  // Unhandled Errors
  process.on('unhandledRejection', (error: Error) => {
    gmLog('unhandledRejection', error.message, true)
    console.error(error)
  })

  // Capture termination signals
  process.on('SIGINT', gracefulShutdown)
  process.on('SIGTERM', gracefulShutdown)
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  await main()
}
