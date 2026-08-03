import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@solidjs/testing-library'
import { renderWithProviders } from '../testUtils.js'
import { setIsLogged } from '../../src/utils/event.js'
import Account from '../../src/pages/Account.js'

vi.mock('../../src/utils/api.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/utils/api.js')>()
  return { ...actual, fetchAPI: vi.fn() }
})

const { fetchAPI } = await import('../../src/utils/api.js')

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function jsonResponse(data: unknown, ok = true) {
  return { ok, json: async () => data } as Response
}

const FETCH_USER_URL = '/users?discordID=u1'
const VERIFY_URL = '/users/:discordID/verifications/token'
const GMODSTORE_URL = '/users/:discordID/gmod-store'
const DATA_REQ_URL = '/users/:discordID/data-requests'
const SESSIONS_URL = '/users/:discordID/sessions'

function defaultSessions() {
  return [
    {
      id: 'session-current-123',
      updatedAt: '2024-01-05T10:00:00.000Z',
      ip: '1.2.3.4',
      os: 'Windows',
      browser: 'Chrome',
      country: 'FR',
      accessToken: 'current-tok',
    },
    {
      id: 'session-other-456',
      updatedAt: '2024-01-04T09:00:00.000Z',
      ip: '5.6.7.8',
      os: 'Linux',
      browser: 'Firefox',
      country: 'US',
      accessToken: 'other-tok',
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
    if (endpoint === SESSIONS_URL && method === 'GET') return Promise.resolve(jsonResponse(sessions))
    return Promise.resolve(jsonResponse({}))
  })
}

function renderAccount() {
  return renderWithProviders(() => <Account />)
}

async function waitForLoaded() {
  await vi.waitFor(() => expect(document.querySelectorAll('.loading-spinner').length).toBe(0))
}

function stubLocation(href = 'http://localhost:3000/account') {
  const originalLocation = window.location
  Object.defineProperty(window, 'location', { configurable: true, value: { href }, writable: true })
  return () => Object.defineProperty(window, 'location', { configurable: true, value: originalLocation, writable: true })
}

