import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Server } from '@gmod/domain-server/Server.js'

const render = vi.hoisted(() => vi.fn())
vi.mock('../../../src/utils/statusMessagePreview.js', () => ({ renderStatusPreview: render }))
const enqueue = vi.hoisted(() => vi.fn())
vi.mock('@gmod/infra-bullmq/discordQueueAdapters.js', () => ({ enqueueDiscordServerStatusPreview: enqueue }))
const { processPreviewServerStatus } = await import('../../../src/models/v3/statusMessagePreviewModels.js')
const server = { id: 'server-1', guild: 'g1' } as Server
beforeEach(() => {
  render.mockReset()
  enqueue.mockReset()
})

describe('local status message draft preview', () => {
  it('rejects invalid fields and oversized drafts before rendering', async () => {
    for (const input of [
      { settings: { show_status_chart: 'true' } },
      { serverID: 'another-server' },
      { settings: { unknown: true } },
      { settings: { status_player_list_format: 'x'.repeat(501) } },
      { buttons: Array.from({ length: 26 }, () => ({ name: 'Example', emoji: '📘', url: '', enable: false })) },
    ])
      expect((await processPreviewServerStatus(server, input)).status).toBe(400)
    expect(render).not.toHaveBeenCalled()
    expect(enqueue).not.toHaveBeenCalled()
  })
  it('renders stored settings and drafts locally without requiring a Discord worker', async () => {
    const preview = { embeds: [], buttonRows: [] }
    render.mockResolvedValue(preview)
    expect(await processPreviewServerStatus(server, {})).toEqual({ status: 200, body: preview })
    expect(render).toHaveBeenCalledWith(server, { settings: {} })
    const draft = { locale: 'en', settings: { show_status_chart: true }, buttons: [] }
    await processPreviewServerStatus(server, draft)
    expect(render).toHaveBeenLastCalledWith(server, draft)
    expect(enqueue).not.toHaveBeenCalled()
    expect(draft.settings.show_status_chart).toBe(true)
  })
  it('returns render failures without saving or publishing', async () => {
    render.mockRejectedValueOnce(new Error('Button label is invalid'))
    expect(await processPreviewServerStatus(server, {})).toEqual({
      status: 400,
      body: { error: 'Button label is invalid' },
    })
    render.mockRejectedValueOnce(null)
    expect(await processPreviewServerStatus(server, {})).toEqual({
      status: 400,
      body: { error: 'Unable to render the status preview.' },
    })
    expect(enqueue).not.toHaveBeenCalled()
  })
})
