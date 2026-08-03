import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@solidjs/testing-library'
import { historyAt, renderWithProviders } from '../../../../../testUtils.js'
import { okJson } from '../testHelpers.js'

vi.mock('../../../../../../src/utils/api.js', () => ({
  fetchAPI: vi.fn((endpoint: string) => {
    if (endpoint.includes('/screenshots?')) return Promise.resolve(okJson({ screenshots: [], query: { total: 0 } }))
    return Promise.resolve(okJson([]))
  }),
  getAPIUrl: vi.fn(),
  getUrlWithActualParams: vi.fn((s: string) => s),
}))

// Same happy-dom layout-instrumentation workaround as ServerScreenshotList.test.tsx: without it,
// its own IntersectionObserver/rAF-driven "load more" loop runs away since happy-dom reports the
// sentinel as always near the viewport.
class InertIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('IntersectionObserver', InertIntersectionObserver)
vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
  () => ({ top: 999999, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON() {} }) as DOMRect,
)

const { default: ServerScreenshots } = await import(
  '../../../../../../src/pages/dashboard/guilds/servers/screenshots/ServerScreenshots.js'
)

afterEach(() => cleanup())

function renderPage() {
  return renderWithProviders(() => <ServerScreenshots />, {
    path: '/dashboard/guilds/:guildID/config/servers/:serverID/screenshots',
    history: historyAt('/dashboard/guilds/g1/config/servers/s1/screenshots'),
  })
}

describe('pages/dashboard/guilds/servers/screenshots/ServerScreenshots.tsx', () => {
  it('renders both the parameters panel and the screenshot list together', async () => {
    renderPage()
    await vi.waitFor(() => expect(screen.getByText('Select Channel')).toBeInTheDocument())
    await vi.waitFor(() => expect(screen.getByText('End of List')).toBeInTheDocument())
  })
})
