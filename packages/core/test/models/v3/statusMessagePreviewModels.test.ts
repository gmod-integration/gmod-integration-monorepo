import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Server } from '@gmod/domain-server/Server.js'

const enqueue = vi.fn()
const isTimeout = vi.fn()
vi.mock('@gmod/infra-bullmq/discordQueueAdapters.js', () => ({
  enqueueDiscordServerStatusPreview: enqueue,
  isBullMQReplyTimeoutError: isTimeout,
}))
const { processPreviewServerStatus } = await import('../../../src/models/v3/statusMessagePreviewModels.js')
const isPremium = vi.fn()
const server = { id: 'server-1', isPremium } as unknown as Server

beforeEach(() => {
  enqueue.mockReset()
  isTimeout.mockReset().mockReturnValue(false)
  isPremium.mockReset().mockResolvedValue(false)
})

describe('status message draft preview', () => {
  it('rejects invalid fields, oversized drafts and embedded server overrides before invoking the worker', async () => {
    for (const input of [
      { settings: { show_status_chart: 'true' } },
      { serverID: 'another-server' },
      { settings: { unknown: true } },
      { settings: { status_player_list_format: 'x'.repeat(501) } },
      { buttons: Array.from({ length: 26 }, () => ({ name: 'Example', emoji: '📘', url: '', enable: false })) },
    ]) {
      expect((await processPreviewServerStatus(server, input)).status).toBe(400)
    }
    expect(enqueue).not.toHaveBeenCalled()
    expect(isPremium).not.toHaveBeenCalled()
  })

  it('uses stored settings for an empty draft and only forwards explicitly supplied overrides', async () => {
    const preview = { embeds: [], buttonRows: [] }
    enqueue.mockResolvedValue(preview)
    expect(await processPreviewServerStatus(server, {})).toEqual({ status: 200, body: preview })
    expect(enqueue).toHaveBeenCalledWith('server-1', { settings: {} }, 15000)
    const draft = {
      locale: 'en',
      settings: { show_player_list_status: false, status_player_list_format: '{name} {name}' },
      buttons: [],
    }
    await processPreviewServerStatus(server, draft)
    expect(enqueue).toHaveBeenLastCalledWith('server-1', draft, 15000)
    expect(isPremium).not.toHaveBeenCalled()
  })

  it('checks premium before rendering an explicitly requested chart', async () => {
    expect((await processPreviewServerStatus(server, { settings: { show_status_chart: true } })).status).toBe(403)
    expect(enqueue).not.toHaveBeenCalled()
    isPremium.mockResolvedValue(true)
    enqueue.mockResolvedValue({ embeds: [] })
    expect((await processPreviewServerStatus(server, { settings: { show_status_chart: true } })).status).toBe(200)
  })

  it('reports worker unavailability and invalid rendering without publishing the draft', async () => {
    enqueue.mockRejectedValueOnce(new Error('timeout'))
    isTimeout.mockReturnValueOnce(true)
    expect((await processPreviewServerStatus(server, {})).status).toBe(503)
    enqueue.mockRejectedValueOnce(new Error('Button label is invalid'))
    expect(await processPreviewServerStatus(server, {})).toEqual({
      status: 400,
      body: { error: 'Button label is invalid' },
    })
    enqueue.mockRejectedValueOnce(null)
    expect(await processPreviewServerStatus(server, {})).toEqual({
      status: 400,
      body: { error: 'Unable to render the status preview.' },
    })
  })
})
