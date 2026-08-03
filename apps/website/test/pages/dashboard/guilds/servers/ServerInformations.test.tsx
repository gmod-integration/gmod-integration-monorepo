import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { cleanup, fireEvent, screen } from '@solidjs/testing-library'
import { historyAt, renderWithProviders } from '../../../../testUtils.js'
import ServerInformations from '../../../../../src/pages/dashboard/guilds/servers/ServerInformations.js'
import { fetchAPI } from '../../../../../src/utils/api.js'
import { setWebSocketServerStatus, sendWebSocketMessage } from '../../../../../src/utils/websocket.js'
import { okJson, errJson, stubDialogGlobal } from './testHelpers.js'

vi.mock('../../../../../src/utils/api.js', () => ({
  fetchAPI: vi.fn(),
  getAPIUrl: vi.fn(),
  getUrlWithActualParams: vi.fn((s: string) => s),
}))

vi.mock('../../../../../src/utils/websocket.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../src/utils/websocket.js')>()
  return {
    ...actual,
    sendWebSocketMessage: vi.fn(),
  }
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const baseServer = {
  id: 's1',
  name: 'My Server',
  description: 'A cool server',
  image: '',
  ip: '1.2.3.4',
  port: '27015',
  token: 'secret-token',
  isPublic: true,
}

function setServerLocalStorage(overrides: Partial<typeof baseServer> = {}) {
  window.localStorage.setItem('server', JSON.stringify({ ...baseServer, ...overrides }))
}

function renderPage() {
  const history = historyAt('/dashboard/guilds/g1/config/servers/s1')
  const result = renderWithProviders(() => <ServerInformations />, {
    path: '/dashboard/guilds/:guildID/config/servers/:serverID',
    history,
  })
  return { ...result, history }
}

const defaultWSStatus = {
  isWebSocketConnected: false,
  lastRequest: new Date(0),
  version: '',
  versionComparator: 1,
  serverID: '',
  action: 'server_status',
}

