import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@solidjs/testing-library'
import { MemoryRouter, Route } from '@solidjs/router'
import { Show } from 'solid-js'
import { AccessProvider, type DashboardAccessSnapshot } from '../../../../../../src/components/AccessProvider.js'
import { I18nProvider } from '../../../../../../src/i18n.js'
import { acceptAuthSession, authSession, resetAuthentication } from '../../../../../../src/utils/authClient.js'
import { historyAt } from '../../../../../testUtils.js'
import { sessionFixture } from '../../../../../authFixture.js'
import { configuration, installNetwork, statusButton, viewport } from './statusTestHelpers.js'
import ServerStatus from '../../../../../../src/pages/dashboard/guilds/servers/status/ServerStatus.js'

vi.mock('emoji-picker-element', () => ({}))
vi.mock('../../../../../../src/utils/api.js', () => ({
  fetchAPI: vi.fn(),
  getAPIUrl: () => '',
  getUrlWithActualParams: (path: string) => path.replaceAll(':guildID', 'g1').replaceAll(':serverID', 's1'),
}))
const { fetchAPI } = await import('../../../../../../src/utils/api.js')
const api = fetchAPI as Mock
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
const accessSnapshot = (overrides: Partial<DashboardAccessSnapshot> = {}): DashboardAccessSnapshot => ({
  guildID: 'g1',
  serverID: 's1',
  premium: false,
  customBot: false,
  state: 'ready',
  sources: [],
  revision: 'access-1',
  validUntil: '2099-01-01T00:00:00.000Z',
  usages: { 'status.buttons': 1 },
  ...overrides,
})
const accessReads = (network: Mock) => network.mock.calls.filter(([url]) => String(url).endsWith('/access'))

function networkForAccess(access: () => Promise<Response>, buttons = [statusButton()]) {
  const network = installNetwork(api, {
    configuration: configuration({
      buttons,
      settings: { show_player_list_status: true, status_player_list_format: '{name}', show_status_chart: false },
    }),
  })
  const configurationNetwork = network.getMockImplementation()!
  network.mockImplementation(async (url: string, request?: RequestInit) =>
    url.endsWith('/access') ? access() : configurationNetwork(url, request),
  )
  return network
}

function renderLiveStatus(waitForSession = false) {
  return render(() => (
    <MemoryRouter
      history={historyAt('/dashboard/guilds/g1/config/servers/s1/status')}
      root={(props) => (
        <I18nProvider>
          <AccessProvider>{props.children}</AccessProvider>
        </I18nProvider>
      )}
    >
      <Route
        path="/dashboard/guilds/:guildID/config/servers/:serverID/status"
        component={() => (
          <Show when={!waitForSession || authSession()}>
            <ServerStatus />
          </Show>
        )}
      />
    </MemoryRouter>
  ))
}

