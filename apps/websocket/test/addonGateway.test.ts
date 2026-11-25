import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Server } from '@gmod/domain-server/Server.js'
import { ADDON_MAX_FRAME_BYTES, createAddonGateway } from '../src/addonGateway.js'

vi.mock('@gmod/core/models/gmod/addonTransport.js', async () => {
  const schema = await import('../../../packages/schema/src/gmod/AddonTransportSchema.js')
  return { ...schema, handleAddonRequest: vi.fn() }
})

const connections: ReturnType<typeof createAddonGateway>[] = []
afterEach(() => {
  for (const connection of connections.splice(0)) connection.close()
  vi.useRealTimers()
})

function fixture(options: Partial<Parameters<typeof createAddonGateway>[0]> = {}) {
  const server = { getID: () => 's1' } as unknown as Server
  const socket = { readyState: 1, send: vi.fn(), close: vi.fn(), bufferedAmount: 0 }
  const authenticate = vi.fn().mockResolvedValue(server)
  const dispatch = vi.fn().mockResolvedValue({ status: 200, body: { success: true } })
  const onActivity = vi.fn().mockResolvedValue(undefined)
  const onConsole = vi.fn().mockResolvedValue(undefined)
  const onCommandResult = vi.fn().mockResolvedValue(undefined)
  const connection = createAddonGateway({
    socket,
    serverID: 's1',
    authenticate,
    dispatch,
    onActivity,
    onConsole,
    onCommandResult,
    ...options,
  })
  connections.push(connection)
  const request = (id = 'r1', changes = {}) =>
    JSON.stringify({ action: 'addon.request', id, method: 'GET', endpoint: '/servers/s1', ...changes })
  const packets = () => socket.send.mock.calls.map(([data]) => JSON.parse(data))
  return {
    server,
    socket,
    authenticate,
    dispatch,
    onActivity,
    onConsole,
    onCommandResult,
    connection,
    request,
    packets,
  }
}

