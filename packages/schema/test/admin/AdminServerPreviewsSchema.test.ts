import { describe, expect, it } from 'vitest'
import { AdminPreviewQuerySchema, AdminServerPreviewsSchema } from '../../src/admin/AdminServerPreviewsSchema.js'

describe('administration screenshot preview contract', () => {
  it('bounds the requested locale without accepting arbitrary query parameters', () => {
    expect(AdminPreviewQuerySchema.parse({})).toEqual({ locale: 'en' })
    expect(AdminPreviewQuerySchema.parse({ locale: 'fr' })).toEqual({ locale: 'fr' })
    expect(AdminPreviewQuerySchema.safeParse({ locale: 'unknown' }).success).toBe(false)
    expect(AdminPreviewQuerySchema.safeParse({ locale: 'en', token: 'secret' }).success).toBe(false)
  })

  it('limits the preview to six safe projected screenshots', () => {
    const time = '2026-11-23T00:00:00.000Z'
    const screenshot = { id: 1, title: 'Example', url: 'https://images.example.com/preview.png', createdAt: time }
    const response = {
      server: { id: 's1', name: 'Server', guildID: 'g1' },
      screenshots: Array(6).fill(screenshot),
      generatedAt: time,
    }
    expect(AdminServerPreviewsSchema.safeParse(response).success).toBe(true)
    expect(AdminServerPreviewsSchema.safeParse({ ...response, screenshots: Array(7).fill(screenshot) }).success).toBe(
      false,
    )
    expect(
      AdminServerPreviewsSchema.safeParse({ ...response, server: { ...response.server, token: 'secret' } }).success,
    ).toBe(false)
    expect(AdminServerPreviewsSchema.safeParse({ ...response, screenshots: [{ ...screenshot, id: -1 }] }).success).toBe(
      false,
    )
  })
})