beforeEach(() => {
  localStorage.clear()
  resetAuthentication()
  api.mockReset()
  viewport(true)
})
afterEach(() => {
  cleanup()
  resetAuthentication()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('status actions with live access loading', () => {
  it('rechecks access after the initial session is restored while its rejected lookup is pending', async () => {
    let finishSession!: (response: Response) => void
    const restored = new Promise<Response>((resolve) => {
      finishSession = resolve
    })
    let reads = 0
    const network = networkForAccess(async () => (++reads === 1 ? json({}, 401) : json(accessSnapshot())))
    const statusNetwork = network.getMockImplementation()!
    network.mockImplementation(async (url: string, request?: RequestInit) =>
      url.endsWith('/v6/auth/session') ? restored : statusNetwork(url, request),
    )
    renderLiveStatus(true)
    await vi.waitFor(() =>
      expect(network.mock.calls.some(([url]) => String(url).endsWith('/v6/auth/session'))).toBe(true),
    )
    expect(authSession()).toBeUndefined()
    finishSession(json(sessionFixture()))
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Add Button' })).toBeEnabled())
    expect(accessReads(network)).toHaveLength(2)
    expect(screen.getByRole('table')).toHaveTextContent('Website')
    expect(screen.getByText('1 / 3 used')).toBeInTheDocument()
  })

  it('does not loop or grant access if the automatic read after session restoration also fails', async () => {
    let reads = 0
    const network = networkForAccess(async () => json({}, ++reads === 1 ? 401 : 503))
    const statusNetwork = network.getMockImplementation()!
    network.mockImplementation(async (url: string, request?: RequestInit) =>
      url.endsWith('/v6/auth/session') ? json(sessionFixture()) : statusNetwork(url, request),
    )
    renderLiveStatus(true)
    await vi.waitFor(() => expect(screen.getByRole('table')).toHaveTextContent('Website'))
    const add = screen.getByRole('button', { name: 'Add Button' })
    const card = within(add.closest('section')!)
    await vi.waitFor(() => expect(card.getByRole('status')).toHaveTextContent('Access could not be verified'))
    expect(accessReads(network)).toHaveLength(2)
    expect(add).toBeDisabled()
    expect(screen.queryByRole('link', { name: 'View Premium plans' })).not.toBeInTheDocument()
    await fireEvent.click(card.getByRole('button', { name: 'Try again' }))
    await vi.waitFor(() => expect(card.getByRole('status')).toHaveTextContent('Access could not be verified'))
    expect(accessReads(network)).toHaveLength(3)
    expect(add).toBeDisabled()
  })

  it.each(['provider', 'wrong server', 'expired'])(
    'keeps creation disabled after a %s access failure, then retries inline without losing the status draft',
    async (failure) => {
      acceptAuthSession(sessionFixture())
      let reads = 0
      const network = networkForAccess(async () => {
        if (++reads > 1) return json(accessSnapshot())
        return failure === 'provider'
          ? json({}, 503)
          : json(
              accessSnapshot(
                failure === 'wrong server' ? { serverID: 'foreign' } : { validUntil: '2000-01-01T00:00:00.000Z' },
              ),
            )
      })
      renderLiveStatus()
      await vi.waitFor(() => expect(screen.getByRole('table')).toHaveTextContent('Website'))
      const add = screen.getByRole('button', { name: 'Add Button' })
      expect(add).toBeDisabled()
      expect(screen.queryByRole('link', { name: 'View Premium plans' })).not.toBeInTheDocument()
      const draft = screen.getByRole('textbox', { name: 'Player List Format' })
      await fireEvent.input(draft, { target: { value: 'Keep {name} draft' } })
      const card = add.closest('section')!
      await fireEvent.click(within(card).getByRole('button', { name: 'Try again' }))
      await vi.waitFor(() => expect(add).toBeEnabled())
      expect(accessReads(network)).toHaveLength(2)
      expect(screen.getByText('1 / 3 used')).toBeInTheDocument()
      expect(draft).toHaveValue('Keep {name} draft')
      expect(screen.getByRole('table')).toHaveTextContent('Website')
      expect(network.mock.calls.filter(([url]) => String(url).endsWith('/status/configuration'))).toHaveLength(1)
    },
  )

  it.each([1, 3])(
    'preserves the free quota while the paid entitlement is uncertain (%i saved buttons)',
    async (count) => {
      acceptAuthSession(sessionFixture())
      const buttons = Array.from({ length: count }, (_, index) =>
        statusButton({ id: index + 1, name: `Link ${index + 1}` }),
      )
      networkForAccess(
        async () => json(accessSnapshot({ state: 'unknown', usages: { 'status.buttons': count } })),
        buttons,
      )
      renderLiveStatus()
      await vi.waitFor(() => expect(screen.getByRole('table')).toHaveTextContent(`Link ${count}`))
      const add = screen.getByRole('button', { name: 'Add Button' })
      if (count < 3) expect(add).toBeEnabled()
      else expect(add).toBeDisabled()
      expect(screen.getByText(`${count} / 3 used`)).toBeInTheDocument()
      expect(screen.queryByRole('link', { name: 'View Premium plans' })).not.toBeInTheDocument()
    },
  )
})
