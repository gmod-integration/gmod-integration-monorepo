import { describe, expect, it, vi } from 'vitest'

vi.mock('@/controllers/v3/clientsControllers.js', () => ({ reportBugs: vi.fn(), uploadScreenshot: vi.fn() }))
vi.mock('@/controllers/gmod/GmodErrorsControllers.js', () => ({ reportError: vi.fn() }))
vi.mock('@/middleware/v3/clientValidator.js', () => ({ default: vi.fn() }))

const { default: router } = await import('../../../src/routes/v3/clientsRoutes.js')

describe('clientsRoutes', () => {
  it('registers the screenshots/errors/bugs routes', () => {
    const paths = router.stack.map((layer: any) => layer.route?.path).filter(Boolean)
    expect(paths).toContain('/:clientID64/servers/:serverID/screenshots')
    expect(paths).toContain('/:clientID64/servers/:serverID/errors')
    expect(paths).toContain('/:clientID64/servers/:serverID/bugs')
  })
})
