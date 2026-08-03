import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, screen } from '@solidjs/testing-library'
import { historyAt, renderWithProviders } from '../testUtils.js'
import { AppDashboard } from '../../src/app/AppDashboard.js'
import { setIsLogged } from '../../src/utils/event.js'
import { Errors } from '../../src/components/layout/Errors.js'

afterEach(() => cleanup())

beforeEach(() => {
  window.localStorage.clear()
  setIsLogged(true)
})

function renderAt(path: string, ui: () => any) {
  const history = historyAt(path)
  renderWithProviders(ui, { path: '*', history })
  return history
}

function Boom(): never {
  throw new Error('page crashed')
}

describe('app/AppDashboard.tsx', () => {
  it('renders DashboardMiddleware (no redirect on an already-resolved path), the DashboardMenu, and children', () => {
    window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1' }))
    const history = renderAt('/dashboard/guilds/g1/config', () => (
      <AppDashboard>
        <div data-testid="page">Guild config page</div>
      </AppDashboard>
    ))

    expect(history.get()).toBe('/dashboard/guilds/g1/config')
    expect(screen.getByText('Back')).toBeInTheDocument() // DashboardMenu
    expect(screen.getByTestId('page')).toBeInTheDocument()
  })

  it('displays a pre-existing global error via ShowErrorList', () => {
    // errorsList is a module-level signal outside any Solid root - populate it before mount (see
    // Errors.test.tsx for why updating it post-mount doesn't propagate in this test harness).
    Errors('boot failure', 100000)
    renderAt('/dashboard/guilds/g1/config', () => (
      <AppDashboard>
        <div>content</div>
      </AppDashboard>
    ))
    expect(
      screen.getByText((_, el) => el?.tagName === 'SPAN' && el.textContent === 'Error : boot failure'),
    ).toBeInTheDocument()
  })

  it("catches a throwing child in the ErrorBoundary and shows AddErrorComponent, without re-throwing from the fallback's own render", () => {
    expect(() =>
      renderAt('/dashboard/guilds/g1/config', () => (
        <AppDashboard>
          <Boom />
        </AppDashboard>
      )),
    ).not.toThrow()

    expect(
      screen.getByText((_, el) => el?.tagName === 'SPAN' && el.textContent === 'Error : page crashed'),
    ).toBeInTheDocument()
  })
})
