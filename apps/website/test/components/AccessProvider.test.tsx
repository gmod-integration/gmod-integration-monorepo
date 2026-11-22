import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'
import { A, MemoryRouter, Route, useNavigate } from '@solidjs/router'
import { createSignal } from 'solid-js'
import {
  AccessProvider,
  useAccess,
  useFeatureAccess,
  type DashboardAccessSnapshot,
} from '../../src/components/AccessProvider.js'
import { FeatureGate } from '../../src/components/FeatureGate.js'
import { PremiumBadge } from '../../src/utils/premium.js'
import { I18nProvider } from '../../src/i18n.js'
import { historyAt } from '../testUtils.js'
import { refreshAccess } from '../../src/utils/accessEvents.js'

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

function Harness() {
  const access = useFeatureAccess('sync.roles.rules')
  const reverse = useFeatureAccess('sync.roles.reverse')
  const [draft, setDraft] = createSignal('Saved')
  const navigate = useNavigate()
  return (
    <>
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
  return render(() => (
    <MemoryRouter
      history={historyAt('/dashboard/guilds/g1/config/servers/s1/roles')}
      root={(props) => (
        <I18nProvider>
          <AccessProvider>{props.children}</AccessProvider>
        </I18nProvider>
      )}
    >
      <Route path="/dashboard/guilds/:guildID/config/servers/:serverID/roles" component={Harness} />
    </MemoryRouter>
  ))
}

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('accessToken', 'session')
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('authoritative reactive access', () => {
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
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Reverse direction' })).toBeEnabled())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Draft')).toHaveValue('Keep my draft')
    expect(network).toHaveBeenCalledTimes(2)
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
