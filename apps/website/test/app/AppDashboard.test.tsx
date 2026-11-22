import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@solidjs/testing-library'
import type { JSX } from 'solid-js'
import { historyAt, renderWithProviders } from '../testUtils.js'
import { AppDashboard } from '../../src/app/AppDashboard.js'
import { setIsLogged } from '../../src/utils/event.js'
import { Errors } from '../../src/components/layout/Errors.js'

afterEach(() => {
  vi.runOnlyPendingTimers()
  cleanup()
  vi.useRealTimers()
})
beforeEach(() => {
  vi.useFakeTimers()
  window.localStorage.clear()
  window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1' }))
  setIsLogged(true)
})

function renderAt(ui: () => JSX.Element) {
  const history = historyAt('/dashboard/guilds/g1/config')
  renderWithProviders(ui, { path: '*', history })
  return history
}

describe('Guild dashboard shell', () => {
  it('composes the navigation and page without redirecting an authenticated user', () => {
    const history = renderAt(() => (
      <AppDashboard>
        <div data-testid="page">Guild config page</div>
      </AppDashboard>
    ))
    expect(history.get()).toBe('/dashboard/guilds/g1/config')
    expect(screen.getByRole('navigation', { name: 'Discord communities' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/dashboard/guilds')
    expect(screen.getByTestId('page')).toHaveTextContent('Guild config page')
  })

  it('displays and expires existing global errors without hiding the page', () => {
    Errors('boot failure', 100000)
    renderAt(() => (
      <AppDashboard>
        <div>Page content</div>
      </AppDashboard>
    ))
    expect(screen.getByRole('alert')).toHaveTextContent('boot failure')
    vi.advanceTimersByTime(100000)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('Page content')).toBeInTheDocument()
  })

  it('shows the current server context and updates the page heading after navigation', async () => {
    window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', name: 'Community One' }))
    window.localStorage.setItem('server', JSON.stringify({ id: 's1', name: 'Sandbox One' }))
    const history = historyAt('/dashboard/guilds/g1/config/servers/s1/status')
    renderWithProviders(
      () => (
        <AppDashboard>
          <div>Page content</div>
        </AppDashboard>
      ),
      { path: '*', history },
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Status' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('Community One')
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('Sandbox One')
    history.set({ value: '/dashboard/guilds/g1/config/servers/s1/logs', replace: true })
    await vi.waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Logs' })).toBeInTheDocument())
  })

  it('catches a page failure, keeps navigation available and retries rendering', () => {
    let shouldFail = true
    function FailablePage() {
      if (shouldFail) throw new Error('page crashed')
      return <div>Recovered guild page</div>
    }
    expect(() =>
      renderAt(() => (
        <AppDashboard>
          <FailablePage />
        </AppDashboard>
      )),
    ).not.toThrow()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'This page could not be displayed. Try again to reload its content.',
    )
    expect(screen.getByRole('navigation', { name: 'Discord communities' })).toBeInTheDocument()

    shouldFail = false
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('Recovered guild page')).toBeInTheDocument()
  })
})
