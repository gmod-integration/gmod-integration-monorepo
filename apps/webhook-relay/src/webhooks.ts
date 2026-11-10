import { WebhookClient } from 'discord.js'

/** The slice of discord.js's WebhookClient the relay uses (an interface so tests can fake it). */
export interface WebhookSender {
  send(options: Record<string, unknown>): Promise<unknown>
  destroy(): void
}

export type WebhookSenderFactory = (id: string, token: string) => WebhookSender

export const createDiscordWebhookSender: WebhookSenderFactory = (id, token) =>
  new WebhookClient({ id, token }) as unknown as WebhookSender

/**
 * Keeps one client per webhook so discord.js's per-route rate-limit state survives between
 * requests. Bounded and least-recently-used: every WebhookClient owns its own REST instance with
 * sweeper intervals, and the original relay cached them forever.
 */
export class WebhookClientCache {
  private readonly clients = new Map<string, WebhookSender>()

  constructor(
    private readonly factory: WebhookSenderFactory,
    private readonly maxSize = 2000,
  ) {}

  get(id: string, token: string): WebhookSender {
    const key = `${id}:${token}`
    const cached = this.clients.get(key)
    if (cached) {
      // Re-insert to mark it most recently used (Map keeps insertion order).
      this.clients.delete(key)
      this.clients.set(key, cached)
      return cached
    }

    const client = this.factory(id, token)
    this.clients.set(key, client)
    if (this.clients.size > this.maxSize) {
      const [oldestKey, oldest] = this.clients.entries().next().value as [string, WebhookSender]
      this.clients.delete(oldestKey)
      oldest.destroy()
    }
    return client
  }

  get size() {
    return this.clients.size
  }

  destroyAll() {
    for (const client of this.clients.values()) client.destroy()
    this.clients.clear()
  }
}

/**
 * Webhooks Discord reported as gone (deleted channel, regenerated token) get skipped for a while
 * instead of hitting Discord again on every message the API keeps sending for them.
 */
export class WebhookBlacklist {
  private readonly until = new Map<string, number>()

  constructor(
    private readonly ttlMs = 10 * 60 * 1000,
    private readonly now: () => number = Date.now,
  ) {}

  has(id: string, token: string): boolean {
    const key = `${id}:${token}`
    const expiresAt = this.until.get(key)
    if (expiresAt === undefined) return false
    if (this.now() < expiresAt) return true
    this.until.delete(key)
    return false
  }

  add(id: string, token: string) {
    const now = this.now()
    // Drop expired entries so webhooks that are never retried don't accumulate forever.
    for (const [key, expiresAt] of this.until) {
      if (expiresAt <= now) this.until.delete(key)
    }
    this.until.set(`${id}:${token}`, now + this.ttlMs)
  }

  get size() {
    return this.until.size
  }
}
