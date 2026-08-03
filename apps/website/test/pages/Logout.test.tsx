import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@solidjs/testing-library'
import { historyAt, renderWithProviders } from '../testUtils.js'
import { discordUser, isLogged, setDiscordUser, setIsLogged } from '../../src/utils/event.js'
import Logout from '../../src/pages/Logout.js'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
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
})
