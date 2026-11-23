import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, within } from '@solidjs/testing-library'
import { lazy, type Component } from 'solid-js'
import { historyAt, renderWithProviders } from '../testUtils.js'
import { App } from '../../src/app/App.js'
import { setDiscordUser, setIsAdmin, setIsLogged, normalizeDiscordUserPayload } from '../../src/utils/event.js'
import { updateNotificationCount } from '../../src/utils/notificationStore.js'
import { useI18n } from '../../src/i18n.js'
import { resetAuthentication, setAuthStatus } from '../../src/utils/authClient.js'
import { sessionFixture } from '../authFixture.js'

// AuthProvider validates the session and controls live transport for the application shell.
// These tests keep that boundary mocked while exercising route and loading composition.
vi.mock('../../src/utils/websocket.js', () => ({
  initWebSocket: vi.fn(),
  stopWebSocket: vi.fn(),
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
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })))
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
    const content = screen.getByTestId('page-content')
    expect(content).toBeInTheDocument()
    const main = screen.getByRole('main')
    expect(main).toContainElement(content)
    expect(main).toHaveAttribute('id', 'main-content')
    expect(main).toHaveAttribute('tabindex', '-1')
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main-content')
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
    expect(screen.getByTestId('child-translation')).toHaveTextContent('Sign in with Discord')
  })

  it('keeps dashboard chrome compact while retaining account preferences and the main landmark', () => {
    renderWithProviders(
      () => (
        <App>
          <div>Dashboard content</div>
        </App>
      ),
      {
        path: '*',
        history: historyAt('/dashboard/guilds'),
      },
    )
    expect(screen.getByRole('link', { name: 'Gmod Integration' })).toBeInTheDocument()
    const navigation = screen.getByRole('navigation', { name: 'Main navigation' })
    for (const [name, href] of [
      ['Documentation', '/docs'],
      ['Invite the bot', '/invite'],
      ['Premium', '/premium'],
    ]) {
      expect(within(navigation).getByRole('link', { name })).toHaveAttribute('href', href)
    }
    expect(screen.queryByText('Services')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Language' })).toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveTextContent('Dashboard content')
  })

  it('keeps navigation available and announces a pending page in the selected language', async () => {
    window.localStorage.setItem('locale', 'fr')
    let resolvePage!: (module: { default: Component }) => void
    const pageModule = new Promise<{ default: Component }>((resolve) => {
      resolvePage = resolve
    })
    const PendingPage = lazy(() => pageModule)
    renderWithProviders(() => (
      <App>
        <PendingPage />
      </App>
    ))

    expect(screen.getByRole('status')).toHaveTextContent('Chargement…')
    expect(screen.getByRole('link', { name: 'Gmod Integration' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('main')).toContainElement(screen.getByRole('status'))

    resolvePage({ default: () => <h1>Page ready</h1> })
    await vi.waitFor(() => expect(screen.getByRole('heading', { name: 'Page ready' })).toBeInTheDocument())
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
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
  it.each(['/account', '/profile', '/players/76500000000000001'])(
    'waits for authoritative identity before mounting protected content at %s and retains site navigation',
    async (path) => {
      resetAuthentication()
      setAuthStatus('checking')
      let finish!: (response: Response) => void
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((url: string) =>
          url.endsWith('/auth/session')
            ? new Promise<Response>((resolve) => {
                finish = resolve
              })
            : Promise.resolve(new Response('0')),
        ),
      )
      renderWithProviders(
        () => (
          <App>
            <h1>Private account editor</h1>
          </App>
        ),
        {
          path: '*',
          history: historyAt(path),
          session: false,
        },
      )
      expect(screen.queryByRole('heading', { name: 'Private account editor' })).not.toBeInTheDocument()
      expect(screen.getByRole('main')).toHaveTextContent('Loading…')
      expect(screen.getByRole('link', { name: 'Gmod Integration' })).toBeInTheDocument()
      finish(new Response(JSON.stringify(sessionFixture())))
      await vi.waitFor(() =>
        expect(screen.getByRole('heading', { name: 'Private account editor' })).toBeInTheDocument(),
      )
    },
  )
})
