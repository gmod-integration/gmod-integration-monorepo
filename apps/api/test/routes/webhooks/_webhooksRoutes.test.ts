import { describe, expect, it, vi } from 'vitest'

vi.mock('@/middleware/webhooks/gmodStoreValidator.js', () => ({ default: vi.fn() }))
vi.mock('@/controllers/webhooks/gmodstoreControllers.js', () => ({ default: vi.fn() }))

const { default: router } = await import('../../../src/routes/webhooks/_webhooksRoutes.js')

describe('_webhooksRoutes', () => {
  it('mounts a middleware layer for the gmod-store sub-router', () => {
    expect(router.stack.length).toBeGreaterThan(0)
    expect(router.stack.some((layer: any) => layer.name === 'router')).toBe(true)
  })
})
