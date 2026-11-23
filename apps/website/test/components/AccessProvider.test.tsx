import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@solidjs/testing-library'
import { A, MemoryRouter, Route, useNavigate } from '@solidjs/router'
import { createSignal, Show } from 'solid-js'
import {
  AccessProvider,
  useAccess,
  useFeatureAccess,
  type DashboardAccessSnapshot,
} from '../../src/components/AccessProvider.js'
import { FeatureGate } from '../../src/components/FeatureGate.js'
import { PremiumBadge } from '../../src/utils/premium.js'
import { I18nProvider } from '../../src/i18n.js'
import { historyAt, renderWithProviders } from '../testUtils.js'
import { ACCESS_REFRESH_EVENT, refreshAccess } from '../../src/utils/accessEvents.js'
import { acceptAuthSession, resetAuthentication } from '../../src/utils/authClient.js'
import { sessionFixture } from '../authFixture.js'

const snapshot = (overrides: Partial<DashboardAccessSnapshot> = {}): DashboardAccessSnapshot => ({
  guildID: 'g1',
  premium: false,
  customBot: false,
  state: 'ready',
  sources: [],
  revision: 'one',
  validUntil: '2099-01-01T00:00:00.000Z',
  usages: {},
  ...overrides,
})
const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
const deferredResponse = () => {
  let resolve!: (value: Response) => void
  const promise = new Promise<Response>((finish) => {
    resolve = finish
  })
  return { promise, resolve }
}

function Harness() {
  const access = useFeatureAccess('sync.roles.rules')
  const reverse = useFeatureAccess('sync.roles.reverse')
  const [draft, setDraft] = createSignal('Saved')
  const navigate = useNavigate()
  return (
    <>
      <output aria-label="Verified community">{access.snapshot()?.guildID}</output>
      <input aria-label="Draft" value={draft()} onInput={(event) => setDraft(event.currentTarget.value)} />
      <FeatureGate capability="sync.roles.rules" used={4}>
        <button disabled={!access.canCreate(4)}>Add rule</button>
      </FeatureGate>
      <button disabled={!reverse.allowed()}>Reverse direction</button>
      <button disabled={!access.canCreate(3)}>Fourth free rule</button>
      <button onClick={access.refresh}>Refresh access</button>
      <button onClick={() => navigate('/dashboard/guilds/g2/config/servers/s2/roles')}>Other community</button>
      <PremiumBadge onlyIcon />
      <A href="/premium">Plan details</A>
    </>
  )
}
function renderRemote() {
  const history = historyAt('/dashboard/guilds/g1/config/servers/s1/roles')
  const view = render(() => (
    <MemoryRouter
      history={history}
      root={(props) => (
        <I18nProvider>
          <AccessProvider>{props.children}</AccessProvider>
        </I18nProvider>
      )}
    >
      <Route path="/dashboard/guilds/:guildID/config/servers/:serverID/roles" component={Harness} />
      <Route path="/dashboard/guilds/:guildID/config/servers/:serverID/config" component={Harness} />
    </MemoryRouter>
  ))
  return { ...view, history }
}

