import { render } from '@solidjs/testing-library'
import { MemoryRouter, Route, createMemoryHistory, type MemoryHistory } from '@solidjs/router'
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
export function renderWithProviders(
  ui: () => JSX.Element,
  options: { path?: string; history?: MemoryHistory } = {},
) {
  const path = options.path ?? '/'
  return render(() => (
    <MemoryRouter
      history={options.history}
      root={(props) => <I18nProvider>{props.children}</I18nProvider>}
    >
      <Route path={path} component={ui} />
    </MemoryRouter>
  ))
}
