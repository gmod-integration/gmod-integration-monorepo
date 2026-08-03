import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@solidjs/testing-library'
import { historyAt, renderWithProviders } from '../testUtils.js'
import { App } from '../../src/app/App.js'
import { setDiscordUser, setIsAdmin, setIsLogged, normalizeDiscordUserPayload } from '../../src/utils/event.js'
import { updateNotificationCount } from '../../src/utils/notificationStore.js'
import { useI18n } from '../../src/i18n.js'

// App.tsx composes RedirectMiddleware + Header + Footer around its children - Header's own
// onMount fires a handful of fetch/websocket calls regardless of which page is mounted under App,
// so these need the same baseline mocking as Header.test.tsx even though this file isn't testing
// Header's behavior itself.
vi.mock('../../src/utils/websocket.js', () => ({
  initWebSocket: vi.fn(),
}))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

beforeEach(() => {
  window.localStorage.clear()
  setIsLogged(false)
  setDiscordUser(normalizeDiscordUserPayload({}))
  setIsAdmin(false)
  updateNotificationCount(0)
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
  )
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

describe('app/App.tsx', () => {
  it('renders the Header, the children in between, and the Footer', () => {
    renderWithProviders(() => (
      <App>
        <div data-testid="page-content">Page content</div>
      </App>
    ))

    // Header content (the nav-bar brand link specifically; SecondFooter repeats the brand name).
    expect(screen.getByRole('link', { name: 'Gmod Integration' })).toHaveAttribute('href', '/')
    // children, wrapped in the grow/shrink layout div.
    const content = screen.getByTestId('page-content')
    expect(content).toBeInTheDocument()
    expect(content.closest('div.grow.shrink-0.flex-auto.flex.flex-col')).not.toBeNull()
    // Footer content (FirstFooter renders this footer category title).
    expect(screen.getByText('Services')).toBeInTheDocument()
  })

  it('provides I18nProvider context to children (useI18n does not throw)', () => {
    function Child() {
      const { t } = useI18n()
      return <div data-testid="child-translation">{t('header.login', 'Login with Discord')}</div>
    }
    expect(() =>
      renderWithProviders(() => (
        <App>
          <Child />
        </App>
      )),
    ).not.toThrow()
    expect(screen.getByTestId('child-translation')).toHaveTextContent('Login with Discord')
  })

  it('runs RedirectMiddleware: /dashboard redirects to /dashboard/guilds', async () => {
    const history = historyAt('/dashboard')
    renderWithProviders(
      () => (
        <App>
          <div>content</div>
        </App>
      ),
      { path: '*', history },
    )
    await vi.waitFor(() => expect(history.get()).toBe('/dashboard/guilds'))
  })
})