describe('addon WebSocket gateway', () => {
  it('gates requests on readiness and returns correlated results without HTTP', async () => {
    const f = fixture()
    await f.connection.receive(f.request())
    expect(f.dispatch).not.toHaveBeenCalled()
    expect(f.packets().at(-1)).toMatchObject({ id: 'r1', status: 503 })
    f.connection.ready()
    expect(f.packets().at(-1)).toEqual({ action: 'addon.ready', protocol: 1 })
    await f.connection.receive(f.request())
    expect(f.dispatch).toHaveBeenCalledExactlyOnceWith(f.server, JSON.parse(f.request()))
    expect(f.onActivity).toHaveBeenCalledOnce()
    expect(f.onActivity).toHaveBeenCalledWith({ protocol: 'acknowledged', countRequest: true })
    expect(f.packets().at(-1)).toEqual({ action: 'addon.response', id: 'r1', status: 200, body: { success: true } })
  })

  it.each([
    ['malformed', '{bad', false, 1007],
    ['non-object', '[]', false, 1007],
    ['binary', '{}', true, 1003],
    ['oversized', 'x'.repeat(ADDON_MAX_FRAME_BYTES + 1), false, 1009],
  ])('rejects %s input before dispatch', async (_, raw, binary, code) => {
    const f = fixture()
    f.connection.ready()
    await f.connection.receive(raw as string, binary as boolean)
    expect(f.socket.close).toHaveBeenCalledWith(code, expect.any(String))
    await f.connection.receive(f.request('after-close'))
    expect(f.dispatch).not.toHaveBeenCalled()
    expect(f.onActivity).not.toHaveBeenCalled()
  })

  it.each([
    { method: 'DELETE' },
    { endpoint: 'https://other.test/' },
    { extra: 'unrecognized' },
    { body: { secret: true } },
  ])('rejects an invalid envelope %j', async (changes) => {
    const f = fixture()
    f.connection.ready()
    await f.connection.receive(f.request('invalid', changes))
    expect(f.packets().at(-1)).toMatchObject({ id: 'invalid', status: 400 })
    expect(f.dispatch).not.toHaveBeenCalled()
  })

  it('revalidates credentials and closes a revoked connection before effects or cached responses', async () => {
    const f = fixture()
    f.connection.ready()
    await f.connection.receive(f.request())
    f.authenticate.mockResolvedValueOnce(undefined)
    await f.connection.receive(f.request())
    expect(f.dispatch).toHaveBeenCalledOnce()
    expect(f.socket.close).toHaveBeenCalledWith(1008, 'Server credentials revoked')
  })

  it('coalesces an in-flight duplicate and rejects ID reuse with a different request', async () => {
    const f = fixture()
    let complete!: (value: unknown) => void
    f.dispatch.mockImplementationOnce(() => new Promise((resolve) => (complete = resolve)))
    f.connection.ready()
    const first = f.connection.receive(f.request())
    await vi.waitFor(() => expect(f.dispatch).toHaveBeenCalledOnce())
    const duplicate = f.connection.receive(f.request())
    complete({ status: 200, body: { accepted: true } })
    await Promise.all([first, duplicate])
    expect(f.dispatch).toHaveBeenCalledOnce()
    expect(f.packets().filter((packet) => packet.id === 'r1')).toHaveLength(2)
    await f.connection.receive(f.request('r1', { endpoint: '/servers/s1/config' }))
    expect(f.packets().at(-1)).toMatchObject({ status: 409, body: { error: 'request_id_reused' } })
  })

  it('bounds concurrent work and does not re-dispatch a timed-out operation', async () => {
    vi.useFakeTimers()
    const f = fixture({ timeoutMs: 50 })
    const completions: (() => void)[] = []
    f.dispatch.mockImplementation(
      () => new Promise((resolve) => completions.push(() => resolve({ status: 200, body: {} }))),
    )
    f.connection.ready()
    const accepted = Array.from({ length: 4 }, (_, index) => f.connection.receive(f.request(`r${index}`)))
    await vi.advanceTimersByTimeAsync(0)
    expect(f.dispatch).toHaveBeenCalledTimes(4)
    await f.connection.receive(f.request('over-limit'))
    expect(f.packets().at(-1)).toMatchObject({ status: 429 })
    await vi.advanceTimersByTimeAsync(50)
    await Promise.all(accepted)
    expect(f.packets().filter((packet) => packet.status === 504)).toHaveLength(4)
    await f.connection.receive(f.request('r0'))
    expect(f.packets().at(-1)).toMatchObject({ id: 'r0', status: 504 })
    expect(f.dispatch).toHaveBeenCalledTimes(4)
    completions.forEach((complete) => complete())
    await vi.advanceTimersByTimeAsync(0)
  })

  it('releases waits and suppresses late replies after a disconnect', async () => {
    const f = fixture()
    let complete!: (value: unknown) => void
    f.dispatch.mockImplementationOnce(() => new Promise((resolve) => (complete = resolve)))
    f.connection.ready()
    const pending = f.connection.receive(f.request())
    await vi.waitFor(() => expect(f.dispatch).toHaveBeenCalledOnce())
    f.connection.close()
    await pending
    complete({ status: 200, body: {} })
    expect(f.packets()).toEqual([{ action: 'addon.ready', protocol: 1 }])
  })

  it('uses the same dispatcher for narrowly supported legacy config packets', async () => {
    const f = fixture()
    f.connection.ready()
    await f.connection.receive(
      JSON.stringify({
        method: 'config_save',
        data: {
          data: { maintenance: true, id: 's1', token: 'private', apiFQDN: 'api.example.test', upgradeSyncConfig: true },
        },
      }),
    )
    expect(f.dispatch).toHaveBeenCalledWith(
      f.server,
      expect.objectContaining({
        action: 'addon.request',
        method: 'POST',
        endpoint: '/servers/s1/config',
        body: { maintenance: true },
      }),
    )
    expect(f.onActivity).toHaveBeenCalledExactlyOnceWith({ protocol: 'legacy', countRequest: true })
  })

  it('bounds and authenticates optional console messages and ignores unknown commands', async () => {
    const f = fixture()
    f.connection.ready()
    await f.connection.receive(JSON.stringify({ action: 'console_live_exporter', data: { data: 'server ready' } }))
    expect(f.onConsole).toHaveBeenCalledExactlyOnceWith('server ready')
    expect(f.onActivity).toHaveBeenCalledExactlyOnceWith({ countRequest: false })
    await f.connection.receive(JSON.stringify({ action: 'console_live_exporter', data: { data: 'x'.repeat(32_769) } }))
    await f.connection.receive(JSON.stringify({ action: 'execute-anything' }))
    expect(f.onConsole).toHaveBeenCalledOnce()
    expect(f.dispatch).not.toHaveBeenCalled()
  })

  it('preserves console wire order before asynchronous credential checks', async () => {
    const f = fixture()
    f.connection.ready()
    let resume!: (server: Server) => void
    let started!: () => void
    const pending = new Promise<void>((resolve) => (started = resolve))
    f.authenticate.mockImplementationOnce(() => {
      started()
      return new Promise((resolve) => (resume = resolve))
    })
    const message = (text: string) => JSON.stringify({ action: 'console_live_exporter', data: { data: text } })
    const first = f.connection.receive(message('first'))
    await pending
    const second = f.connection.receive(message('second'))
    expect(f.authenticate).toHaveBeenCalledOnce()
    resume(f.server)
    await Promise.all([first, second])
    expect(f.onConsole.mock.calls.map(([text]) => text)).toEqual(['first', 'second'])
  })

  it.each([
    [8192, 20, 8],
    [1, 80, 64],
  ])('bounds pending console bytes/chunks: size=%s', async (size, count, accepted) => {
    const f = fixture()
    f.connection.ready()
    let resume!: (server: Server) => void
    let started!: () => void
    const pending = new Promise<void>((resolve) => (started = resolve))
    f.authenticate.mockImplementationOnce(() => {
      started()
      return new Promise((resolve) => (resume = resolve))
    })
    const messages = Array.from({ length: count }, () =>
      f.connection.receive(JSON.stringify({ action: 'console_live_exporter', data: { data: 'x'.repeat(size) } })),
    )
    await pending
    resume(f.server)
    await Promise.all(messages)
    expect(f.onConsole).toHaveBeenCalledTimes(accepted)
  })

  it('closes a flooding peer and does not leak internal failures in replies', async () => {
    const f = fixture()
    f.connection.ready()
    f.dispatch.mockRejectedValueOnce(new Error('private credentials and storage error'))
    await f.connection.receive(f.request())
    expect(f.packets().at(-1)).toMatchObject({ status: 500, body: { error: 'request_failed' } })
    for (let index = 0; index < 601; index++) await f.connection.receive('{}')
    expect(f.socket.close).toHaveBeenCalledWith(1008, 'Addon request rate exceeded')
    expect(f.socket.send.mock.calls.flat().join('')).not.toContain('private credentials')
  })

  it.each(['', 'bad/id', 'x'.repeat(97), null])('closes a request with an unusable correlation ID %j', async (id) => {
    const f = fixture()
    f.connection.ready()
    await f.connection.receive(f.request('unused', { id }))
    expect(f.socket.close).toHaveBeenCalledExactlyOnceWith(1008, 'Invalid addon request ID')
    expect(f.authenticate).not.toHaveBeenCalled()
    expect(f.dispatch).not.toHaveBeenCalled()
  })

  it('does not read requests or announce readiness after the transport has closed', async () => {
    const f = fixture()
    f.socket.readyState = 3
    await f.connection.receive(f.request())
    f.connection.ready()
    expect(f.socket.send).not.toHaveBeenCalled()
    f.connection.close()
    f.connection.ready()
    expect(f.socket.send).not.toHaveBeenCalled()
    expect(f.authenticate).not.toHaveBeenCalled()
  })

  it('contains a transport write failure without repeating an accepted mutation', async () => {
    const f = fixture()
    f.socket.send.mockImplementation(() => {
      throw new Error('transport closed')
    })
    f.connection.ready()
    await f.connection.receive(f.request())
    await f.connection.receive(f.request())
    expect(f.dispatch).toHaveBeenCalledOnce()
    expect(f.onActivity).toHaveBeenCalledOnce()
    expect(f.socket.close).not.toHaveBeenCalled()
  })

  it.each(['response', 'backpressure'] as const)('closes an over-budget %s instead of sending it', async (kind) => {
    const f = fixture()
    f.connection.ready()
    f.socket.send.mockClear()
    if (kind === 'response') f.dispatch.mockResolvedValueOnce({ status: 200, body: 'x'.repeat(ADDON_MAX_FRAME_BYTES) })
    else f.socket.bufferedAmount = 24 * 1024 * 1024 + 1
    await f.connection.receive(f.request())
    expect(f.socket.close).toHaveBeenCalledExactlyOnceWith(1009, 'Response too large')
    expect(f.socket.send).not.toHaveBeenCalled()
  })

  it('starts a fresh rate window after ten seconds', async () => {
    let now = 0
    const f = fixture({ now: () => now })
    f.connection.ready()
    for (let index = 0; index < 400; index++) await f.connection.receive('{}')
    now = 10_000
    for (let index = 0; index < 400; index++) await f.connection.receive('{}')
    expect(f.socket.close).not.toHaveBeenCalled()
    for (let index = 0; index < 201; index++) await f.connection.receive('{}')
    expect(f.socket.close).toHaveBeenCalledWith(1008, 'Addon request rate exceeded')
  })

  it('revalidates the authenticated server identity and contains unavailable authentication', async () => {
    const f = fixture()
    f.connection.ready()
    f.authenticate.mockRejectedValueOnce(new Error('private store outage'))
    await f.connection.receive(f.request('unavailable'))
    expect(f.packets().at(-1)).toMatchObject({ status: 503, body: { error: 'service_unavailable' } })
    f.authenticate.mockResolvedValueOnce({ getID: () => 'another-server' })
    await f.connection.receive(f.request('wrong-server'))
    expect(f.socket.close).toHaveBeenCalledWith(1008, 'Server credentials revoked')
    expect(f.dispatch).not.toHaveBeenCalled()
    expect(JSON.stringify(f.packets())).not.toContain('private')
  })

  it.each(['burst', 'already-authenticating'] as const)('bounds a %s flood before feature dispatch', async (timing) => {
    const f = fixture()
    const completions: ((server: Server) => void)[] = []
    f.authenticate.mockImplementation(() => new Promise((resolve) => completions.push(resolve)))
    f.connection.ready()
    const pending = Array.from({ length: 4 }, (_, index) => f.connection.receive(f.request(`first-${index}`)))
    if (timing === 'already-authenticating') await vi.waitFor(() => expect(completions).toHaveLength(4))
    const rejected = f.connection.receive(f.request('over-auth-limit'))
    await vi.waitFor(() => expect(completions).toHaveLength(4))
    await rejected
    expect(f.packets().at(-1)).toMatchObject({ id: 'over-auth-limit', status: 429 })
    // Optional console traffic uses the same authentication bound without consuming another lookup.
    await f.connection.receive(JSON.stringify({ action: 'console_live_exporter', data: { data: 'busy' } }))
    expect(f.onConsole).not.toHaveBeenCalled()
    expect(f.authenticate).toHaveBeenCalledTimes(4)
    completions.forEach((finish) => finish(f.server))
    await Promise.all(pending)
    expect(f.dispatch).toHaveBeenCalledTimes(4)
  })

  it('does not dispatch if the connection closes while authentication is unresolved', async () => {
    const f = fixture()
    let complete!: (server: Server) => void
    f.authenticate.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve
        }),
    )
    f.connection.ready()
    const request = f.connection.receive(f.request())
    await vi.waitFor(() => expect(f.authenticate).toHaveBeenCalledOnce())
    f.connection.close()
    complete(f.server)
    await request
    expect(f.dispatch).not.toHaveBeenCalled()
    expect(f.packets()).toEqual([{ action: 'addon.ready', protocol: 1 }])
  })

  it('bounds aggregate bytes even when fewer than four feature calls are pending', async () => {
    const f = fixture()
    const completions: (() => void)[] = []
    f.dispatch.mockImplementation(
      () => new Promise((resolve) => completions.push(() => resolve({ status: 200, body: {} }))),
    )
    f.connection.ready()
    const large = { method: 'POST', body: { image: 'A'.repeat(ADDON_MAX_FRAME_BYTES - 1024) } }
    const first = f.connection.receive(f.request('large-1', large))
    const second = f.connection.receive(f.request('large-2', large))
    await vi.waitFor(() => expect(f.dispatch).toHaveBeenCalledTimes(2))
    await f.connection.receive(f.request('over-bytes', { method: 'POST', body: { image: 'A'.repeat(4096) } }))
    expect(f.packets().at(-1)).toMatchObject({ id: 'over-bytes', status: 429 })
    completions.forEach((finish) => finish())
    await Promise.all([first, second])
    f.dispatch.mockResolvedValueOnce({ status: 200, body: {} })
    await f.connection.receive(f.request('after-completion'))
    expect(f.packets().at(-1)).toMatchObject({ id: 'after-completion', status: 200 })
  })

  it('expires old correlations and evicts the oldest settled response at the cache bound', async () => {
    let now = 0
    const f = fixture({ now: () => now })
    f.connection.ready()
    for (let index = 0; index < 129; index++) await f.connection.receive(f.request(`cached-${index}`))
    await f.connection.receive(f.request('cached-1'))
    expect(f.dispatch).toHaveBeenCalledTimes(129)
    await f.connection.receive(f.request('cached-0'))
    expect(f.dispatch).toHaveBeenCalledTimes(130)
    now = 120_001
    await f.connection.receive(f.request('cached-0'))
    expect(f.dispatch).toHaveBeenCalledTimes(131)
    await f.connection.receive(f.request('new-window'))
    await f.connection.receive(f.request('cached-100'))
    expect(f.dispatch).toHaveBeenCalledTimes(133)
  })

  it('preserves a pending mutation while evicting settled correlations at the cache bound', async () => {
    const f = fixture()
    let complete!: (result: unknown) => void
    f.dispatch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve
        }),
    )
    f.connection.ready()
    const first = f.connection.receive(f.request('pending-mutation'))
    await vi.waitFor(() => expect(f.dispatch).toHaveBeenCalledOnce())
    for (let index = 0; index < 128; index++) await f.connection.receive(f.request(`settled-${index}`))
    const duplicate = f.connection.receive(f.request('pending-mutation'))
    complete({ status: 200, body: { accepted: true } })
    await Promise.all([first, duplicate])
    expect(f.dispatch).toHaveBeenCalledTimes(129)
    expect(f.packets().filter((packet) => packet.id === 'pending-mutation')).toHaveLength(2)
  })

  it('expires later entries before evicting an unexpired acknowledgement after a clock correction', async () => {
    let now = 120_000
    const f = fixture({ now: () => now })
    f.connection.ready()
    await f.connection.receive(f.request('still-cached'))
    now = 0
    for (let index = 0; index < 127; index++) await f.connection.receive(f.request(`clock-corrected-${index}`))
    now = 120_001
    await f.connection.receive(f.request('after-expiry'))
    await f.connection.receive(f.request('still-cached'))
    expect(f.dispatch).toHaveBeenCalledTimes(129)
  })

  it('rejects unavailable optional console delivery without leaking provider errors', async () => {
    const f = fixture()
    const consolePacket = JSON.stringify({ method: 'console_live_exporter', data: { data: 'message' } })
    await f.connection.receive(consolePacket)
    expect(f.authenticate).not.toHaveBeenCalled()
    f.connection.ready()
    f.onConsole.mockRejectedValueOnce(new Error('private provider failure'))
    await f.connection.receive(consolePacket)
    expect(f.socket.close).toHaveBeenCalledWith(1013, 'Server verification unavailable')
    expect(JSON.stringify(f.packets())).not.toContain('private')
    const withoutConsole = fixture({ onConsole: undefined })
    withoutConsole.connection.ready()
    await withoutConsole.connection.receive(consolePacket)
    expect(withoutConsole.authenticate).not.toHaveBeenCalled()
  })

  it('passes malformed legacy settings to the shared validator without converting them into an object', async () => {
    const f = fixture()
    f.connection.ready()
    await f.connection.receive(JSON.stringify({ action: 'save_config', config: [] }))
    expect(f.dispatch).toHaveBeenCalledWith(f.server, expect.objectContaining({ body: [] }))
  })
})

