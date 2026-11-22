import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@solidjs/testing-library'
import { historyAt, renderWithProviders } from '../testUtils.js'
import { discordUser, isAdmin, isLogged, setIsAdmin, setIsLogged } from '../../src/utils/event.js'
import { ERASURE_RECEIPT_KEY } from '../../src/utils/accountErasure.js'
import { notificationCount, updateNotificationCount } from '../../src/utils/notificationStore.js'
import {
  setWebSocketLogsMessages,
  setWebSocketSignal,
  webSocketLogsMessages,
  webSocketSignal,
} from '../../src/utils/websocket.js'
import Account from '../../src/pages/Account.js'
import type * as ApiModule from '../../src/utils/api.js'
import { acceptAuthSession, authSession, AUTH_STORAGE_KEY, resetAuthentication } from '../../src/utils/authClient.js'

vi.mock('../../src/utils/api.js', async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>()
  return { ...actual, fetchAPI: vi.fn() }
})

const { fetchAPI } = await import('../../src/utils/api.js')

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function jsonResponse(data: unknown, ok = true) {
  return { ok, json: async () => data } as Response
}

const FETCH_USER_URL = '/users?discordID=u1'
const VERIFY_URL = '/users/:discordID/verifications/token'
const GMODSTORE_URL = '/users/:discordID/gmod-store'
const DATA_REQ_URL = '/users/:discordID/data-requests'
const SESSIONS_URL = '/v6/auth/sessions'

function defaultSessions() {
  return [
    {
      id: 'session-current-123',
      lastSeenAt: '2024-01-05T10:00:00.000Z',
      ip: '1.2.3.4',
      os: 'Windows',
      browser: 'Chrome',
      country: 'FR',
      isCurrent: true,
    },
    {
      id: 'session-other-456',
      lastSeenAt: '2024-01-04T09:00:00.000Z',
      ip: '5.6.7.8',
      os: 'Linux',
      browser: 'Firefox',
      country: 'US',
      isCurrent: false,
    },
  ]
}

function defaultDataRequests() {
  return [
    {
      createdAt: '2024-01-01T00:00:00.000Z',
      expirationDate: new Date(Date.now() + 86400000).toISOString(),
      downloadLink: 'http://dl/active',
      code: 'active-code',
    },
    {
      createdAt: '2024-01-02T00:00:00.000Z',
      expirationDate: new Date(Date.now() - 86400000).toISOString(),
      downloadLink: 'http://dl/expired',
      code: 'expired-code',
    },
  ]
}

function setupFetchAPI({
  user = { id: 'u1' },
  gmodStore = {},
  dataRequests = [] as unknown[],
  sessions = [] as unknown[],
}: { user?: unknown; gmodStore?: unknown; dataRequests?: unknown[]; sessions?: unknown[] } = {}) {
  ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
    if (endpoint === FETCH_USER_URL && method === 'GET') return Promise.resolve(jsonResponse(user))
    if (endpoint === GMODSTORE_URL && method === 'GET') return Promise.resolve(jsonResponse(gmodStore))
    if (endpoint === DATA_REQ_URL && method === 'GET') return Promise.resolve(jsonResponse(dataRequests))
    if (endpoint === SESSIONS_URL && method === 'GET') return Promise.resolve(jsonResponse({ sessions }))
    return Promise.resolve(jsonResponse({}))
  })
}

function renderAccount() {
  return renderWithProviders(() => <Account />, { path: '/account', history: historyAt('/account') })
}

async function waitForLoaded() {
  await vi.waitFor(() => expect(document.querySelectorAll('.loading-spinner').length).toBe(0))
}

function stubLocation(href = 'http://localhost:3000/account') {
  const originalLocation = window.location
  Object.defineProperty(window, 'location', { configurable: true, value: { href }, writable: true })
  return () =>
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation, writable: true })
}

