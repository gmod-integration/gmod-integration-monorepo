import { describe, expect, it } from 'vitest'
import {
  StatusMessagePreviewInputSchema,
  StatusMessagePreviewSchema,
} from '../../src/server/StatusMessagePreviewSchema.js'

describe('status message preview contract', () => {
  it('keeps absent overrides distinct from explicit disabled settings or an empty button list', () => {
    expect(StatusMessagePreviewInputSchema.parse({})).toEqual({ settings: {} })
    expect(StatusMessagePreviewInputSchema.parse({ simulation: true })).toEqual({ settings: {}, simulation: true })
    expect(StatusMessagePreviewInputSchema.safeParse({ simulation: 'true' }).success).toBe(false)
    const draft = {
      settings: { show_player_list_status: false, show_status_chart: false, status_player_list_format: '' },
      buttons: [],
    }
    expect(StatusMessagePreviewInputSchema.parse(draft)).toEqual(draft)
    expect(
      StatusMessagePreviewInputSchema.parse({ buttons: [{ name: '', emoji: '', url: '', enable: false }] }).buttons,
    ).toHaveLength(1)
  })

  it('rejects extra properties and excessive Discord payload sizes', () => {
    const button = { id: 1, name: 'Rules', emoji: '📘', url: 'https://example.test', enable: true }
    expect(
      StatusMessagePreviewInputSchema.parse({ buttons: Array.from({ length: 25 }, () => button) }).buttons,
    ).toHaveLength(25)
    for (const input of [
      { serverID: 'untrusted-server' },
      { settings: { isPremium: true } },
      { settings: { status_player_list_format: 'a'.repeat(501) } },
      { buttons: [{ ...button, id: -1 }] },
      { buttons: [{ ...button, name: 'a'.repeat(81) }] },
      { buttons: [{ ...button, url: 'a'.repeat(2049) }] },
      { buttons: Array.from({ length: 26 }, () => button) },
    ]) {
      expect(StatusMessagePreviewInputSchema.safeParse(input).success).toBe(false)
    }
  })

  it('validates serialized Discord content and only accepts embedded PNG chart images', () => {
    const response = {
      bot: { name: 'Bot', avatarUrl: null },
      online: false,
      embeds: [
        {
          title: 'Status',
          color: 0x393a41,
          fields: [{ name: 'State', value: 'Offline', inline: true }],
          timestamp: '2026-11-20T12:00:00.000Z',
          imageUrl: null,
        },
      ],
      buttonRows: [[{ label: 'Rules', emoji: '📘', url: 'https://example.test' }]],
    }
    expect(StatusMessagePreviewSchema.parse(response)).toEqual(response)
    const withImage = { ...response, embeds: [{ ...response.embeds[0], imageUrl: 'data:image/png;base64,aGVsbG8=' }] }
    expect(StatusMessagePreviewSchema.safeParse(withImage).success).toBe(true)
    for (const imageUrl of ['https://example.test/chart.png', 'javascript:alert(1)', 'data:image/svg+xml,<svg/>']) {
      expect(
        StatusMessagePreviewSchema.safeParse({ ...response, embeds: [{ ...response.embeds[0], imageUrl }] }).success,
      ).toBe(false)
    }
    expect(
      StatusMessagePreviewSchema.safeParse({
        ...response,
        buttonRows: Array.from({ length: 6 }, () => response.buttonRows[0]),
      }).success,
    ).toBe(false)
  })
})
