import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@solidjs/testing-library'
import { renderWithProviders } from '../../../testUtils.js'
import Impersonate from '../../../../src/pages/dashboard/admins/Impersonate.js'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('pages/dashboard/admins/Impersonate.tsx', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  it('shows a loading placeholder while the panel-users resource is loading', () => {
    const fetchMock = vi.fn().mockReturnValue(new Promise(() => {}))
    vi.stubGlobal('fetch', fetchMock)

    renderWithProviders(() => <Impersonate />)

    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('renders an empty list when the response is not ok', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 403 }))
    vi.stubGlobal('fetch', fetchMock)

    renderWithProviders(() => <Impersonate />)

    await vi.waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument())
    expect(screen.queryByText(/ID:/)).not.toBeInTheDocument()
  })

  it('excludes the current user from the panel-user list', async () => {
    window.localStorage.setItem('discordID', 'me')
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ discordID: 'me' }, { discordID: 'other' }])),
    )
    vi.stubGlobal('fetch', fetchMock)

    renderWithProviders(() => <Impersonate />)

    await vi.waitFor(() => expect(screen.getByText('other')).toBeInTheDocument())
    expect(screen.queryByText('me')).not.toBeInTheDocument()
  })

  it('impersonating a user swaps localStorage tokens and redirects to /login with the target user', async () => {
    window.localStorage.setItem('discordID', 'me')
    window.localStorage.setItem('accessToken', 'my-token')
    window.localStorage.setItem('expirationDate', '123')
    window.sessionStorage.setItem('someSessionKey', 'x')

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          { discordID: 'other', accessToken: 'other-token', expirationDate: '2024-06-01T00:00:00.000Z' },
        ]),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const originalLocation = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { href: 'http://localhost:3000/' },
      writable: true,
    })

    renderWithProviders(() => <Impersonate />)
    await vi.waitFor(() => expect(screen.getByText('other')).toBeInTheDocument())

    screen.getByText('other').closest('.card')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(window.sessionStorage.getItem('someSessionKey')).toBeNull()
    expect(window.localStorage.getItem('oldAccessToken')).toBe('my-token')
    expect(window.localStorage.getItem('oldDiscordID')).toBe('me')
    expect(window.localStorage.getItem('oldExpirationDate')).toBe('123')
    expect(window.location.href).toBe(
      `/login/?discordID=other&accessToken=other-token&expirationDate=${new Date('2024-06-01T00:00:00.000Z').getTime()}`,
    )

    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation, writable: true })
  })
})
