import { WebhookClient } from 'discord.js'
import { describe, expect, it, vi } from 'vitest'
import {
  createDiscordWebhookSender,
  WebhookBlacklist,
  WebhookClientCache,
  type WebhookSender,
} from '../src/webhooks.js'

function fakeFactory() {
  const created: Array<WebhookSender & { id: string }> = []
  const factory = vi.fn((id: string) => {
    const sender = { id, send: vi.fn(), destroy: vi.fn() }
    created.push(sender)
    return sender
  })
  return { factory, created }
}

describe('createDiscordWebhookSender', () => {
  it('builds a discord.js WebhookClient for the id/token pair', () => {
    const sender = createDiscordWebhookSender('123456789012345678', 'token')
    expect(sender).toBeInstanceOf(WebhookClient)
    expect((sender as unknown as WebhookClient).id).toBe('123456789012345678')
    sender.destroy()
  })
})

describe('WebhookClientCache', () => {
  it('reuses the client for the same id/token pair', () => {
    const { factory } = fakeFactory()
    const cache = new WebhookClientCache(factory)
    const first = cache.get('1', 'a')
    expect(cache.get('1', 'a')).toBe(first)
    expect(cache.get('1', 'b')).not.toBe(first)
    expect(factory).toHaveBeenCalledTimes(2)
    expect(cache.size).toBe(2)
  })

  it('evicts and destroys the least recently used client past its size limit', () => {
    const { factory, created } = fakeFactory()
    const cache = new WebhookClientCache(factory, 2)
    cache.get('1', 't')
    cache.get('2', 't')
    cache.get('1', 't') // 1 is now the most recently used, so 2 goes first
    cache.get('3', 't')

    expect(cache.size).toBe(2)
    expect(created.find((c) => c.id === '2')!.destroy).toHaveBeenCalledOnce()
    expect(created.find((c) => c.id === '1')!.destroy).not.toHaveBeenCalled()
    cache.get('2', 't')
    expect(factory).toHaveBeenCalledTimes(4)
  })

  it('destroys every client on destroyAll', () => {
    const { factory, created } = fakeFactory()
    const cache = new WebhookClientCache(factory)
    cache.get('1', 't')
    cache.get('2', 't')
    cache.destroyAll()
    expect(cache.size).toBe(0)
    for (const client of created) expect(client.destroy).toHaveBeenCalledOnce()
  })
})

describe('WebhookBlacklist', () => {
  it('blacklists an id/token pair until its TTL runs out', () => {
    let now = 1_000
    const blacklist = new WebhookBlacklist(500, () => now)
    expect(blacklist.has('1', 't')).toBe(false)

    blacklist.add('1', 't')
    expect(blacklist.has('1', 't')).toBe(true)
    expect(blacklist.has('1', 'other-token')).toBe(false)

    now = 1_499
    expect(blacklist.has('1', 't')).toBe(true)
    now = 1_500
    expect(blacklist.has('1', 't')).toBe(false)
    expect(blacklist.size).toBe(0)
  })

  it('drops expired entries that are never checked again', () => {
    let now = 0
    const blacklist = new WebhookBlacklist(100, () => now)
    blacklist.add('1', 't')
    now = 200
    blacklist.add('2', 't')
    expect(blacklist.size).toBe(1)
    expect(blacklist.has('2', 't')).toBe(true)

    now = 250
    blacklist.add('3', 't')
    expect(blacklist.size).toBe(2)
  })

  it('defaults to 10 minutes on the wall clock', () => {
    vi.useFakeTimers()
    try {
      const blacklist = new WebhookBlacklist()
      blacklist.add('1', 't')
      vi.advanceTimersByTime(10 * 60 * 1000 - 1)
      expect(blacklist.has('1', 't')).toBe(true)
      vi.advanceTimersByTime(1)
      expect(blacklist.has('1', 't')).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
})