describe('pages/Account.tsx', () => {
  beforeEach(() => {
    window.localStorage.clear()
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

  it('falls back to an empty object/list for every resource when its response body is falsy', async () => {
    // Exercises the `res.json() || {}` fallback on the gmod-store/data-requests/sessions
    // resources (json() resolving to null is an edge case a malformed API response could hit).
    // Solid's <For> tolerates a non-array `each` by rendering nothing, so this doesn't crash.
    ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
      if (endpoint === FETCH_USER_URL && method === 'GET') return Promise.resolve(jsonResponse({ id: 'u1' }))
      return Promise.resolve({ ok: true, json: async () => null } as unknown as Response)
    })
    renderAccount()
    await waitForLoaded()
    expect(screen.getByRole('link', { name: 'Activate on Guild' })).toBeInTheDocument()
    expect(screen.queryAllByRole('row')).toHaveLength(2) // just the two table header rows
  })

  describe('steam panel', () => {
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

      await vi.waitFor(() =>
        expect(window.location.href).toBe('http://localhost:5001/steam?verificationCode=tok123'),
      )
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

      await vi.waitFor(() =>
        expect(window.location.href).toBe('http://localhost:5001/steam?verificationCode=auto-tok'),
      )
      restore()
    })
  })

  describe('gmod store purchase panel', () => {
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
      expect(screen.getByRole('link', { name: 'Activate on Guild' })).toHaveAttribute('href', '/dashboard/guilds')
    })

    it('shows the guild and an Unlink Guild button when a guild is activated', async () => {
      setupFetchAPI({ gmodStore: { guild: 'My Guild' } })
      renderAccount()
      await waitForLoaded()
      expect(screen.getByText('My Guild')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Unlink Guild' })).toBeInTheDocument()
    })

    it('does nothing when unlink is not confirmed', async () => {
      setupFetchAPI({ gmodStore: { guild: 'My Guild' } })
      vi.stubGlobal('confirm', vi.fn().mockReturnValue(false))
      renderAccount()
      await waitForLoaded()

      const callsBefore = (fetchAPI as Mock).mock.calls.length
      fireEvent.click(screen.getByRole('button', { name: 'Unlink Guild' }))
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
      fireEvent.click(screen.getByRole('button', { name: 'Unlink Guild' }))

      await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(`${GMODSTORE_URL}/My Guild`, 'DELETE'))
      await vi.waitFor(() => expect(screen.getByRole('link', { name: 'Activate on Guild' })).toBeInTheDocument())
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
      const unlinkBtn = screen.getByRole('button', { name: 'Unlink Guild' })
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
      fireEvent.click(screen.getByRole('button', { name: 'Unlink Guild' }))

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
          return Promise.resolve({ ok: false, json: async () => Promise.reject(new Error('bad json')) } as Response)
        }
        return Promise.resolve(jsonResponse({}))
      })
      fireEvent.click(screen.getByRole('button', { name: 'Unlink Guild' }))

      await vi.waitFor(() => expect(screen.getByText(/Failed to unlink the guild/)).toBeInTheDocument())
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

    it('marks the session matching the local accessToken as current and others as deletable', async () => {
      window.localStorage.setItem('accessToken', 'current-tok')
      setupFetchAPI({ sessions: defaultSessions() })
      renderAccount()
      await waitForLoaded()

      const rows = screen.getAllByRole('row')
      const currentRow = rows.find((r) => r.textContent?.includes('1.2.3.4'))!
      const otherRow = rows.find((r) => r.textContent?.includes('5.6.7.8'))!
      expect(currentRow.querySelector('.fa-user-check')).toBeInTheDocument()
      expect(currentRow.querySelector('.fa-trash')).not.toBeInTheDocument()
      expect(otherRow.querySelector('.fa-trash')).toBeInTheDocument()
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
      fireEvent.click(otherRow.querySelector('.fa-trash')!)

      await vi.waitFor(() =>
        expect(fetchAPI).toHaveBeenCalledWith(`${SESSIONS_URL}/session-other-456`, 'DELETE'),
      )
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
      fireEvent.click(otherRow.querySelector('.fa-trash')!)

      await vi.waitFor(() =>
        expect(fetchAPI).toHaveBeenCalledWith(`${SESSIONS_URL}/session-other-456`, 'DELETE'),
      )
      expect(screen.getByText('5.6.7.8')).toBeInTheDocument()
    })
  })

  describe('data requests panel', () => {
    it('shows Active for a non-expired request and Expired for an expired one, with matching action icons', async () => {
      setupFetchAPI({ dataRequests: defaultDataRequests() })
      renderAccount()
      await waitForLoaded()

      expect(screen.getByText('Active')).toBeInTheDocument()
      expect(screen.getByText('Expired')).toBeInTheDocument()
      expect(document.querySelector('[data-tip="Download your data"] .fa-download')).toBeInTheDocument()
      expect(document.querySelector('[data-tip="Request has expired"] .fa-download')).toBeInTheDocument()
    })

    it('opens the download link with its code for an active request', async () => {
      setupFetchAPI({ dataRequests: [defaultDataRequests()[0]] })
      renderAccount()
      await waitForLoaded()

      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
      fireEvent.click(document.querySelector('[data-tip="Download your data"] .fa-download')!)
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
      fireEvent.click(screen.getByRole('button', { name: 'Request my Data' }))

      await vi.waitFor(() => expect(screen.getByText('Active')).toBeInTheDocument())
      expect(
        screen.queryByText('Depends on your data size, this can take a while.'),
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
      fireEvent.click(screen.getByRole('button', { name: 'Request my Data' }))
      // advanceTimersByTimeAsync flushes the already-resolved POST promise's microtasks (setting
      // the closure's `edited` flag) before the 500ms setTimeout callback runs, so the callback's
      // `if (edited) return` takes its early-return branch instead of showing the spinner.
      await vi.advanceTimersByTimeAsync(500)
      vi.useRealTimers()

      expect(screen.queryByText('Depends on your data size, this can take a while.')).not.toBeInTheDocument()
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
      fireEvent.click(screen.getByRole('button', { name: 'Request my Data' }))
      await vi.advanceTimersByTimeAsync(500)
      expect(screen.getByText('Depends on your data size, this can take a while.')).toBeInTheDocument()

      resolvePost(
        jsonResponse({
          createdAt: new Date().toISOString(),
          expirationDate: new Date(Date.now() + 86400000).toISOString(),
        }),
      )
      await vi.advanceTimersByTimeAsync(0)
      vi.useRealTimers()

      await vi.waitFor(() =>
        expect(screen.queryByText('Depends on your data size, this can take a while.')).not.toBeInTheDocument(),
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
      fireEvent.click(screen.getByRole('button', { name: 'Request my Data' }))

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
      fireEvent.click(screen.getByRole('button', { name: 'Request my Data' }))

      await vi.waitFor(() =>
        expect(screen.getByText(/Failed to create the data request/)).toBeInTheDocument(),
      )
    })

    it('renders the delete-my-data mailto link', async () => {
      renderAccount()
      await waitForLoaded()
      expect(screen.getByRole('link', { name: 'Delete my Data' })).toHaveAttribute(
        'href',
        'mailto:contact@gmod-integration.com',
      )
    })
  })
})
