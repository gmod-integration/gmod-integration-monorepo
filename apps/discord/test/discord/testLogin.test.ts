import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const loginMock = vi.fn()
const destroyMock = vi.fn()
class FakeClient {
  options: any
  constructor(options: any) {
    this.options = options
  }
  login = loginMock
  destroy = destroyMock
}
vi.mock('discord.js', () => ({
  Client: FakeClient,
  GatewayIntentBits: new Proxy({}, { get: (_target, prop) => `intent:${String(prop)}` }),
  Partials: new Proxy({}, { get: (_target, prop) => `partial:${String(prop)}` }),
}))

describe('testLogin script', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>
  let errorSpy: ReturnType<typeof vi.spyOn>
  let messageHandler: (token: string) => Promise<void>

  beforeEach(async () => {
    vi.resetModules()
    loginMock.mockReset()
    destroyMock.mockReset()
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    // Spy on process.on instead of emitting a real 'message' event: this process is itself a
    // vitest worker fork that uses process 'message' events for its own IPC, so a real emit
    // would broadcast to vitest's internal listeners too and corrupt the test runner's IPC.
    const onSpy = vi.spyOn(process, 'on').mockImplementation(((event: string, listener: any) => {
      if (event === 'message') messageHandler = listener
      return process
    }) as any)
    await import('../../src/discord/testLogin.js')
    onSpy.mockRestore()
  })

  afterEach(() => {
    exitSpy.mockRestore()
    errorSpy.mockRestore()
  })

  it('logs in, destroys the client, and exits 0 on a successful login', async () => {
    loginMock.mockResolvedValueOnce(undefined)
    destroyMock.mockResolvedValueOnce(undefined)

    await messageHandler('a-token')

    expect(loginMock).toHaveBeenCalledWith('a-token')
    expect(destroyMock).toHaveBeenCalled()
    expect(exitSpy).toHaveBeenCalledWith(0)
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('logs the error and exits 1 when login rejects', async () => {
    const failure = new Error('bad token')
    loginMock.mockRejectedValueOnce(failure)

    await messageHandler('bad-token')

    expect(errorSpy).toHaveBeenCalledWith('Login failed:', failure)
    expect(exitSpy).toHaveBeenCalledWith(1)
    expect(destroyMock).not.toHaveBeenCalled()
  })
})