describe('pages/Account.tsx', () => {
  beforeEach(() => {
    resetAuthentication()
    window.localStorage.clear()
    window.sessionStorage.clear()
    setWebSocketSignal(null)
    setIsAdmin(false)
    setIsLogged(true)
    window.localStorage.setItem(
      'discordUser',
      JSON.stringify({ id: 'u1', username: 'bob', globalName: 'Bob', discriminator: '0' }),
    )
    ;(fetchAPI as Mock).mockReset()
    setupFetchAPI()
  })

  it('shows the discord id from the locally stored user', async () => {
    renderAccount()
    expect(screen.getByText('u1')).toBeInTheDocument()
  })
  it('displays the server-normalized cached avatar without treating it as a credential', () => {
    localStorage.setItem(
      'discordUser',
      JSON.stringify({ id: 'u1', username: 'bob', displayAvatarURL: 'https://cdn.discordapp.com/avatar.png' }),
    )
    renderAccount()
    expect(document.querySelector('img[src="https://cdn.discordapp.com/avatar.png"]')).toBeInTheDocument()
  })
  it('refreshes the Discord identity and avatar after the session profile updates', () => {
    renderAccount()
    acceptAuthSession({
      ...authSession()!,
      user: {
        ...authSession()!.user,
        globalName: 'Bob Updated',
        displayName: 'Bob Updated',
        avatarURL: 'https://cdn.discordapp.com/updated-avatar.webp',
        displayAvatarURL: 'https://cdn.discordapp.com/updated-avatar.webp',
      },
    })
    const identity = screen.getByRole('region', { name: /^Discord$/ })
    expect(within(identity).getByText('Bob Updated')).toBeInTheDocument()
    expect(identity.querySelector('img')).toHaveAttribute('src', 'https://cdn.discordapp.com/updated-avatar.webp')
  })

  it('rejects malformed session data while other optional resources retain their empty states', async () => {
    // Exercises the `res.json() || {}` fallback on the gmod-store/data-requests/sessions
    // resources (json() resolving to null is an edge case a malformed API response could hit).
    // Solid's <For> tolerates a non-array `each` by rendering nothing, so this doesn't crash.
    ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
      if (endpoint === FETCH_USER_URL && method === 'GET') return Promise.resolve(jsonResponse({ id: 'u1' }))
      return Promise.resolve({ ok: true, json: async () => null } as unknown as Response)
    })
    renderAccount()
    await waitForLoaded()
    expect(screen.getByRole('link', { name: 'Choose a Discord community' })).toBeInTheDocument()
    expect(
      screen.getAllByRole('status').filter((element) => element.textContent?.includes('Nothing to display yet.')),
    ).toHaveLength(1)
    expect(
      within(screen.getByRole('heading', { name: 'Manage Sessions' }).closest('.dashboard-panel')!).getByRole('alert'),
    ).toBeInTheDocument()
  })

  describe('steam panel', () => {
    it('retries the linked-account lookup after a temporary failure', async () => {
      const fallback = (fetchAPI as Mock).getMockImplementation()!
      ;(fetchAPI as Mock).mockImplementation((...args: unknown[]) =>
        args[0] === FETCH_USER_URL ? Promise.reject(new Error('Temporary outage')) : fallback(...args),
      )
      renderAccount()
      const panel = screen.getByRole('heading', { name: 'Steam' }).closest<HTMLElement>('.dashboard-panel')!
      await vi.waitFor(() => expect(within(panel).getByRole('button', { name: 'Try again' })).toBeEnabled())
      setupFetchAPI({ user: { id: 'u1', steamID64: '76500000000000000' } })
      await fireEvent.click(within(panel).getByRole('button', { name: 'Try again' }))
      await vi.waitFor(() => expect(within(panel).getByText('76500000000000000')).toBeInTheDocument())
    })
    it('shows a loading spinner while the steam user resource is pending', () => {
      ;(fetchAPI as Mock).mockReturnValue(new Promise(() => {}))
      renderAccount()
      const panel = screen.getByText('Steam').closest('.border.border-base-200.rounded-lg')!
      expect(panel.querySelector('.loading-spinner')).toBeInTheDocument()
    })

    it('shows a Link Steam Account button when the user has no linked steam id', async () => {
      setupFetchAPI({ user: { id: 'u1' } })
      renderAccount()
      await waitForLoaded()
      expect(screen.getByRole('button', { name: 'Link Steam Account' })).toBeInTheDocument()
    })

    it('shows the linked steam id when present', async () => {
      setupFetchAPI({ user: { id: 'u1', steamID64: '76500000000000000' } })
      renderAccount()
      await waitForLoaded()
      expect(screen.getByText('76500000000000000')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Link Steam Account' })).not.toBeInTheDocument()
    })

    it('fetches a verification token and redirects to steam on Link Steam Account click', async () => {
      const restore = stubLocation()
      setupFetchAPI({ user: { id: 'u1' } })
      renderAccount()
      await waitForLoaded()

      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === VERIFY_URL && method === 'GET') return Promise.resolve(jsonResponse({ token: 'tok123' }))
        return Promise.resolve(jsonResponse({}))
      })
      fireEvent.click(screen.getByRole('button', { name: 'Link Steam Account' }))

      await vi.waitFor(() => expect(window.location.href).toBe('http://localhost:5001/steam?verificationCode=tok123'))
      restore()
    })

    it('does not redirect when the verification token request fails', async () => {
      const restore = stubLocation()
      setupFetchAPI({ user: { id: 'u1' } })
      renderAccount()
      await waitForLoaded()

      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === VERIFY_URL && method === 'GET') return Promise.resolve(jsonResponse({}, false))
        return Promise.resolve(jsonResponse({}))
      })
      fireEvent.click(screen.getByRole('button', { name: 'Link Steam Account' }))

      await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(VERIFY_URL, 'GET'))
      expect(window.location.href).toBe('http://localhost:3000/account')
      restore()
    })

    it('triggers verification automatically on mount when the URL contains startVerification', async () => {
      const restore = stubLocation('http://localhost:3000/account?startVerification=1')
      setupFetchAPI({ user: { id: 'u1' } })
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === VERIFY_URL && method === 'GET') return Promise.resolve(jsonResponse({ token: 'auto-tok' }))
        return Promise.resolve(jsonResponse({}))
      })
      renderAccount()

      await vi.waitFor(() => expect(window.location.href).toBe('http://localhost:5001/steam?verificationCode=auto-tok'))
      restore()
    })
  })

  describe('gmod store purchase panel', () => {
    it('retries a temporary purchase lookup failure without changing the account', async () => {
      const fallback = (fetchAPI as Mock).getMockImplementation()!
      ;(fetchAPI as Mock).mockImplementation((...args: unknown[]) =>
        args[0] === GMODSTORE_URL ? Promise.reject(new Error('Temporary outage')) : fallback(...args),
      )
      renderAccount()
      const panel = screen
        .getByRole('heading', { name: 'Gmod Store Purchase' })
        .closest<HTMLElement>('.dashboard-panel')!
      await vi.waitFor(() => expect(within(panel).getByRole('button', { name: 'Try again' })).toBeEnabled())
      setupFetchAPI({ gmodStore: { guild: 'Recovered guild' } })
      await fireEvent.click(within(panel).getByRole('button', { name: 'Try again' }))
      await vi.waitFor(() => expect(within(panel).getByText('Recovered guild')).toBeInTheDocument())
      expect(JSON.parse(localStorage.getItem('discordUser')!).id).toBe('u1')
    })
    it('shows a loading spinner while the resource is pending', () => {
      ;(fetchAPI as Mock).mockImplementation((endpoint: string) => {
        if (endpoint === GMODSTORE_URL) return new Promise(() => {})
        return Promise.resolve(jsonResponse({}))
      })
      renderAccount()
      const panel = screen.getByText('Gmod Store Purchase').closest('.border.border-base-200.rounded-lg')!
      expect(panel.querySelector('.loading-spinner')).toBeInTheDocument()
    })

    it('shows the Buy Premium link when the purchase is revoked', async () => {
      setupFetchAPI({ gmodStore: { revoke: true } })
      renderAccount()
      await waitForLoaded()
      expect(screen.getByRole('link', { name: 'Buy Premium' })).toHaveAttribute('href', '/gmodstore')
    })

    it('shows the Activate on Guild link when not revoked and no guild is set', async () => {
      setupFetchAPI({ gmodStore: {} })
      renderAccount()
      await waitForLoaded()
      expect(screen.getByRole('link', { name: 'Choose a Discord community' })).toHaveAttribute(
        'href',
        '/dashboard/guilds',
      )
    })

    it('shows the guild and an Unlink Guild button when a guild is activated', async () => {
      setupFetchAPI({ gmodStore: { guild: 'My Guild' } })
      renderAccount()
      await waitForLoaded()
      expect(screen.getByText('My Guild')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Unlink the community' })).toBeInTheDocument()
    })

    it('does nothing when unlink is not confirmed', async () => {
      setupFetchAPI({ gmodStore: { guild: 'My Guild' } })
      vi.stubGlobal('confirm', vi.fn().mockReturnValue(false))
      renderAccount()
      await waitForLoaded()

      const callsBefore = (fetchAPI as Mock).mock.calls.length
      fireEvent.click(screen.getByRole('button', { name: 'Unlink the community' }))
      expect((fetchAPI as Mock).mock.calls.length).toBe(callsBefore)
    })

    it('unlinks the guild and refetches the purchase on success', async () => {
      setupFetchAPI({ gmodStore: { guild: 'My Guild' } })
      vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
      renderAccount()
      await waitForLoaded()

      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === `${GMODSTORE_URL}/My Guild` && method === 'DELETE') return Promise.resolve(jsonResponse({}))
        if (endpoint === GMODSTORE_URL && method === 'GET') return Promise.resolve(jsonResponse({}))
        return Promise.resolve(jsonResponse({}))
      })
      fireEvent.click(screen.getByRole('button', { name: 'Unlink the community' }))

      await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(`${GMODSTORE_URL}/My Guild`, 'DELETE'))
      await vi.waitFor(() =>
        expect(screen.getByRole('link', { name: 'Choose a Discord community' })).toBeInTheDocument(),
      )
    })

    it('shows a spinner on the unlink button while the request is in flight', async () => {
      setupFetchAPI({ gmodStore: { guild: 'My Guild' } })
      vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
      renderAccount()
      await waitForLoaded()

      let resolveDelete!: (v: unknown) => void
      const deletePromise = new Promise((resolve) => {
        resolveDelete = resolve
      })
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === `${GMODSTORE_URL}/My Guild` && method === 'DELETE') return deletePromise
        return Promise.resolve(jsonResponse({}))
      })
      const unlinkBtn = screen.getByRole('button', { name: 'Unlink the community' })
      fireEvent.click(unlinkBtn)

      await vi.waitFor(() => expect(unlinkBtn).toBeDisabled())
      expect(unlinkBtn.querySelector('.loading-spinner')).toBeInTheDocument()

      resolveDelete(jsonResponse({}))
      await vi.waitFor(() => expect(unlinkBtn).not.toBeDisabled())
    })

    it('shows an error with the server message when unlink fails', async () => {
      setupFetchAPI({ gmodStore: { guild: 'My Guild' } })
      vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
      renderAccount()
      await waitForLoaded()

      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === `${GMODSTORE_URL}/My Guild` && method === 'DELETE') {
          return Promise.resolve(jsonResponse({ error: 'Custom unlink error' }, false))
        }
        return Promise.resolve(jsonResponse({}))
      })
      fireEvent.click(screen.getByRole('button', { name: 'Unlink the community' }))

      await vi.waitFor(() => expect(screen.getByText(/Custom unlink error/)).toBeInTheDocument())
      // Failed unlink does not refetch/clear - guild link stays.
      expect(screen.getByText('My Guild')).toBeInTheDocument()
    })

    it('falls back to a default error message when unlink fails without a json body', async () => {
      setupFetchAPI({ gmodStore: { guild: 'My Guild' } })
      vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
      renderAccount()
      await waitForLoaded()

      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === `${GMODSTORE_URL}/My Guild` && method === 'DELETE') {
          return Promise.resolve(new Response('invalid JSON', { status: 500 }))
        }
        return Promise.resolve(jsonResponse({}))
      })
      fireEvent.click(screen.getByRole('button', { name: 'Unlink the community' }))

      await vi.waitFor(() => expect(screen.getByText(/The community could not be unlinked/)).toBeInTheDocument())
    })
  })

  describe('sessions panel', () => {
    it('shows a loading spinner while sessions are pending', () => {
      ;(fetchAPI as Mock).mockImplementation((endpoint: string) => {
        if (endpoint === SESSIONS_URL) return new Promise(() => {})
        return Promise.resolve(jsonResponse({}))
      })
      renderAccount()
      const panel = screen.getByText('Manage Sessions').closest('.border.border-base-200.rounded-lg')!
      expect(panel.querySelector('.loading-spinner')).toBeInTheDocument()
    })

    it('uses the server isCurrent marker for the current session and others as deletable', async () => {
      window.localStorage.setItem('accessToken', 'current-tok')
      setupFetchAPI({ sessions: defaultSessions() })
      renderAccount()
      await waitForLoaded()

      const rows = screen.getAllByRole('row')
      const currentRow = rows.find((r) => r.textContent?.includes('1.2.3.4'))!
      const otherRow = rows.find((r) => r.textContent?.includes('5.6.7.8'))!
      expect(currentRow.querySelector('svg[data-icon="user-check"]')).toBeInTheDocument()
      expect(currentRow.querySelector('svg[data-icon="trash-2"]')).not.toBeInTheDocument()
      expect(otherRow.querySelector('svg[data-icon="trash-2"]')).toBeInTheDocument()
      // session.id.substring(0, 8) - both fixture ids share the "session-" prefix.
      expect(within(currentRow).getByText('session-')).toBeInTheDocument()
      expect(within(otherRow).getByText('session-')).toBeInTheDocument()
    })

    it('deletes a non-current session on trash icon click', async () => {
      window.localStorage.setItem('accessToken', 'current-tok')
      setupFetchAPI({ sessions: defaultSessions() })
      renderAccount()
      await waitForLoaded()

      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === `${SESSIONS_URL}/session-other-456` && method === 'DELETE') {
          return Promise.resolve(jsonResponse({}))
        }
        return Promise.resolve(jsonResponse({}))
      })
      const otherRow = screen.getAllByRole('row').find((r) => r.textContent?.includes('5.6.7.8'))!
      fireEvent.click(otherRow.querySelector('svg[data-icon="trash-2"]')!)

      await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(`${SESSIONS_URL}/session-other-456`, 'DELETE'))
      await vi.waitFor(() => expect(screen.queryByText(/5\.6\.7\.8/)).not.toBeInTheDocument())
      expect(screen.getByText('1.2.3.4')).toBeInTheDocument()
    })

    it('keeps the session row when the delete request fails', async () => {
      window.localStorage.setItem('accessToken', 'current-tok')
      setupFetchAPI({ sessions: defaultSessions() })
      renderAccount()
      await waitForLoaded()

      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === `${SESSIONS_URL}/session-other-456` && method === 'DELETE') {
          return Promise.resolve(jsonResponse({}, false))
        }
        return Promise.resolve(jsonResponse({}))
      })
      const otherRow = screen.getAllByRole('row').find((r) => r.textContent?.includes('5.6.7.8'))!
      fireEvent.click(otherRow.querySelector('svg[data-icon="trash-2"]')!)

      await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(`${SESSIONS_URL}/session-other-456`, 'DELETE'))
      expect(screen.getByText('5.6.7.8')).toBeInTheDocument()
    })
  })

  it('paginates sessions and exports independently, reclamping after the last visible session is revoked', async () => {
    const sessions = Array.from({ length: 26 }, (_, index) => ({
      ...defaultSessions()[1],
      id: `session-${index + 1}`,
      ip: `10.0.0.${index + 1}`,
      isCurrent: index === 0,
    }))
    const dataRequests = Array.from({ length: 26 }, (_, index) => ({
      ...defaultDataRequests()[0],
      downloadLink: `https://data.example.test/export-${index + 1}`,
      code: `code-${index + 1}`,
    }))
    setupFetchAPI({ sessions, dataRequests })
    renderAccount()
    await waitForLoaded()
    const sessionCard = within(screen.getByRole('region', { name: 'Manage Sessions' }))
    const exportCard = within(screen.getByRole('region', { name: 'Manage Data' }))
    expect(sessionCard.getAllByRole('row')).toHaveLength(26)
    expect(exportCard.getAllByRole('row')).toHaveLength(26)
    expect(sessionCard.getByRole('navigation', { name: 'Pagination' }).closest('table')).toBeNull()
    expect(exportCard.getByRole('navigation', { name: 'Pagination' }).closest('table')).toBeNull()
    await fireEvent.click(sessionCard.getByRole('button', { name: 'Next page' }))
    expect(sessionCard.getByText('10.0.0.26')).toBeInTheDocument()
    expect(exportCard.getByRole('button', { name: 'Page 1 of 2' })).toBeInTheDocument()
    await fireEvent.click(exportCard.getByRole('button', { name: 'Next page' }))
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    await fireEvent.click(exportCard.getByRole('button', { name: 'Download your data' }))
    expect(open).toHaveBeenCalledWith('https://data.example.test/export-26?code=code-26')
    await fireEvent.click(sessionCard.getByRole('button', { name: 'Sign out this session' }))
    await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(`${SESSIONS_URL}/session-26`, 'DELETE'))
    await vi.waitFor(() => expect(sessionCard.getByText('10.0.0.1')).toBeInTheDocument())
    expect(sessionCard.queryByText('10.0.0.26')).not.toBeInTheDocument()
    expect(sessionCard.queryByRole('navigation', { name: 'Pagination' })).not.toBeInTheDocument()
    expect(exportCard.getByRole('button', { name: 'Page 2 of 2' })).toBeInTheDocument()
  })

  it('shows a newly prepared export even when it belongs on a later page', async () => {
    const dataRequests = Array.from({ length: 26 }, (_, index) => ({
      ...defaultDataRequests()[0],
      downloadLink: `https://data.example.test/export-${index + 1}`,
      code: `code-${index + 1}`,
    }))
    setupFetchAPI({ dataRequests })
    renderAccount()
    await waitForLoaded()
    const card = within(screen.getByRole('region', { name: 'Manage Data' }))
    expect(card.getByRole('button', { name: 'Page 1 of 2' })).toBeInTheDocument()
    ;(fetchAPI as Mock).mockResolvedValueOnce(
      jsonResponse({
        ...defaultDataRequests()[0],
        downloadLink: 'https://data.example.test/new-export',
        code: 'new-code',
      }),
    )
    await fireEvent.click(card.getByRole('button', { name: 'Prepare a copy of my data' }))
    await vi.waitFor(() => expect(card.getByRole('button', { name: 'Page 2 of 2' })).toBeInTheDocument())
    expect(card.getAllByRole('row')).toHaveLength(3)
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    await fireEvent.click(card.getAllByRole('button', { name: 'Download your data' })[1])
    expect(open).toHaveBeenCalledWith('https://data.example.test/new-export?code=new-code')
  })

  describe('data requests panel', () => {
    it('shows Active for a non-expired request and Expired for an expired one, with matching action icons', async () => {
      setupFetchAPI({ dataRequests: defaultDataRequests() })
      renderAccount()
      await waitForLoaded()

      expect(screen.getByText('Download available')).toBeInTheDocument()
      expect(screen.getByText('Download expired')).toBeInTheDocument()
      expect(document.querySelector('[data-tip="Download your data"] svg[data-icon="download"]')).toBeInTheDocument()
      expect(
        document.querySelector(
          '[data-tip="This download link has expired. Request a new copy of your data."] svg[data-icon="download"]',
        ),
      ).toBeInTheDocument()
    })

    it('opens the download link with its code for an active request', async () => {
      setupFetchAPI({ dataRequests: [defaultDataRequests()[0]] })
      renderAccount()
      await waitForLoaded()

      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
      fireEvent.click(document.querySelector('[data-tip="Download your data"] svg[data-icon="download"]')!)
      expect(openSpy).toHaveBeenCalledWith('http://dl/active?code=active-code')
    })

    it('creates a data request and appends it to the list when the response is fast', async () => {
      setupFetchAPI({ dataRequests: [] })
      renderAccount()
      await waitForLoaded()

      const newRequest = {
        createdAt: new Date().toISOString(),
        expirationDate: new Date(Date.now() + 86400000).toISOString(),
        downloadLink: 'http://dl/new',
        code: 'new-code',
      }
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === DATA_REQ_URL && method === 'POST') return Promise.resolve(jsonResponse(newRequest))
        return Promise.resolve(jsonResponse([]))
      })
      fireEvent.click(screen.getByRole('button', { name: 'Prepare a copy of my data' }))

      await vi.waitFor(() => expect(screen.getByText('Download available')).toBeInTheDocument())
      expect(
        screen.queryByText('Preparing your data export. The time needed depends on the amount of data.'),
      ).not.toBeInTheDocument()
    })

    it('does not show the loading message when the 500ms timer fires after the request already resolved', async () => {
      setupFetchAPI({ dataRequests: [] })
      renderAccount()
      await waitForLoaded()

      const newRequest = {
        createdAt: new Date().toISOString(),
        expirationDate: new Date(Date.now() + 86400000).toISOString(),
      }
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === DATA_REQ_URL && method === 'POST') return Promise.resolve(jsonResponse(newRequest))
        return Promise.resolve(jsonResponse([]))
      })

      vi.useFakeTimers()
      fireEvent.click(screen.getByRole('button', { name: 'Prepare a copy of my data' }))
      // advanceTimersByTimeAsync flushes the already-resolved POST promise's microtasks (setting
      // the closure's `edited` flag) before the 500ms setTimeout callback runs, so the callback's
      // `if (edited) return` takes its early-return branch instead of showing the spinner.
      await vi.advanceTimersByTimeAsync(500)
      vi.useRealTimers()

      expect(
        screen.queryByText('Preparing your data export. The time needed depends on the amount of data.'),
      ).not.toBeInTheDocument()
    })

    it('shows a loading message for a slow data request and hides it once resolved', async () => {
      setupFetchAPI({ dataRequests: [] })
      renderAccount()
      await waitForLoaded()

      let resolvePost!: (v: unknown) => void
      const postPromise = new Promise((resolve) => {
        resolvePost = resolve
      })
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === DATA_REQ_URL && method === 'POST') return postPromise
        return Promise.resolve(jsonResponse([]))
      })

      vi.useFakeTimers()
      const requestButton = screen.getByRole('button', { name: 'Prepare a copy of my data' })
      fireEvent.click(requestButton)
      expect(requestButton).toBeDisabled()
      fireEvent.click(requestButton)
      expect(
        (fetchAPI as Mock).mock.calls.filter(([endpoint, method]) => endpoint === DATA_REQ_URL && method === 'POST'),
      ).toHaveLength(1)
      await vi.advanceTimersByTimeAsync(500)
      expect(
        screen.getByText('Preparing your data export. The time needed depends on the amount of data.'),
      ).toBeInTheDocument()

      resolvePost(
        jsonResponse({
          createdAt: new Date().toISOString(),
          expirationDate: new Date(Date.now() + 86400000).toISOString(),
        }),
      )
      await vi.advanceTimersByTimeAsync(0)
      vi.useRealTimers()

      await vi.waitFor(() =>
        expect(
          screen.queryByText('Preparing your data export. The time needed depends on the amount of data.'),
        ).not.toBeInTheDocument(),
      )
    })

    it('shows an error with the server message when creating a data request fails', async () => {
      setupFetchAPI({ dataRequests: [] })
      renderAccount()
      await waitForLoaded()

      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === DATA_REQ_URL && method === 'POST') {
          return Promise.resolve(jsonResponse({ error: 'Too many requests' }, false))
        }
        return Promise.resolve(jsonResponse([]))
      })
      fireEvent.click(screen.getByRole('button', { name: 'Prepare a copy of my data' }))

      await vi.waitFor(() => expect(screen.getByText(/Too many requests/)).toBeInTheDocument())
    })

    it('shows a default error message when creating a data request fails without a server message', async () => {
      setupFetchAPI({ dataRequests: [] })
      renderAccount()
      await waitForLoaded()

      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === DATA_REQ_URL && method === 'POST') return Promise.resolve(jsonResponse({}, false))
        return Promise.resolve(jsonResponse([]))
      })
      fireEvent.click(screen.getByRole('button', { name: 'Prepare a copy of my data' }))

      await vi.waitFor(() => expect(screen.getByText(/Your data export could not be prepared/)).toBeInTheDocument())
    })

    describe('account erasure', () => {
      const storedReceipt = () =>
        JSON.parse(localStorage.getItem(ERASURE_RECEIPT_KEY)!) as { requestId: string; receipt: string }
      const statusResponse = (status: 'pending' | 'running' | 'retry' | 'completed' = 'pending') => ({
        requestId: storedReceipt().requestId,
        status,
        requestedAt: '2026-11-21T10:00:00.000Z',
        completedAt: status === 'completed' ? '2026-11-21T10:00:30.000Z' : null,
      })
      const response = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
      const saveReceipt = () => {
        const receipt = { requestId: '00000000-0000-4000-8000-000000000001', receipt: 'a'.repeat(64) }
        localStorage.setItem(ERASURE_RECEIPT_KEY, JSON.stringify(receipt))
        return receipt
      }
      const openDialog = async () => {
        await fireEvent.click(screen.getByRole('button', { name: 'Request account erasure' }))
        return screen.getByRole('dialog', { name: 'Request account erasure' })
      }
      const confirmErasure = async () => {
        const dialog = await openDialog()
        await fireEvent.input(within(dialog).getByLabelText('Type DELETE to confirm'), { target: { value: 'DELETE' } })
        await fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm erasure request' }))
        return dialog
      }

      it('requires exact confirmation and allows canceling before sending', async () => {
        const fetchMock = vi.fn()
        vi.stubGlobal('fetch', fetchMock)
        renderAccount()
        await waitForLoaded()
        const dialog = await openDialog()
        const input = within(dialog).getByLabelText('Type DELETE to confirm')
        const confirm = within(dialog).getByRole('button', { name: 'Confirm erasure request' })
        expect(confirm).toBeDisabled()
        await fireEvent.input(input, { target: { value: 'delete' } })
        expect(confirm).toBeDisabled()
        await fireEvent.input(input, { target: { value: 'DELETE' } })
        expect(confirm).not.toBeDisabled()
        await fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
        expect(dialog).not.toHaveAttribute('open')
        expect(fetchMock).not.toHaveBeenCalled()
        expect(localStorage.getItem(ERASURE_RECEIPT_KEY)).toBeNull()
        await openDialog()
        expect(input).toHaveValue('')
      })

      it('locks pending submission, saves the receipt first, then signs out without reporting completion on 202', async () => {
        localStorage.setItem('accessToken', 'current-tok')
        localStorage.setItem('discordID', 'u1')
        localStorage.setItem('oldAccessToken', 'impersonated-token')
        localStorage.setItem('guilds', JSON.stringify({ id: 'g1' }))
        localStorage.setItem('locale', 'en')
        localStorage.setItem('theme', 'dark')
        sessionStorage.setItem('private-cache', 'old identity')
        setIsAdmin(true)
        updateNotificationCount(4)
        setWebSocketLogsMessages([{ private: 'old log' }])
        const remove = vi.spyOn(localStorage, 'removeItem')
        const close = vi.fn()
        setWebSocketSignal({ close, onmessage: vi.fn(), onclose: vi.fn(), onerror: vi.fn() } as unknown as WebSocket)
        let resolvePost!: (value: Response) => void
        const fetchMock = vi.fn((url: string, init: RequestInit) => {
          if (init.method === 'POST') {
            expect(storedReceipt().receipt).toMatch(/^[a-f0-9]{64}$/)
            expect(JSON.parse(String(init.body))).toEqual({
              confirmation: 'DELETE',
              idempotencyKey: storedReceipt().requestId,
              receipt: storedReceipt().receipt,
            })
            return new Promise<Response>((resolve) => {
              resolvePost = resolve
            })
          }
          return Promise.resolve(response(statusResponse()))
        })
        vi.stubGlobal('fetch', fetchMock)
        renderAccount()
        await waitForLoaded()
        const dialog = await confirmErasure()
        const confirm = within(dialog).getByRole('button', { name: 'Confirm erasure request' })
        expect(confirm).toBeDisabled()
        expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled()
        expect(within(dialog).getByRole('button', { name: 'Close' })).toBeDisabled()
        await fireEvent.click(confirm)
        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(localStorage.getItem('accessToken')).toBe('current-tok')
        resolvePost(response({ ...statusResponse(), receipt: storedReceipt().receipt }, 202))
        await vi.waitFor(() => expect(document.querySelector('[data-erasure-status="pending"]')).toBeInTheDocument())
        expect(screen.queryByText('The requested erasure is complete.')).not.toBeInTheDocument()
        expect(isLogged()).toBe(false)
        expect(isAdmin()).toBe(false)
        expect(discordUser().id).toBe('')
        expect(close).toHaveBeenCalledTimes(1)
        expect(webSocketSignal()).toBeNull()
        expect(webSocketLogsMessages()).toEqual([])
        expect(notificationCount()).toBe(0)
        expect(Object.keys(localStorage).sort()).toEqual(
          [ERASURE_RECEIPT_KEY, AUTH_STORAGE_KEY, 'locale', 'theme'].sort(),
        )
        expect(JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY)!)).toEqual({
          nonce: expect.any(String),
          at: expect.any(Number),
        })
        expect(localStorage.getItem('theme')).toBe('dark')
        expect(remove).not.toHaveBeenCalledWith(ERASURE_RECEIPT_KEY)
        expect(sessionStorage.length).toBe(0)
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining('/v6/account/erasure-requests/'),
          expect.objectContaining({ method: 'GET', headers: { Authorization: `Bearer ${storedReceipt().receipt}` } }),
        )
        expect(screen.queryByRole('button', { name: 'Prepare a copy of my data' })).not.toBeInTheDocument()
      })

      it('keeps the session on failure and reuses the same idempotency key and receipt on retry', async () => {
        localStorage.setItem('accessToken', 'current-tok')
        let posts = 0
        const bodies: string[] = []
        const fetchMock = vi.fn((url: string, init: RequestInit) => {
          if (init.method === 'POST') {
            bodies.push(String(init.body))
            return Promise.resolve(
              ++posts === 1
                ? response({}, 500)
                : response({ ...statusResponse(), receipt: storedReceipt().receipt }, 202),
            )
          }
          return Promise.resolve(posts === 1 ? response({}, 404) : response(statusResponse()))
        })
        vi.stubGlobal('fetch', fetchMock)
        renderAccount()
        await waitForLoaded()
        const dialog = await confirmErasure()
        await vi.waitFor(() => expect(within(dialog).getByRole('alert')).toBeInTheDocument())
        expect(isLogged()).toBe(true)
        expect(localStorage.getItem('accessToken')).toBe('current-tok')
        expect(dialog).toHaveAttribute('open')
        await fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm erasure request' }))
        await vi.waitFor(() => expect(document.querySelector('[data-erasure-status="pending"]')).toBeInTheDocument())
        expect(posts).toBe(2)
        expect(bodies[1]).toBe(bodies[0])
      })

      it('recovers a lost POST acknowledgement through the receipt without submitting again', async () => {
        localStorage.setItem('accessToken', 'current-tok')
        const fetchMock = vi.fn((url: string, init: RequestInit) =>
          init.method === 'POST'
            ? Promise.reject(new Error('response lost'))
            : Promise.resolve(response(statusResponse('running'))),
        )
        vi.stubGlobal('fetch', fetchMock)
        renderAccount()
        await waitForLoaded()
        await confirmErasure()
        await vi.waitFor(() => expect(document.querySelector('[data-erasure-status="running"]')).toBeInTheDocument())
        expect(fetchMock.mock.calls.filter(([, init]) => init.method === 'POST')).toHaveLength(1)
        expect(isLogged()).toBe(false)
        expect(localStorage.getItem('accessToken')).toBeNull()
        expect(screen.queryByText('The requested erasure is complete.')).not.toBeInTheDocument()
      })

      it('resumes receipt-only tracking after reload and only reports success once completed', async () => {
        saveReceipt()
        setIsLogged(false)
        let checks = 0
        const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(() =>
          Promise.resolve(response(statusResponse(++checks === 1 ? 'pending' : checks === 2 ? 'retry' : 'completed'))),
        )
        vi.stubGlobal('fetch', fetchMock)
        vi.useFakeTimers()
        renderAccount()
        await vi.advanceTimersByTimeAsync(0)
        expect(document.querySelector('[data-erasure-status="pending"]')).toBeInTheDocument()
        expect(fetchAPI).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(5000)
        expect(document.querySelector('[data-erasure-status="retry"]')).toBeInTheDocument()
        expect(
          screen.getByText(
            'Your request is kept. Processing will resume automatically; you do not need to submit another request.',
          ),
        ).toBeInTheDocument()
        expect(screen.queryByText('The requested erasure is complete.')).not.toBeInTheDocument()
        await vi.advanceTimersByTimeAsync(5000)
        expect(screen.getByText('The requested erasure is complete.')).toBeInTheDocument()
        await vi.advanceTimersByTimeAsync(60_000)
        expect(fetchMock).toHaveBeenCalledTimes(3)
        expect(fetchMock.mock.calls.every(([, init]) => (init as RequestInit).method === 'GET')).toBe(true)
      })

      it('bounds automatic polling and resumes GET-only tracking on demand, then cleans up on unmount', async () => {
        saveReceipt()
        setIsLogged(false)
        const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(() =>
          Promise.resolve(response(statusResponse())),
        )
        vi.stubGlobal('fetch', fetchMock)
        vi.useFakeTimers()
        const { unmount } = renderAccount()
        await vi.advanceTimersByTimeAsync(65_000)
        expect(fetchMock).toHaveBeenCalledTimes(12)
        expect(
          screen.getByText(
            'Automatic checks have paused. Your request remains active; check again to resume following it.',
          ),
        ).toBeInTheDocument()
        await fireEvent.click(screen.getByRole('button', { name: 'Check status again' }))
        await vi.advanceTimersByTimeAsync(0)
        expect(fetchMock).toHaveBeenCalledTimes(13)
        const signal = (fetchMock.mock.calls.at(-1)![1] as RequestInit).signal!
        unmount()
        expect(signal.aborted).toBe(true)
        await vi.advanceTimersByTimeAsync(60_000)
        expect(fetchMock).toHaveBeenCalledTimes(13)
      })

      it('retries status errors using the receipt and forgets it only when signing in after completion', async () => {
        saveReceipt()
        setIsLogged(false)
        const fetchMock = vi
          .fn()
          .mockRejectedValueOnce(new Error('network'))
          .mockImplementation(() => Promise.resolve(response(statusResponse('completed'))))
        vi.stubGlobal('fetch', fetchMock)
        renderAccount()
        await vi.waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
        await fireEvent.click(screen.getByRole('button', { name: 'Check status again' }))
        await vi.waitFor(() => expect(screen.getByText('The requested erasure is complete.')).toBeInTheDocument())
        expect(fetchMock.mock.calls.every(([, init]) => (init as RequestInit).method === 'GET')).toBe(true)
        expect(localStorage.getItem(ERASURE_RECEIPT_KEY)).not.toBeNull()
        await fireEvent.click(screen.getByRole('link', { name: 'Sign in to create a new account' }))
        expect(localStorage.getItem(ERASURE_RECEIPT_KEY)).toBeNull()
      })

      it('does not purge an unconfirmed session when a previously saved receipt cannot be verified', async () => {
        saveReceipt()
        localStorage.setItem('accessToken', 'current-tok')
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({}, 404)))
        renderAccount()
        await vi.waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
        expect(localStorage.getItem('accessToken')).toBe('current-tok')
        expect(isLogged()).toBe(true)
        await fireEvent.click(screen.getByRole('button', { name: 'Return to account' }))
        await waitForLoaded()
        expect(screen.getByRole('button', { name: 'Request account erasure' })).toBeInTheDocument()
      })
    })
  })
})
