import { once } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebSocket, WebSocketServer } from 'ws'
import type { Server } from '@gmod/domain-server/Server.js'
import { ADDON_MAX_FRAME_BYTES, createAddonGateway } from '../src/addonGateway.js'

vi.mock('@gmod/core/models/gmod/addonTransport.js', async () => {
  const schema = await import('../../../packages/schema/src/gmod/AddonTransportSchema.js')
  return { ...schema, handleAddonRequest: vi.fn() }
})

const cleanup: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close()
})

describe('addon protocol over a real loopback WebSocket', () => {
  it('authenticates, acknowledges once, rejects malformed frames and revokes a live token', async () => {
    let valid = true
    const dispatch = vi.fn().mockResolvedValue({ status: 200, body: { accepted: true } })
    const server = { getID: () => 's1' } as unknown as Server
    const wss = new WebSocketServer({
      host: '127.0.0.1',
      port: 0,
      maxPayload: ADDON_MAX_FRAME_BYTES,
      verifyClient: ({ req }) => req.headers.id === 's1' && req.headers.token === 'local-fixture',
    })
    cleanup.push(async () => {
      for (const socket of wss.clients) socket.terminate()
      await new Promise<void>((resolve) => wss.close(() => resolve()))
    })
    wss.on('connection', (socket) => {
      const gateway = createAddonGateway({
        socket,
        serverID: 's1',
        authenticate: async () => (valid ? server : undefined),
        dispatch,
      })
      socket.on('message', (data, binary) => void gateway.receive(data as Buffer, binary))
      socket.once('close', () => gateway.close())
      gateway.ready()
    })
    await once(wss, 'listening')
    const address = wss.address()
    if (!address || typeof address === 'string') throw new Error('Missing local address')
    const url = `ws://127.0.0.1:${address.port}`
    const connect = async () => {
      const socket = new WebSocket(url, { headers: { id: 's1', token: 'local-fixture' } })
      const packets: unknown[] = []
      socket.on('message', (data) => packets.push(JSON.parse(data.toString())))
      await once(socket, 'open')
      await vi.waitFor(() => expect(packets[0]).toEqual({ action: 'addon.ready', protocol: 1 }))
      return { socket, packets }
    }
    const first = await connect()
    const request = JSON.stringify({ action: 'addon.request', id: 'real-1', method: 'GET', endpoint: '/servers/s1' })
    first.socket.send(request)
    await vi.waitFor(() =>
      expect(first.packets[1]).toEqual({
        action: 'addon.response',
        id: 'real-1',
        status: 200,
        body: { accepted: true },
      }),
    )
    first.socket.send(request)
    await vi.waitFor(() => expect(first.packets).toHaveLength(3))
    expect(dispatch).toHaveBeenCalledOnce()
    const malformedClose = once(first.socket, 'close')
    first.socket.send('{bad')
    expect((await malformedClose)[0]).toBe(1007)

    const second = await connect()
    valid = false
    const revokedClose = once(second.socket, 'close')
    second.socket.send(request)
    expect((await revokedClose)[0]).toBe(1008)
    expect(dispatch).toHaveBeenCalledOnce()

    const denied = new WebSocket(url, { headers: { id: 's1', token: 'wrong' } })
    const error = once(denied, 'error')
    expect((await error)[0].message).toContain('401')
  })
})
