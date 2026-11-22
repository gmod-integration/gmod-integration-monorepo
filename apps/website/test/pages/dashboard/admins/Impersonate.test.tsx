import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@solidjs/testing-library'
import { historyAt, renderWithProviders } from '../../../testUtils.js'
import { acceptAuthSession } from '../../../../src/utils/authClient.js'
import { sessionFixture } from '../../../authFixture.js'
import { fetchAPI } from '../../../../src/utils/api.js'
import Impersonate from '../../../../src/pages/dashboard/admins/Impersonate.js'
import { adminIdentity, mockDirectory, response, userRow } from './accountFixtures.js'

vi.mock('../../../../src/utils/api.js', async (original) => ({ ...(await original<object>()), fetchAPI: vi.fn() }))
beforeEach(() => {
  adminIdentity()
  vi.mocked(fetchAPI).mockReset()
  mockDirectory([userRow('u1', 'Self'), userRow()])
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
function renderPage(path = '/dashboard/admins/impersonate') {
  const history = historyAt(path)
  renderWithProviders(
    () => (
      <div>
        <Impersonate />
      </div>
    ),
    { path: '*', history, session: false },
  )
  return history
}
function delegated() {
  return sessionFixture({
    user: { ...sessionFixture().user, id: userRow().id },
    session: { ...sessionFixture().session, id: 'delegated', actorDiscordID: 'u1' },
  })
}

describe('administrative support access', () => {
  it('requires confirmation before delegation and preserves preferences and native CSRF/cookie transport', async () => {
    localStorage.setItem('theme', 'dark')
    const network = vi.fn().mockResolvedValue(response(delegated()))
    vi.stubGlobal('fetch', network)
    const history = renderPage()
    await fireEvent.click(await screen.findByRole('button', { name: 'Access Target' }))
    expect(network).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Access Self' })).not.toBeInTheDocument()
    const dialog = screen.getByRole('dialog', { name: 'Access Target for support?' })
    expect(within(dialog).getByText(/Changes affect this user’s communities and servers/)).toBeInTheDocument()
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Begin support access' }))
    await vi.waitFor(() => expect(history.get()).toBe('/dashboard/guilds'))
    expect(network.mock.calls[0][0]).toBe('http://localhost:5001/v6/auth/impersonations')
    expect(network.mock.calls[0][1].body).toBe(JSON.stringify({ discordID: userRow().id }))
    expect(network.mock.calls[0][1].credentials).toBe('include')
    expect(new Headers(network.mock.calls[0][1].headers).get('X-CSRF-Token')).toBe('csrf-token')
    expect(localStorage.getItem('theme')).toBe('dark')
    expect(localStorage.getItem('oldAccessToken')).toBeNull()
  })

  it('cancels support selection without creating a delegated session', async () => {
    const network = vi.fn()
    vi.stubGlobal('fetch', network)
    renderPage()
    await fireEvent.click(await screen.findByRole('button', { name: 'Access Target' }))
    const dialog = screen.getByRole('dialog', { name: 'Access Target for support?' })
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(dialog).not.toHaveAttribute('open')
    expect(network).not.toHaveBeenCalled()
    expect(localStorage.getItem('discordID')).toBe('u1')
  })

  it('requests subsequent server pages and uses a user link as its initial search', async () => {
    mockDirectory(
      Array.from({ length: 26 }, (_, index) =>
        userRow(`1234567890123456${String(index).padStart(2, '0')}`, `Account ${index + 1}`),
      ),
    )
    renderPage()
    await screen.findByText('@Account 1')
    await fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    await screen.findByText('@Account 26')
    expect(fetchAPI).toHaveBeenLastCalledWith(expect.stringContaining('offset=25'), 'GET')
    cleanup()
    vi.mocked(fetchAPI).mockClear()
    mockDirectory()
    renderPage('/dashboard/admins/impersonate?user=123456789012345678')
    await screen.findByText('@Target')
    expect(fetchAPI).toHaveBeenCalledWith(expect.stringContaining('search=123456789012345678'), 'GET')
  })

  it('keeps a rejected support request open and leaves the own session unchanged', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({}, 403)))
    const history = renderPage()
    await fireEvent.click(await screen.findByRole('button', { name: 'Access Target' }))
    const dialog = screen.getByRole('dialog', { name: 'Access Target for support?' })
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Begin support access' }))
    await vi.waitFor(() => expect(within(dialog).getByRole('alert')).toBeInTheDocument())
    expect(dialog).toHaveAttribute('open')
    expect(localStorage.getItem('discordID')).toBe('u1')
    expect(history.get()).toBe('/dashboard/admins/impersonate')
  })

  it('retries a failed user-directory load without treating it as empty', async () => {
    const directory = vi.mocked(fetchAPI).getMockImplementation()!
    vi.mocked(fetchAPI).mockResolvedValueOnce(response({}, 503)).mockImplementation(directory)
    renderPage()
    await vi.waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.queryByText('No accounts match these filters.')).not.toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByText('@Target')
  })

  it('returns through the dedicated stop route and preserves a delegated identity on failure', async () => {
    acceptAuthSession(delegated())
    const network = vi
      .fn()
      .mockResolvedValueOnce(response({}, 503))
      .mockResolvedValueOnce(response(sessionFixture({ user: { ...sessionFixture().user, rank: 'developer' } })))
    vi.stubGlobal('fetch', network)
    const history = renderPage('/dashboard/admins/stop-impersonate')
    await vi.waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(fetchAPI).not.toHaveBeenCalled()
    expect(localStorage.getItem('discordID')).toBe(userRow().id)
    await fireEvent.click(screen.getByRole('button', { name: 'Return to your account' }))
    await vi.waitFor(() => expect(history.get()).toBe('/dashboard/admins/impersonate'))
    expect(network.mock.calls.map(([url]) => url)).toEqual([
      'http://localhost:5001/v6/auth/impersonations/end',
      'http://localhost:5001/v6/auth/impersonations/end',
    ])
    expect(localStorage.getItem('discordID')).toBe('u1')
  })
})