describe('pages/dashboard/guilds/servers/ServerInformations.tsx', () => {
  beforeEach(() => {
    window.localStorage.clear()
    setServerLocalStorage()
    setWebSocketServerStatus({ ...defaultWSStatus })
    ;(fetchAPI as Mock).mockReset()
    ;(fetchAPI as Mock).mockResolvedValue(okJson({}))
  })

  it('renders server information from localStorage', () => {
    renderPage()
    expect(screen.getByText('My Server')).toBeInTheDocument()
    expect(screen.getByText('A cool server')).toBeInTheDocument()
    expect(screen.getByText('1.2.3.4:27015')).toBeInTheDocument()
    expect(screen.getByText('s1')).toBeInTheDocument()
  })

  it('shows the default server logo when image is empty and the custom one when set', () => {
    setServerLocalStorage({ image: '' })
    const { unmount } = renderPage()
    const img = screen.getByAltText('Server Logo') as HTMLImageElement
    expect(img.getAttribute('src')).toBeTruthy()
    const fallbackSrc = img.getAttribute('src')
    unmount()
    cleanup()

    setServerLocalStorage({ image: 'https://example.com/logo.png' })
    renderPage()
    const img2 = screen.getByAltText('Server Logo') as HTMLImageElement
    expect(img2.getAttribute('src')).toBe('https://example.com/logo.png')
    expect(img2.getAttribute('src')).not.toBe(fallbackSrc)
  })

  it('hides the token until clicked, then reveals it', async () => {
    renderPage()
    // "Show Token" is the real en.json translation for this key (differs from the JSX
    // fallback default text "Click to Show").
    const tokenSpan = screen.getByText('Show Token')
    expect(screen.queryByText('secret-token')).not.toBeInTheDocument()
    await fireEvent.click(tokenSpan)
    expect(screen.getByText('secret-token')).toBeInTheDocument()
    expect(screen.queryByText('Show Token')).not.toBeInTheDocument()
  })

  it('shows Yes/No for the public status depending on isPublic', () => {
    setServerLocalStorage({ isPublic: true })
    const { unmount } = renderPage()
    // "Public:" is the real en.json translation (differs from the JSX fallback "Server Public").
    expect(screen.getByText('Public:').nextSibling).toHaveTextContent('Yes')
    unmount()
    cleanup()

    setServerLocalStorage({ isPublic: false })
    renderPage()
    expect(screen.getByText('Public:').nextSibling).toHaveTextContent('No')
  })

  describe('connection status panel', () => {
    it('shows all-invalid fallback content by default (never connected)', () => {
      renderPage()
      expect(
        screen.getByText(/We haven't received any request from your server in the last minute/),
      ).toBeInTheDocument()
      expect(
        screen.getByText(/Your server is not connected to the websocket, advanced features are not available/),
      ).toBeInTheDocument()
      // isValidHTTPRequest is false, so the version block also shows the HTTP-fallback text, not
      // the outdated/success text.
      expect(screen.getByText(/We can't check the version of your server/)).toBeInTheDocument()
    })

    it('shows success content when websocket connected, request fresh, and version up to date', () => {
      setWebSocketServerStatus({
        ...defaultWSStatus,
        isWebSocketConnected: true,
        lastRequest: new Date(),
        versionComparator: 0,
      })
      renderPage()
      expect(
        screen.getByText('Congratulations your server is correctly setup you can now configure it.'),
      ).toBeInTheDocument()
      expect(
        screen.getByText(
          'Congratulations you successfully connected to your server in websocket, advanced features are now available.',
        ),
      ).toBeInTheDocument()
      expect(
        screen.getByText('Great your server is up to date and will work perfectly with the latest features.'),
      ).toBeInTheDocument()
    })

    it('treats versionComparator -1 as a valid (up to date) version', () => {
      setWebSocketServerStatus({
        ...defaultWSStatus,
        lastRequest: new Date(),
        versionComparator: -1,
      })
      renderPage()
      expect(
        screen.getByText('Great your server is up to date and will work perfectly with the latest features.'),
      ).toBeInTheDocument()
    })

    it('shows the outdated-version message when the request is fresh but the version is outdated', () => {
      setWebSocketServerStatus({
        ...defaultWSStatus,
        lastRequest: new Date(),
        versionComparator: 1,
      })
      renderPage()
      expect(screen.getByText(/Your server is outdated, new features will not work correctly/)).toBeInTheDocument()
    })

    it('reactively updates when webSocketServerStatus changes after mount', async () => {
      renderPage()
      expect(
        screen.getByText(/Your server is not connected to the websocket, advanced features are not available/),
      ).toBeInTheDocument()

      setWebSocketServerStatus({
        ...defaultWSStatus,
        isWebSocketConnected: true,
      })

      await vi.waitFor(() =>
        expect(
          screen.getByText(
            'Congratulations you successfully connected to your server in websocket, advanced features are now available.',
          ),
        ).toBeInTheDocument(),
      )
    })
  })

  describe('server_status polling interval', () => {
    // Note: this harness's `onMount`/`onCleanup` disposal wiring (via @solidjs/testing-library's
    // render/cleanup) does not reliably invoke onCleanup callbacks registered inside onMount for
    // *any* component in this test environment (confirmed with a minimal onMount+onCleanup+
    // unmount repro with no app code involved at all) - it's an environment limitation, not a
    // ServerInformations bug, so we only assert the interval fires and not that unmount stops it.
    it('sends a server_status websocket message every 2s while mounted', () => {
      vi.useFakeTimers()
      renderPage()
      expect(sendWebSocketMessage).not.toHaveBeenCalled()

      vi.advanceTimersByTime(2000)
      expect(sendWebSocketMessage).toHaveBeenCalledTimes(1)
      expect(sendWebSocketMessage).toHaveBeenLastCalledWith('server_status', { serverID: 's1' })

      vi.advanceTimersByTime(2000)
      expect(sendWebSocketMessage).toHaveBeenCalledTimes(2)
    })
  })

  describe('editing the server', () => {
    it('saves the edited fields and updates localStorage on success', async () => {
      const updated = { ...baseServer, name: 'New Name' }
      ;(fetchAPI as Mock).mockResolvedValue(okJson(updated))

      const { container } = renderPage()
      stubDialogGlobal(container, 'edit_server')
      await fireEvent.click(screen.getByRole('button', { name: 'Edit Server' }))

      const [nameInput] = screen.getAllByRole('textbox') as HTMLInputElement[]
      await fireEvent.input(nameInput, { target: { value: 'New Name' } })

      const saveBtn = screen.getByRole('button', { name: 'Save Changes' })
      await fireEvent.click(saveBtn)

      await vi.waitFor(() =>
        expect(fetchAPI).toHaveBeenCalledWith(
          '/users/:discordID/guilds/:guildID/servers/s1',
          'PUT',
          expect.objectContaining({ name: 'New Name' }),
        ),
      )
      await vi.waitFor(() => expect(JSON.parse(window.localStorage.getItem('server') as string).name).toBe('New Name'))
      expect(screen.getByText('New Name')).toBeInTheDocument()
    })

    it('does not update localStorage when the save request fails', async () => {
      ;(fetchAPI as Mock).mockResolvedValue(errJson())
      const { container } = renderPage()
      stubDialogGlobal(container, 'edit_server')
      await fireEvent.click(screen.getByRole('button', { name: 'Edit Server' }))
      const saveBtn = screen.getByRole('button', { name: 'Save Changes' })
      await fireEvent.click(saveBtn)
      await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalled())
      expect(JSON.parse(window.localStorage.getItem('server') as string).name).toBe('My Server')
    })

    it('mutates description, image, ip, port and isPublic before saving', async () => {
      const updated = { ...baseServer }
      ;(fetchAPI as Mock).mockResolvedValue(okJson(updated))
      const { container } = renderPage()
      stubDialogGlobal(container, 'edit_server')
      await fireEvent.click(screen.getByRole('button', { name: 'Edit Server' }))
      const [, descInput, imageInput, ipInput, portInput] = screen.getAllByRole('textbox') as HTMLInputElement[]
      await fireEvent.input(descInput, { target: { value: 'New Desc' } })
      await fireEvent.input(imageInput, { target: { value: 'http://img' } })
      await fireEvent.input(ipInput, { target: { value: '5.6.7.8' } })
      await fireEvent.input(portInput, { target: { value: '27016' } })
      const publicSelect = screen.getByRole('combobox') as HTMLSelectElement
      await fireEvent.change(publicSelect, { target: { value: 'false' } })

      await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
      await vi.waitFor(() =>
        expect(fetchAPI).toHaveBeenCalledWith(
          '/users/:discordID/guilds/:guildID/servers/s1',
          'PUT',
          expect.objectContaining({
            description: 'New Desc',
            image: 'http://img',
            ip: '5.6.7.8',
            port: '27016',
            isPublic: false,
          }),
        ),
      )
    })
  })

  describe('deleting the server', () => {
    it('navigates away on successful deletion', async () => {
      ;(fetchAPI as Mock).mockResolvedValue(okJson({}))
      const history = renderPage().history
      await fireEvent.click(screen.getByRole('button', { name: 'Delete Server' }))
      await vi.waitFor(() =>
        expect(fetchAPI).toHaveBeenCalledWith('/users/:discordID/guilds/:guildID/servers/s1', 'DELETE'),
      )
      // DashboardMiddleware (mounted globally in the real app, not under test here) is what
      // resolves the :guildID placeholder in this literal navigate target.
      await vi.waitFor(() => expect(history.get()).toBe('/dashboard/guilds/:guildID/config/servers'))
    })

    it('does not navigate when the deletion request fails', async () => {
      ;(fetchAPI as Mock).mockResolvedValue(errJson())
      const history = renderPage().history
      await fireEvent.click(screen.getByRole('button', { name: 'Delete Server' }))
      await vi.waitFor(() =>
        expect(fetchAPI).toHaveBeenCalledWith('/users/:discordID/guilds/:guildID/servers/s1', 'DELETE'),
      )
      expect(history.get()).toBe('/dashboard/guilds/g1/config/servers/s1')
    })
  })

  describe('resetting the server token', () => {
    it('updates the server and localStorage on success', async () => {
      const updated = { ...baseServer, token: 'new-token' }
      ;(fetchAPI as Mock).mockResolvedValue(okJson(updated))
      renderPage()
      await fireEvent.click(screen.getByRole('button', { name: 'Reset Server Token' }))
      await vi.waitFor(() =>
        expect(fetchAPI).toHaveBeenCalledWith('/users/:discordID/guilds/:guildID/servers/s1/token', 'POST'),
      )
      await vi.waitFor(() => expect(JSON.parse(window.localStorage.getItem('server') as string).token).toBe('new-token'))
    })

    it('does not update localStorage when the reset request fails', async () => {
      ;(fetchAPI as Mock).mockResolvedValue(errJson())
      renderPage()
      await fireEvent.click(screen.getByRole('button', { name: 'Reset Server Token' }))
      await vi.waitFor(() =>
        expect(fetchAPI).toHaveBeenCalledWith('/users/:discordID/guilds/:guildID/servers/s1/token', 'POST'),
      )
      expect(JSON.parse(window.localStorage.getItem('server') as string).token).toBe('secret-token')
    })
  })
})
