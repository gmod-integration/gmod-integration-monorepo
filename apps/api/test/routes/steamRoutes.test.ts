import { describe, expect, it, vi } from 'vitest'

vi.mock('@/controllers/v3/steamControllers.js', () => ({
  steamVerification: vi.fn(),
  steamVerificationReturn: vi.fn(),
}))

const { default: router } = await import('../../src/routes/steamRoutes.js')

describe('steamRoutes', () => {
  it('registers GET / and GET /return', () => {
    const paths = router.stack.map((layer: any) => layer.route?.path)
    expect(paths).toContain('/')
    expect(paths).toContain('/return')
  })
})
