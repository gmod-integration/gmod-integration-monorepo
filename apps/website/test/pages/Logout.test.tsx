import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@solidjs/testing-library'
import { historyAt, renderWithProviders } from '../testUtils.js'
import { discordUser, isLogged, setDiscordUser, setIsLogged } from '../../src/utils/event.js'
import Logout from '../../src/pages/Logout.js'
import { ERASURE_RECEIPT_KEY } from '../../src/utils/accountErasure.js'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('pages/Logout.tsx', () => {
  it('calls the logout endpoint, clears local state, and navigates home', async () => {
    window.localStorage.setItem('accessToken', 'tok1')
    setIsLogged(true)
    setDiscordUser({
      id: '1',
      username: 'bob',
      globalName: 'bob',
      displayName: 'bob',
      discriminator: '',
      avatarURL: '',
      displayAvatarURL: '',
    })
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'))
    vi.stubGlobal('fetch', fetchMock)

    const history = historyAt('/logout')
    renderWithProviders(() => <Logout />, { path: '/logout', history })

    // happy-dom's getAttribute('href') mis-serializes a bare "/" anchor href back to "" (an
    // environment quirk, not a component bug) - the resolved `.href` property is correct though.
    expect((screen.getByText('Click here if you are not redirected.') as HTMLAnchorElement).href).toBe(
      'http://localhost:3000/',
    )

    await vi.waitFor(() => expect(history.get()).toBe('/'))
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:5001/v3/users//logout',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(window.localStorage.getItem('accessToken')).toBeNull()
    expect(isLogged()).toBe(false)
    expect(discordUser().id).toBe('')
  })
  it('preserves the recovery receipt and preferences even when the logout request fails', async () => {
    localStorage.clear()
    const receipt = { requestId: '00000000-0000-4000-8000-000000000001', receipt: 'a'.repeat(64) }
    localStorage.setItem(ERASURE_RECEIPT_KEY, JSON.stringify(receipt))
    localStorage.setItem('locale', 'en')
    localStorage.setItem('theme', 'dark')
    localStorage.setItem('accessToken', 'old-token')
    sessionStorage.setItem('private-cache', 'old data')
    setIsLogged(true)
    const remove = vi.spyOn(localStorage, 'removeItem')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network unavailable')))
    const history = historyAt('/logout')
    renderWithProviders(() => <Logout />, { path: '/logout', history })
    await vi.waitFor(() => expect(history.get()).toBe('/'))
    expect(isLogged()).toBe(false)
    expect(JSON.parse(localStorage.getItem(ERASURE_RECEIPT_KEY)!)).toEqual(receipt)
    expect(remove).not.toHaveBeenCalledWith(ERASURE_RECEIPT_KEY)
    expect(localStorage.getItem('accessToken')).toBeNull()
    expect(localStorage.getItem('theme')).toBe('dark')
    expect(localStorage.getItem('locale')).toBe('en')
    expect(sessionStorage.length).toBe(0)
  })
})
