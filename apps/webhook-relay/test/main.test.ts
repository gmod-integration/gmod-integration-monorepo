import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bunServe, main, type ServeOptions } from '../src/main.js'

class FakeProcess extends EventEmitter {
  exit = vi.fn()
}

function fakeServe() {
  const stop = vi.fn().mockResolvedValue(undefined)
  const serve = vi.fn((_options: ServeOptions) => ({ stop }))
  return { serve, stop }
}

describe('bunServe', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('explains that the relay needs Bun when run on Node', () => {
    vi.stubGlobal('Bun', undefined)
    expect(() => bunServe({ port: 1, hostname: 'h', fetch: () => new Response() })).toThrow(/runs on Bun/)
  })

  it('delegates to Bun.serve', () => {
    const server = { stop: vi.fn() }
    const serve = vi.fn(() => server)
    vi.stubGlobal('Bun', { serve })
    const options = { port: 1, hostname: 'h', fetch: () => new Response() }
    expect(bunServe(options)).toBe(server)
    expect(serve).toHaveBeenCalledWith(options)
  })
})

describe('main', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('exits with code 1 when the configuration is invalid', async () => {
    const proc = new FakeProcess()
    const { serve } = fakeServe()
    const result = await main({ env: {}, serve, proc: proc as any })

    expect(result).toBeUndefined()
    expect(proc.exit).toHaveBeenCalledWith(1)
    expect(serve).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('BARER_TOKEN'))
  })

  it('serves the relay app on the configured host and port', async () => {
    const proc = new FakeProcess()
    const { serve } = fakeServe()
    await main({ env: { BARER_TOKEN: 't', APP_PORT: '4100', APP_HOST: '127.0.0.1' }, serve, proc: proc as any })

    const options = serve.mock.calls[0]![0]
    expect(options).toMatchObject({ port: 4100, hostname: '127.0.0.1' })
    const res = await options.fetch(new Request('http://relay.local/'))
    expect(await res.text()).toBe('Hello World')
    expect(console.log).toHaveBeenCalledWith('webhook-relay listening on 127.0.0.1:4100')
  })

  it('shuts down once on SIGTERM/SIGINT: stop the server, drop webhook clients, exit 0', async () => {
    const proc = new FakeProcess()
    const { serve, stop } = fakeServe()
    const result = await main({ env: { BARER_TOKEN: 't' }, serve, proc: proc as any })
    const destroyAll = vi.spyOn(result!.relay.cache, 'destroyAll')

    proc.emit('SIGTERM')
    await result!.shutdown()
    await vi.waitFor(() => expect(proc.exit).toHaveBeenCalledWith(0))

    expect(stop).toHaveBeenCalledOnce()
    expect(destroyAll).toHaveBeenCalledOnce()
    expect(proc.exit).toHaveBeenCalledOnce()
    expect(proc.listenerCount('SIGINT')).toBe(1)
  })

  it('logs uncaught exceptions instead of crashing', async () => {
    const proc = new FakeProcess()
    const { serve } = fakeServe()
    await main({ env: { BARER_TOKEN: 't' }, serve, proc: proc as any })

    const err = new Error('stray')
    proc.emit('uncaughtException', err)
    expect(console.error).toHaveBeenCalledWith('Uncaught exception', err)
  })

  it('defaults to process.env, Bun.serve and the real process', async () => {
    vi.stubEnv('BARER_TOKEN', 'from-env')
    const { serve } = fakeServe()
    vi.stubGlobal('Bun', { serve })
    const listenersBefore = process.listeners('uncaughtException')

    const result = await main()
    try {
      expect(serve).toHaveBeenCalledWith(expect.objectContaining({ port: 3000, hostname: '0.0.0.0' }))
      expect(process.listeners('SIGTERM')).toContain(result!.shutdown)
    } finally {
      process.removeListener('SIGTERM', result!.shutdown)
      process.removeListener('SIGINT', result!.shutdown)
      for (const listener of process.listeners('uncaughtException')) {
        if (!listenersBefore.includes(listener)) process.removeListener('uncaughtException', listener)
      }
    }
  })
})
