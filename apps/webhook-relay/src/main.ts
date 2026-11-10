import { loadConfig, type RelayConfig } from './config.js'
import { createRelay } from './relay.js'
import { createDiscordWebhookSender, type WebhookSenderFactory } from './webhooks.js'

export interface ServeOptions {
  port: number
  hostname: string
  fetch: (request: Request) => Response | Promise<Response>
}

export interface RunningServer {
  /** Bun's `server.stop()`: stops accepting connections, lets in-flight requests finish. */
  stop(closeActiveConnections?: boolean): unknown
}

export type Serve = (options: ServeOptions) => RunningServer

export const bunServe: Serve = (options) => {
  const bun = (globalThis as { Bun?: { serve: Serve } }).Bun
  if (!bun) {
    throw new Error('apps/webhook-relay runs on Bun (it uses Bun.serve): start it with `bun src/index.ts`')
  }
  return bun.serve(options)
}

type ProcessLike = Pick<NodeJS.Process, 'on' | 'once' | 'exit'>

export interface MainDeps {
  env?: Record<string, string | undefined>
  serve?: Serve
  createSender?: WebhookSenderFactory
  proc?: ProcessLike
}

export async function main(deps: MainDeps = {}) {
  const { env = process.env, serve = bunServe, createSender = createDiscordWebhookSender, proc = process } = deps

  let config: RelayConfig
  try {
    config = loadConfig(env)
  } catch (err) {
    console.error((err as Error).message)
    proc.exit(1)
    return
  }

  const relay = createRelay({ barerToken: config.barerToken, createSender })
  const server = serve({ port: config.port, hostname: config.hostname, fetch: relay.app.fetch })
  console.log(`webhook-relay listening on ${config.hostname}:${config.port}`)

  let shuttingDown = false
  const shutdown = async () => {
    if (shuttingDown) return
    shuttingDown = true
    await server.stop()
    relay.cache.destroyAll()
    proc.exit(0)
  }
  proc.once('SIGTERM', shutdown)
  proc.once('SIGINT', shutdown)

  // Kept from the original relay: a stray error (e.g. inside a discord.js timer) is logged rather
  // than taking down every in-flight relay request with it.
  proc.on('uncaughtException', (err) => {
    console.error('Uncaught exception', err)
  })

  return { relay, server, shutdown }
}
