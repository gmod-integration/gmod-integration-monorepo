import { describe, expect, it, vi } from 'vitest'
import { getServerStatusChannel, putServerStatusChannel } from '../../../../src/controllers/v3/users/ServerStatusChannelControllers.js'

describe('ServerStatusChannelControllers', () => {
  it('getServerStatusChannel responds with the server status channel', async () => {
    const server = { getStatusChannel: vi.fn().mockResolvedValueOnce({ id: 1 }) }
    const json = vi.fn()

    await getServerStatusChannel({ server } as any, { json } as any)

    expect(json).toHaveBeenCalledWith({ id: 1 })
  })

  it('putServerStatusChannel updates and responds with the status channel', async () => {
    const server = { putStatusChannel: vi.fn().mockResolvedValueOnce({ id: 1, channelID: 'ch1' }) }
    const json = vi.fn()

    await putServerStatusChannel(
      { server, body: { channelID: 'ch1', format: '%s' } } as any,
      { json } as any,
    )

    expect(server.putStatusChannel).toHaveBeenCalledWith('ch1', '%s')
    expect(json).toHaveBeenCalledWith({ id: 1, channelID: 'ch1' })
  })
})
