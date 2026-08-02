import { describe, expect, it, vi } from 'vitest'

vi.mock('@/controllers/v3/mainControllers.js', () => ({ getActualStats: vi.fn() }))

const { default: router } = await import('../../../src/routes/v3/mainRoutes.js')

describe('mainRoutes', () => {
  it('registers the GET /stats route', () => {
    expect(router.stack.some((layer: any) => layer.route?.path === '/stats')).toBe(true)
  })
})
