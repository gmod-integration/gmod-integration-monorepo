import { render } from '@solidjs/testing-library'
import { MemoryRouter, Route, createMemoryHistory, type MemoryHistory } from '@solidjs/router'
import { AccessProvider, type DashboardAccessSnapshot } from '../src/components/AccessProvider.js'
import type { JSX } from 'solid-js'
import { I18nProvider } from '../src/i18n.js'

/** A MemoryHistory seeded to start at `initialPath` instead of the router's default `/`. */
export function historyAt(initialPath: string): MemoryHistory {
  const history = createMemoryHistory()
  history.set({ value: initialPath, replace: true })
  return history
}

/**
 * Renders a component inside the same MemoryRouter + I18nProvider context the real app provides
 * via App.tsx, so components using `<A>`, `useNavigate()`, `useParams()`, or `useI18n()` work
 * without throwing. `path` is the Route pattern to match (matters for components reading
 * `useParams()`, e.g. `:guildID`/`:serverID`); `history` (see `historyAt`) controls the actual
 * starting URL, which defaults to `/` otherwise.
 */
export function renderWithProviders(ui: () => JSX.Element, options: { path?: string; history?: MemoryHistory } = {}) {
  const path = options.path ?? '/'
  // Explicit fixture override: production AccessProvider always loads the API snapshot.
  const stored = JSON.parse(window.localStorage.getItem('guilds') || '{}')
  const access: DashboardAccessSnapshot = {
    guildID: stored.id || '',
    premium: stored.isPremium === true,
    customBot: stored.customBot === true,
    state: 'ready',
    sources: [],
    revision: 'test',
    validUntil: '2099-01-01T00:00:00.000Z',
    usages: {},
  }
  return render(() => (
    <MemoryRouter
      history={options.history}
      root={(props) => (
        <I18nProvider>
          <AccessProvider snapshot={access}>{props.children}</AccessProvider>
        </I18nProvider>
      )}
    >
      <Route path={path} component={ui} />
    </MemoryRouter>
  ))
}
