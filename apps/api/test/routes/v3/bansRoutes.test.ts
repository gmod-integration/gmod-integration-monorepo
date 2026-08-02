import { describe, expect, it, vi } from 'vitest'

vi.mock('@/controllers/v3/bansControllers.js', () => ({ isGlobalBanSomewhere: vi.fn() }))

const { default: router } = await import('../../../src/routes/v3/bansRoutes.js')

describe('bansRoutes', () => {
  it('registers the GET / route', () => {
    expect(router.stack.some((layer: any) => layer.route?.path === '/')).toBe(true)
  })
})