describe('addon command execution results', () => {
  const packet = {
    action: 'addon.command-result',
    id: '3a918b48-ff6f-4ed4-b2b9-f4b722840f04',
    method: 'wsAuthorizedRcon',
    ok: true,
    code: 'executed',
  }
  it('requires protocol readiness and authenticates before forwarding a command result', async () => {
    const f = fixture()
    await f.connection.receive(JSON.stringify(packet))
    expect(f.onCommandResult).not.toHaveBeenCalled()
    f.connection.ready()
    await f.connection.receive(JSON.stringify(packet))
    expect(f.authenticate).toHaveBeenCalledOnce()
    expect(f.onCommandResult).toHaveBeenCalledExactlyOnceWith(packet)
    expect(f.dispatch).not.toHaveBeenCalled()
  })
  it('rejects forged or malformed execution acknowledgements before the callback', async () => {
    const f = fixture()
    f.connection.ready()
    await f.connection.receive(JSON.stringify({ ...packet, ok: true, code: 'permission_denied' }))
    expect(f.onCommandResult).not.toHaveBeenCalled()
    f.authenticate.mockResolvedValueOnce(undefined)
    await f.connection.receive(JSON.stringify(packet))
    expect(f.onCommandResult).not.toHaveBeenCalled()
    expect(f.socket.close).toHaveBeenCalledWith(1008, 'Server credentials revoked')
  })
  it('fails closed if credentials or result persistence are unavailable', async () => {
    const f = fixture()
    f.connection.ready()
    f.onCommandResult.mockRejectedValueOnce(new Error('unavailable'))
    await f.connection.receive(JSON.stringify(packet))
    expect(f.socket.close).toHaveBeenCalledWith(1013, 'Server verification unavailable')
  })
  it('ignores command results if this connection has no result consumer', async () => {
    const f = fixture({ onCommandResult: undefined })
    f.connection.ready()
    await f.connection.receive(JSON.stringify(packet))
    expect(f.authenticate).not.toHaveBeenCalled()
  })
})
