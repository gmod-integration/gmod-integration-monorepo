import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@solidjs/testing-library'
import { createSignal, type JSX } from 'solid-js'
import { MemoryRouter, Route } from '@solidjs/router'
import { AccessProvider, useAccess } from '../../src/components/AccessProvider.js'
import { I18nProvider } from '../../src/i18n.js'
import { refreshAccess } from '../../src/utils/accessEvents.js'
import { acceptAuthSession, authenticatedFetch } from '../../src/utils/authClient.js'
import { sessionFixture } from '../authFixture.js'
import { historyAt, renderWithProviders } from '../testUtils.js'
import { AppDashboard } from '../../src/app/AppDashboard.js'
import { setIsLogged } from '../../src/utils/event.js'
import { Errors } from '../../src/components/layout/Errors.js'

afterEach(() => {
  vi.runOnlyPendingTimers()
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
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

const accessSnapshot = (state = 'ready') => ({
  guildID: 'g1',
  premium: false,
  customBot: false,
  state,
  sources: [],
  revision: 'test',
  validUntil: '2099-01-01T00:00:00.000Z',
  usages: {},
})
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
function renderRemoteDashboard(page: () => JSX.Element) {
  return render(() => (
    <MemoryRouter
      history={historyAt('/dashboard/guilds/g1/config')}
      root={(props) => (
        <I18nProvider>
          <AccessProvider>{props.children}</AccessProvider>
        </I18nProvider>
      )}
    >
      <Route path="*" component={() => <AppDashboard>{page()}</AppDashboard>} />
    </MemoryRouter>
  ))
}

describe('Guild dashboard shell', () => {
  it('hides and makes a denied page inert while retaining its editor through retry and restored access', async () => {
    let finish!: (value: Response) => void
    const resumed = new Promise<Response>((resolve) => (finish = resolve))
    const network = vi
      .fn()
      .mockResolvedValueOnce(response(accessSnapshot()))
      .mockResolvedValueOnce(response({}, 403))
      .mockReturnValueOnce(resumed)
      .mockImplementation(async () => response(accessSnapshot()))
    vi.stubGlobal('fetch', network)
    let mounts = 0
    function Editor() {
      mounts++
      const access = useAccess()
      const [draft, setDraft] = createSignal('Saved')
      return (
        <>
          <output aria-label="Verified access">{String(access.ready())}</output>
          <input aria-label="Settings draft" value={draft()} onInput={(event) => setDraft(event.currentTarget.value)} />
        </>
      )
    }
    renderRemoteDashboard(Editor)
    await vi.waitFor(() => expect(screen.getByLabelText('Verified access')).toHaveTextContent('true'))
    const field = screen.getByRole('textbox', { name: 'Settings draft' })
    await fireEvent.input(field, { target: { value: 'Unsaved settings' } })
    refreshAccess()
    const denied = await screen.findByRole('region', { name: 'Dashboard access denied' })
    const help = screen.getByRole('dialog', { name: 'Get dashboard access' })
    expect(help).toHaveAttribute('open')
    expect(field).not.toBeVisible()
    expect(field.closest('.dashboard-content')).toHaveAttribute('hidden')
    expect(field.closest('.dashboard-content')).toHaveAttribute('inert')
    expect(screen.queryByRole('textbox', { name: 'Settings draft' })).not.toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Discord communities' })).toBeVisible()
    expect(within(denied).getByRole('link', { name: 'Choose another community' })).toHaveAttribute(
      'href',
      '/dashboard/guilds',
    )
    await fireEvent.click(within(denied).getByRole('button', { name: 'Try again' }))
    expect(network).toHaveBeenCalledTimes(3)
    expect(field).not.toBeVisible()
    expect(within(denied).getByRole('button', { name: 'Try again' })).toBeDisabled()
    finish(response(accessSnapshot()))
    await vi.waitFor(() => expect(field).toBeVisible())
    expect(screen.getByRole('textbox', { name: 'Settings draft' })).toBe(field)
    expect(field).toHaveValue('Unsaved settings')
    expect(mounts).toBe(1)
    expect(field.closest('.dashboard-content')).not.toHaveAttribute('inert')
    expect(screen.queryByRole('region', { name: 'Dashboard access denied' })).not.toBeInTheDocument()
    expect(help).not.toHaveAttribute('open')
  })

  it('opens help immediately on a denied mutation and preserves the editor after a modal recheck', async () => {
    acceptAuthSession(sessionFixture())
    const network = vi
      .fn()
      .mockResolvedValueOnce(response(accessSnapshot()))
      .mockResolvedValueOnce(response({ error: 'dashboard_access_denied', reason: 'game_admin_required' }, 403))
      .mockResolvedValueOnce(response(accessSnapshot()))
    vi.stubGlobal('fetch', network)
    renderRemoteDashboard(() => <input aria-label="Settings draft" value="Keep this edit" />)
    await vi.waitFor(() => expect(network).toHaveBeenCalledOnce())
    await authenticatedFetch('http://localhost:5001/v3/users/u1/guilds/g1/settings/example', {
      method: 'PUT',
      body: '{}',
    })
    const help = screen.getByRole('dialog', { name: 'Get dashboard access' })
    expect(help).toHaveTextContent('does not yet have a recorded game administrator group')
    expect(within(help).getByRole('link', { name: 'Open Account' })).toHaveAttribute('href', '/account')
    const field = screen.getByLabelText('Settings draft')
    expect(field).not.toBeVisible()
    await fireEvent.click(within(help).getByRole('button', { name: 'Recheck access' }))
    await vi.waitFor(() => expect(help).not.toHaveAttribute('open'))
    expect(field).toBeVisible()
    expect(field).toHaveValue('Keep this edit')
    expect(network.mock.calls.filter((call) => (call[1] as RequestInit)?.method === 'PUT')).toHaveLength(1)
  })

  it('can dismiss and reopen the procedure without reopening it on every failed refresh', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          response({ error: { code: 'dashboard_access_denied', reason: 'steam_link_required' } }, 403),
        ),
    )
    renderRemoteDashboard(() => <input aria-label="Settings draft" value="Preserved" />)
    const help = await screen.findByRole('dialog', { name: 'Get dashboard access' })
    expect(help).toHaveTextContent('Link your Steam account')
    await fireEvent.click(within(help).getAllByRole('button', { name: 'Close' }).at(-1)!)
    expect(help).not.toHaveAttribute('open')
    refreshAccess()
    await vi.waitFor(() =>
      expect(
        within(screen.getByRole('region', { name: 'Dashboard access denied' })).getByRole('button', {
          name: 'Try again',
        }),
      ).toBeEnabled(),
    )
    expect(help).not.toHaveAttribute('open')
    await fireEvent.click(screen.getByRole('button', { name: 'How to get access' }))
    expect(help).toHaveAttribute('open')
  })

  it.each([503, 200])('does not hide the page when access is merely unavailable: HTTP %s', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(status === 200 ? accessSnapshot('unknown') : {}, status)))
    renderRemoteDashboard(() => <input aria-label="Settings draft" value="Keep this draft" />)
    await vi.waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Access could not be verified'))
    const field = screen.getByRole('textbox', { name: 'Settings draft' })
    expect(field).toBeVisible()
    expect(field.closest('.dashboard-content')).not.toHaveAttribute('hidden')
    expect(field.closest('.dashboard-content')).not.toHaveAttribute('inert')
    expect(screen.queryByRole('region', { name: 'Dashboard access denied' })).not.toBeInTheDocument()
  })
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
    history.set({ value: '/dashboard/guilds/g1/config/servers/s1/statistics', replace: true })
    await vi.waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Statistics' })).toBeInTheDocument())
    history.set({ value: '/dashboard/guilds/g1/config/servers/s1/map', replace: true })
    await vi.waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Map' })).toBeInTheDocument())
    history.set({ value: '/dashboard/guilds/g1/config/servers/s1/console', replace: true })
    await vi.waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Console' })).toBeInTheDocument())
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