beforeEach(() => {
  localStorage.clear()
  resetAuthentication()
  localStorage.setItem('accessToken', 'session')
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('authoritative reactive access', () => {
  it('shares an in-flight lookup across browser resume and socket-open refreshes', async () => {
    const initial = deferredResponse()
    const resumed = deferredResponse()
    const network = vi.fn().mockReturnValueOnce(initial.promise).mockReturnValueOnce(resumed.promise)
    vi.stubGlobal('fetch', network)
    renderRemote()
    await vi.waitFor(() => expect(network).toHaveBeenCalledTimes(1))
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    window.dispatchEvent(new Event('focus'))
    window.dispatchEvent(new Event('storage'))
    document.dispatchEvent(new Event('visibilitychange'))
    refreshAccess('background')
    expect(network).toHaveBeenCalledTimes(1)

    initial.resolve(response(snapshot({ serverID: 's1' })))
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Fourth free rule' })).toBeEnabled())
    expect(network).toHaveBeenCalledTimes(1)

    refreshAccess('background')
    window.dispatchEvent(new Event('focus'))
    expect(network).toHaveBeenCalledTimes(2)
    resumed.resolve(response(snapshot({ premium: true, serverID: 's1' })))
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Reverse direction' })).toBeEnabled())
    expect(network).toHaveBeenCalledTimes(2)
  })

  it('queues one new lookup for changes made while the previous snapshot is pending', async () => {
    const initial = deferredResponse()
    const changed = deferredResponse()
    const network = vi.fn().mockReturnValueOnce(initial.promise).mockReturnValueOnce(changed.promise)
    vi.stubGlobal('fetch', network)
    renderRemote()
    await vi.waitFor(() => expect(network).toHaveBeenCalledTimes(1))
    refreshAccess()
    window.dispatchEvent(new Event(ACCESS_REFRESH_EVENT))
    await fireEvent.click(screen.getByRole('button', { name: 'Refresh access' }))
    expect(network).toHaveBeenCalledTimes(1)

    initial.resolve(response(snapshot({ serverID: 's1' })))
    await vi.waitFor(() => expect(network).toHaveBeenCalledTimes(2))
    changed.resolve(response(snapshot({ premium: true, serverID: 's1' })))
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Reverse direction' })).toBeEnabled())
    expect(network).toHaveBeenCalledTimes(2)
  })

  it('keeps the current snapshot when navigating between pages for the same server', async () => {
    const network = vi.fn().mockImplementation(async () => response(snapshot({ premium: true, serverID: 's1' })))
    vi.stubGlobal('fetch', network)
    const { history } = renderRemote()
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Reverse direction' })).toBeEnabled())
    history.set({ value: '/dashboard/guilds/g1/config/servers/s1/config', replace: true })
    await vi.waitFor(() => expect(history.get()).toBe('/dashboard/guilds/g1/config/servers/s1/config'))
    expect(screen.getByRole('button', { name: 'Reverse direction' })).toBeEnabled()
    expect(network).toHaveBeenCalledTimes(1)
  })

  it('aborts an old scope and ignores its late response and queued refresh', async () => {
    const initial = deferredResponse()
    const changedScope = deferredResponse()
    const network = vi.fn().mockReturnValueOnce(initial.promise).mockReturnValueOnce(changedScope.promise)
    vi.stubGlobal('fetch', network)
    renderRemote()
    await vi.waitFor(() => expect(network).toHaveBeenCalledTimes(1))
    const previousSignal = network.mock.calls[0][1].signal as AbortSignal
    refreshAccess()
    await fireEvent.click(screen.getByRole('button', { name: 'Other community' }))
    await vi.waitFor(() => expect(network).toHaveBeenCalledTimes(2))
    expect(previousSignal.aborted).toBe(true)
    changedScope.resolve(response(snapshot({ guildID: 'g2', serverID: 's2', premium: true })))
    await vi.waitFor(() => expect(screen.getByLabelText('Verified community')).toHaveTextContent('g2'))
    initial.resolve(response(snapshot({ serverID: 's1' })))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.getByRole('button', { name: 'Reverse direction' })).toBeEnabled()
    expect(screen.getByLabelText('Verified community')).toHaveTextContent('g2')
    expect(network).toHaveBeenCalledTimes(2)
  })

  it('shares initial session restoration but replaces requests and rights when the identity changes', async () => {
    const initial = deferredResponse()
    const changedSession = deferredResponse()
    const network = vi
      .fn()
      .mockReturnValueOnce(initial.promise)
      .mockReturnValueOnce(changedSession.promise)
      .mockImplementation(async () => response(snapshot({ premium: true, serverID: 's1' })))
    vi.stubGlobal('fetch', network)
    renderRemote()
    await vi.waitFor(() => expect(network).toHaveBeenCalledTimes(1))
    const signal = network.mock.calls[0][1].signal as AbortSignal
    acceptAuthSession(sessionFixture())
    refreshAccess('background')
    expect(network).toHaveBeenCalledTimes(1)
    const nextSession = sessionFixture()
    acceptAuthSession({ ...nextSession, session: { ...nextSession.session, id: 'replacement-session' } })
    expect(signal.aborted).toBe(true)
    expect(network).toHaveBeenCalledTimes(2)
    changedSession.resolve(response(snapshot({ premium: true, serverID: 's1' })))
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Reverse direction' })).toBeEnabled())
    initial.resolve(response(snapshot({ serverID: 's1' })))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.getByRole('button', { name: 'Reverse direction' })).toBeEnabled()
    resetAuthentication()
    expect(screen.getByRole('button', { name: 'Reverse direction' })).toBeDisabled()
    expect(screen.getByLabelText('Verified community')).toBeEmptyDOMElement()
    expect(network).toHaveBeenCalledTimes(2)
    acceptAuthSession(nextSession)
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Reverse direction' })).toBeEnabled())
    expect(network).toHaveBeenCalledTimes(3)
  })

  it('aborts a pending lookup and drops its queued refresh when unmounted', async () => {
    const initial = deferredResponse()
    const network = vi.fn().mockReturnValue(initial.promise)
    vi.stubGlobal('fetch', network)
    const view = renderRemote()
    await vi.waitFor(() => expect(network).toHaveBeenCalledTimes(1))
    const signal = network.mock.calls[0][1].signal as AbortSignal
    refreshAccess()
    view.unmount()
    expect(signal.aborted).toBe(true)
    initial.resolve(response(snapshot({ serverID: 's1' })))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(network).toHaveBeenCalledTimes(1)
  })

  it('omits an empty feature wrapper and preserves controls while quota feedback changes', () => {
    const [showControl, setShowControl] = createSignal(false)
    const [showQuota, setShowQuota] = createSignal(false)
    renderWithProviders(() => (
      <div data-testid="feature-slot">
        <FeatureGate capability="sync.roles.rules" showQuota={showQuota()}>
          <Show when={showControl()}>
            <input aria-label="Rule draft" value="Keep my draft" />
          </Show>
        </FeatureGate>
      </div>
    ))
    const slot = screen.getByTestId('feature-slot')
    expect(slot.children).toHaveLength(0)

    setShowQuota(true)
    expect(screen.getByText('0 / 4 used')).toBeInTheDocument()
    setShowQuota(false)
    expect(slot.children).toHaveLength(0)

    setShowControl(true)
    const field = screen.getByRole('textbox', { name: 'Rule draft' })
    setShowQuota(true)
    expect(screen.getByText('0 / 4 used')).toBeInTheDocument()
    setShowQuota(false)
    expect(screen.getByRole('textbox', { name: 'Rule draft' })).toBe(field)
    expect(field).toHaveValue('Keep my draft')

    setShowControl(false)
    expect(slot.children).toHaveLength(0)
  })

  it('retains upgrade feedback when a blocked feature has no controls or quota', () => {
    renderWithProviders(() => <FeatureGate capability="sync.roles.reverse" showQuota={false} />)
    expect(screen.getByRole('note')).toHaveTextContent('This feature requires Premium.')
    expect(screen.getByRole('link', { name: 'View Premium plans' })).toBeInTheDocument()
  })

  it('fails closed outside a provider and safely accepts a refresh without manufacturing rights', async () => {
    const Probe = () => {
      const access = useAccess()
      return (
        <>
          <output aria-label="Snapshot">{access.snapshot()?.guildID || 'No verified community'}</output>
          <output aria-label="Loading">{String(access.loading())}</output>
          <output aria-label="Error">{String(access.error())}</output>
          <output aria-label="Ready">{String(access.ready())}</output>
          <button onClick={access.refresh}>Refresh missing access</button>
        </>
      )
    }
    const network = vi.fn()
    vi.stubGlobal('fetch', network)
    render(Probe)
    expect(screen.getByLabelText('Snapshot')).toHaveTextContent('No verified community')
    expect(screen.getByLabelText('Loading')).toHaveTextContent('false')
    expect(screen.getByLabelText('Error')).toHaveTextContent('true')
    expect(screen.getByLabelText('Ready')).toHaveTextContent('false')
    await fireEvent.click(screen.getByRole('button', { name: 'Refresh missing access' }))
    expect(network).not.toHaveBeenCalled()
  })

  it('retries a failed access lookup from the shared error action without discarding edits', async () => {
    const network = vi.fn().mockResolvedValueOnce(response({}, 503))
    vi.stubGlobal('fetch', network)
    renderRemote()
    await vi.waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Access could not be verified'))
    await fireEvent.input(screen.getByLabelText('Draft'), { target: { value: 'Keep my draft' } })
    network.mockResolvedValueOnce(response(snapshot({ premium: true, serverID: 's1' })))
    await fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Try again' }))
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Reverse direction' })).toBeEnabled())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Draft')).toHaveValue('Keep my draft')
    expect(network).toHaveBeenCalledTimes(2)
  })

  it('retries unavailable rights beside the blocked feature without clearing its draft', async () => {
    const network = vi.fn().mockResolvedValueOnce(response({}, 503))
    vi.stubGlobal('fetch', network)
    renderRemote()
    const feature = within(screen.getByRole('button', { name: 'Add rule' }).parentElement!)
    await vi.waitFor(() => expect(feature.getByRole('status')).toHaveTextContent('Access could not be verified'))
    await fireEvent.input(screen.getByLabelText('Draft'), { target: { value: 'Keep this edit' } })
    const retry = feature.getByRole('button', { name: 'Try again' })
    const resumed = deferredResponse()
    network.mockReturnValueOnce(resumed.promise)
    await fireEvent.click(retry)
    expect(network).toHaveBeenCalledTimes(2)
    expect(feature.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add rule' })).toBeDisabled()
    resumed.resolve(response(snapshot({ premium: true, serverID: 's1' })))
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Add rule' })).toBeEnabled())
    expect(screen.getByLabelText('Draft')).toHaveValue('Keep this edit')
    expect(screen.queryByRole('link', { name: 'View Premium plans' })).not.toBeInTheDocument()
  })

  it('refreshes when the document becomes visible and unregisters browser listeners on unmount', async () => {
    const network = vi.fn().mockImplementation(async () => response(snapshot({ serverID: 's1' })))
    vi.stubGlobal('fetch', network)
    const view = renderRemote()
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Fourth free rule' })).toBeEnabled())
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(network).toHaveBeenCalledTimes(1)
    visibility.mockReturnValue('visible')
    network.mockImplementation(async () => response(snapshot({ premium: true, serverID: 's1' })))
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Reverse direction' })).toBeEnabled())
    expect(network).toHaveBeenCalledTimes(2)
    view.unmount()
    window.dispatchEvent(new Event('focus'))
    window.dispatchEvent(new Event('storage'))
    document.dispatchEvent(new Event('visibilitychange'))
    expect(network).toHaveBeenCalledTimes(2)
  })

  it('lets a feature explicitly refresh the authoritative snapshot after a plan change', async () => {
    const network = vi.fn().mockResolvedValueOnce(response(snapshot({ serverID: 's1' })))
    vi.stubGlobal('fetch', network)
    renderRemote()
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Fourth free rule' })).toBeEnabled())
    expect(screen.getByRole('button', { name: 'Reverse direction' })).toBeDisabled()
    network.mockResolvedValueOnce(response(snapshot({ premium: true, serverID: 's1' })))
    await fireEvent.click(screen.getByRole('button', { name: 'Refresh access' }))
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Reverse direction' })).toBeEnabled())
    expect(network).toHaveBeenCalledTimes(2)
  })

  it('ignores a stored Premium flag, then refreshes rights after upgrade and revocation without losing the draft', async () => {
    localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: true }))
    const network = vi.fn().mockResolvedValue(response(snapshot({ serverID: 's1' })))
    vi.stubGlobal('fetch', network)
    renderRemote()
    await vi.waitFor(() => expect(screen.getByText('4 / 4 used')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Add rule' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Reverse direction' })).toBeDisabled()
    expect(screen.getByRole('link', { name: 'View Premium plans' })).toHaveAttribute('href', '/premium?guildID=g1')
    expect(screen.getByRole('link', { name: 'Premium' })).toHaveAccessibleName('Premium')
    await fireEvent.input(screen.getByLabelText('Draft'), { target: { value: 'My unsaved draft' } })
    network.mockResolvedValue(response(snapshot({ premium: true, serverID: 's1', revision: 'two' })))
    window.dispatchEvent(new Event('focus'))
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Reverse direction' })).toBeEnabled())
    expect(screen.getByRole('button', { name: 'Add rule' })).toBeEnabled()
    network.mockResolvedValue(response(snapshot({ serverID: 's1', revision: 'three' })))
    refreshAccess()
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Reverse direction' })).toBeDisabled())
    expect(screen.getByLabelText('Draft')).toHaveValue('My unsaved draft')
  })

  it('shows an access lookup failure without turning it into an upgrade request', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({}, 503)))
    renderRemote()
    await vi.waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Access could not be verified'))
    expect(screen.queryByRole('link', { name: 'View Premium plans' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add rule' })).toBeDisabled()
  })

  it('distinguishes missing administration permission from an unavailable entitlement', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({}, 403)))
    renderRemote()
    await vi.waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('You do not have permission'))
    expect(screen.queryByRole('link', { name: 'View Premium plans' })).not.toBeInTheDocument()
  })

  it('reloads for a different community and rejects a response for the previous scope', async () => {
    const network = vi.fn().mockImplementation(async () => response(snapshot({ premium: true, serverID: 's1' })))
    vi.stubGlobal('fetch', network)
    renderRemote()
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Reverse direction' })).toBeEnabled())
    await fireEvent.click(screen.getByRole('button', { name: 'Other community' }))
    await vi.waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(network).toHaveBeenLastCalledWith(
      expect.stringContaining('/v6/guilds/g2/servers/s2/access'),
      expect.objectContaining({ cache: 'no-store' }),
    )
    expect(screen.getByRole('button', { name: 'Reverse direction' })).toBeDisabled()
  })

  it('keeps free capacity usable when only the paid entitlement lookup is uncertain', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(snapshot({ state: 'unknown', serverID: 's1' }))))
    renderRemote()
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Fourth free rule' })).toBeEnabled())
    expect(screen.getByRole('button', { name: 'Add rule' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Reverse direction' })).toBeDisabled()
    expect(screen.queryByRole('link', { name: 'View Premium plans' })).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Access could not be verified')
  })

  it('stops using a paid snapshot at expiry even if no replacement request has completed', async () => {
    vi.useFakeTimers()
    const expiry = new Date(Date.now() + 500).toISOString()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response(snapshot({ premium: true, serverID: 's1', validUntil: expiry }))),
    )
    renderRemote()
    await vi.advanceTimersByTimeAsync(0)
    expect(screen.getByRole('button', { name: 'Reverse direction' })).toBeEnabled()
    await vi.advanceTimersByTimeAsync(1000)
    expect(screen.getByRole('button', { name: 'Reverse direction' })).toBeDisabled()
    expect(screen.queryByRole('link', { name: 'View Premium plans' })).not.toBeInTheDocument()
  })

  it('does not show a quota upgrade when the resource itself failed to load', () => {
    render(() => (
      <MemoryRouter
        root={(props) => (
          <I18nProvider>
            <AccessProvider snapshot={snapshot()}>{props.children}</AccessProvider>
          </I18nProvider>
        )}
      >
        <Route
          path="/"
          component={() => (
            <FeatureGate capability="sync.roles.rules" used={4} error={new Error('List unavailable')}>
              <button disabled>Add rule</button>
            </FeatureGate>
          )}
        />
      </MemoryRouter>
    ))
    expect(screen.queryByRole('link', { name: 'View Premium plans' })).not.toBeInTheDocument()
    expect(screen.queryByText('4 / 4 used')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add rule' })).toBeDisabled()
  })
})
