import { describe, expect, it, vi } from 'vitest'

vi.mock('@/controllers/webhooks/gmodstoreControllers.js', () => ({ default: vi.fn() }))

const { default: router } = await import('../../../../src/routes/webhooks/gmodstore/_gmodStoreRoutes.js')

describe('_gmodStoreRoutes', () => {
  it('registers the POST / route', () => {
    expect(router.stack.some((layer: any) => layer.route?.path === '/')).toBe(true)
  })
})
