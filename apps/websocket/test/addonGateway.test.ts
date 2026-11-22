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

function fixture(options: { timeoutMs?: number } = {}) {
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
  })

  it('bounds and authenticates optional console messages and ignores unknown commands', async () => {
    const f = fixture()
    f.connection.ready()
    await f.connection.receive(JSON.stringify({ action: 'console_live_exporter', data: { data: 'server ready' } }))
    expect(f.onConsole).toHaveBeenCalledExactlyOnceWith('server ready')
    await f.connection.receive(JSON.stringify({ action: 'console_live_exporter', data: { data: 'x'.repeat(32_769) } }))
    await f.connection.receive(JSON.stringify({ action: 'execute-anything' }))
    expect(f.onConsole).toHaveBeenCalledOnce()
    expect(f.dispatch).not.toHaveBeenCalled()
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
})
