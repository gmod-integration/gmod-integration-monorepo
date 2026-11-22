import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@solidjs/testing-library'
import { historyAt, renderWithProviders } from '../../../../testUtils.js'
import ServerInformations from '../../../../../src/pages/dashboard/guilds/servers/ServerInformations.js'
import { fetchAPI } from '../../../../../src/utils/api.js'
import type * as WebSocketUtilities from '../../../../../src/utils/websocket.js'
import { setWebSocketServerStatus, sendWebSocketMessage, stopWebSocket } from '../../../../../src/utils/websocket.js'
import { okJson, errJson } from './testHelpers.js'
import { DraftEditingProvider } from '../../../../../src/components/DraftEditingProvider.js'

vi.mock('../../../../../src/utils/api.js', () => ({
  fetchAPI: vi.fn(),
  getAPIUrl: vi.fn(),
  getUrlWithActualParams: vi.fn((s: string) => s),
}))

vi.mock('../../../../../src/utils/websocket.js', async (importOriginal) => {
  const actual = await importOriginal<typeof WebSocketUtilities>()
  return {
    ...actual,
    sendWebSocketMessage: vi.fn(),
  }
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
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
  const result = renderWithProviders(
    () => (
      <DraftEditingProvider>
        <ServerInformations />
      </DraftEditingProvider>
    ),
    {
      path: '/dashboard/guilds/:guildID/config/servers/:serverID',
      history,
    },
  )
  return { ...result, history }
}

const defaultWSStatus = {
  isWebSocketConnected: false,
  lastRequest: new Date(0),
  version: '',
  versionComparator: 1,
  serverID: 's1',
  action: 'server_status',
}

describe('pages/dashboard/guilds/servers/ServerInformations.tsx', () => {
  beforeEach(() => {
    window.localStorage.clear()
    setServerLocalStorage()
    setWebSocketServerStatus({ ...defaultWSStatus })
    vi.mocked(sendWebSocketMessage).mockClear()
    ;(fetchAPI as Mock).mockReset()
    ;(fetchAPI as Mock).mockResolvedValue(okJson({}))
  })

  it('renders server information from localStorage', () => {
    renderPage()
    expect(screen.getByLabelText('Name')).toHaveValue('My Server')
    expect(screen.getByLabelText('Description')).toHaveValue('A cool server')
    expect(screen.getByLabelText('Server address')).toHaveValue('1.2.3.4')
    expect(screen.getByLabelText('Port')).toHaveValue('27015')
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.getByText('s1')).toBeInTheDocument()
  })

  it('shows the default server logo when image is empty and the custom one when set', () => {
    setServerLocalStorage({ image: '' })
    const { unmount } = renderPage()
    const img = screen.getByAltText('Logo') as HTMLImageElement
    expect(img.getAttribute('src')).toBeTruthy()
    const fallbackSrc = img.getAttribute('src')
    unmount()
    cleanup()

    setServerLocalStorage({ image: 'https://example.com/logo.png' })
    renderPage()
    const img2 = screen.getByAltText('Logo') as HTMLImageElement
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
    expect(screen.getByRole('checkbox', { name: 'Show in server ranking' })).toBeChecked()
    unmount()
    cleanup()

    setServerLocalStorage({ isPublic: false })
    renderPage()
    expect(screen.getByRole('checkbox', { name: 'Show in server ranking' })).not.toBeChecked()
  })

  describe('addon setup commands', () => {
    it('shows the Lua console commands with the selected server ID while masking the token', () => {
      const { container } = renderPage()
      expect(screen.getByText('gmod-integration config set id "s1"')).toBeInTheDocument()
      expect(screen.getByText('gmod-integration config try')).toBeInTheDocument()
      expect(container.textContent).toContain('gmod-integration help')
      expect(container.textContent).toContain('gmod-integration version')
      expect(container.innerHTML).not.toContain('secret-token')
      expect(screen.getByRole('button', { name: 'Copy the server token command' })).toBeEnabled()
    })

    it('copies complete commands with the current credentials without revealing the token', async () => {
      const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
      const { container } = renderPage()
      await fireEvent.click(screen.getByRole('button', { name: 'Copy the server ID command' }))
      expect(writeText).toHaveBeenLastCalledWith('gmod-integration config set id "s1"')
      await fireEvent.click(screen.getByRole('button', { name: 'Copy the server token command' }))
      expect(writeText).toHaveBeenLastCalledWith('gmod-integration config set token "secret-token"')
      await fireEvent.click(screen.getByRole('button', { name: 'Copy the connection test command' }))
      expect(writeText).toHaveBeenLastCalledWith('gmod-integration config try')
      expect(container.innerHTML).not.toContain('secret-token')
      expect(fetchAPI).not.toHaveBeenCalled()
    })

    it('uses a newly reset token for subsequent copies and hides a previously revealed command', async () => {
      const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
      ;(fetchAPI as Mock).mockResolvedValue(okJson({ ...baseServer, token: 'replacement-token' }))
      renderPage()
      await fireEvent.click(screen.getByRole('button', { name: 'Show Token' }))
      expect(screen.getByText('gmod-integration config set token "secret-token"')).toBeInTheDocument()
      await fireEvent.click(screen.getByRole('button', { name: 'Reset Server Token' }))
      await fireEvent.click(
        within(document.getElementById('reset-server-token')!).getByRole('button', { name: 'Reset Server Token' }),
      )
      await vi.waitFor(() => expect(JSON.parse(localStorage.getItem('server')!).token).toBe('replacement-token'))
      expect(screen.getByRole('button', { name: 'Show Token' })).toBeInTheDocument()
      expect(screen.queryByText(/replacement-token/)).not.toBeInTheDocument()
      expect(screen.queryByText(/secret-token/)).not.toBeInTheDocument()
      await fireEvent.click(screen.getByRole('button', { name: 'Copy the server token command' }))
      expect(writeText).toHaveBeenLastCalledWith('gmod-integration config set token "replacement-token"')
    })

    it('does not allow an incomplete token command to be copied', async () => {
      setServerLocalStorage({ token: '' })
      const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
      renderPage()
      const copy = screen.getByRole('button', { name: 'Copy the server token command' })
      expect(copy).toBeDisabled()
      await fireEvent.click(copy)
      expect(writeText).not.toHaveBeenCalled()
    })
  })

  describe('connection status panel', () => {
    it('keeps another server status unknown instead of reusing its successful checks', () => {
      setWebSocketServerStatus({
        ...defaultWSStatus,
        serverID: 'other-server',
        isWebSocketConnected: true,
        lastRequest: new Date(),
        versionComparator: 0,
      })
      renderPage()
      expect(screen.getAllByText('Unknown')).toHaveLength(3)
      expect(screen.queryByText('Connected')).not.toBeInTheDocument()
      expect(screen.queryByText('Received')).not.toBeInTheDocument()
      expect(screen.queryByText('Compatible')).not.toBeInTheDocument()
      expect(screen.getByText(/The addon connection could not be verified/)).toBeInTheDocument()
    })

    it('clears a verified state when the dashboard transport stops', async () => {
      setWebSocketServerStatus({
        ...defaultWSStatus,
        isWebSocketConnected: true,
        lastRequest: new Date(),
        versionComparator: 0,
      })
      renderPage()
      expect(screen.getByText('Connected')).toBeInTheDocument()
      stopWebSocket()
      await vi.waitFor(() => expect(screen.getAllByText('Unknown')).toHaveLength(3))
      expect(screen.queryByText('Connected')).not.toBeInTheDocument()
      expect(screen.queryByText('Disconnected')).not.toBeInTheDocument()
      expect(screen.getByText(/Recent addon activity could not be verified/)).toBeInTheDocument()
    })

    it('does not retain a successful status when navigating to another server', async () => {
      setWebSocketServerStatus({
        ...defaultWSStatus,
        isWebSocketConnected: true,
        lastRequest: new Date(),
        versionComparator: 0,
      })
      const { history } = renderPage()
      expect(screen.getByText('Connected')).toBeInTheDocument()
      history.set({ value: '/dashboard/guilds/g1/config/servers/another-server' })
      await vi.waitFor(() => expect(screen.getAllByText('Unknown')).toHaveLength(3))
      expect(screen.queryByText('Connected')).not.toBeInTheDocument()
    })

    it('expires recent activity even when no new status frame arrives', () => {
      vi.useFakeTimers()
      setWebSocketServerStatus({
        ...defaultWSStatus,
        isWebSocketConnected: true,
        lastRequest: new Date(),
        versionComparator: 0,
      })
      renderPage()
      expect(screen.getByText('Received')).toBeInTheDocument()
      vi.advanceTimersByTime(62_000)
      expect(screen.getByText('Not received')).toBeInTheDocument()
      expect(screen.queryByText('Compatible')).not.toBeInTheDocument()
    })

    it('shows all-invalid fallback content by default (never connected)', () => {
      renderPage()
      expect(screen.getByText(/No request has been received from the addon in the last minute/)).toBeInTheDocument()
      expect(screen.getByText(/The live connection is unavailable/)).toBeInTheDocument()
      // isValidHTTPRequest is false, so the version block also shows the HTTP-fallback text, not
      // the outdated/success text.
      expect(screen.getByText(/The addon version cannot be checked without recent server activity/)).toBeInTheDocument()
      expect(screen.getByText('Not received')).toBeInTheDocument()
      expect(screen.getByText('Disconnected')).toBeInTheDocument()
      expect(screen.getByText('Unknown')).toBeInTheDocument()
      expect(screen.queryByText('Outdated')).not.toBeInTheDocument()
    })

    it('shows success content when websocket connected, request fresh, and version up to date', () => {
      setWebSocketServerStatus({
        ...defaultWSStatus,
        isWebSocketConnected: true,
        lastRequest: new Date(),
        versionComparator: 0,
      })
      renderPage()
      expect(screen.getByText('A request was received from the addon within the last minute.')).toBeInTheDocument()
      expect(
        screen.getByText('The addon has a live connection. Features that need real-time communication can use it.'),
      ).toBeInTheDocument()
      expect(screen.getByText('The reported addon version is compatible with the current service.')).toBeInTheDocument()
      expect(screen.getByText('Received')).toBeInTheDocument()
      expect(screen.getByText('Connected')).toBeInTheDocument()
      expect(screen.getByText('Compatible')).toBeInTheDocument()
    })

    it('treats versionComparator -1 as a valid (up to date) version', () => {
      setWebSocketServerStatus({
        ...defaultWSStatus,
        lastRequest: new Date(),
        versionComparator: -1,
      })
      renderPage()
      expect(screen.getByText('The reported addon version is compatible with the current service.')).toBeInTheDocument()
    })

    it('shows the outdated-version message when the request is fresh but the version is outdated', () => {
      setWebSocketServerStatus({
        ...defaultWSStatus,
        lastRequest: new Date(),
        versionComparator: 1,
      })
      renderPage()
      expect(screen.getByText(/The reported addon version is outdated/)).toBeInTheDocument()
      expect(screen.getByText('Outdated')).toBeInTheDocument()
      expect(screen.queryByText('Unknown')).not.toBeInTheDocument()
    })

    it('reactively updates when webSocketServerStatus changes after mount', async () => {
      renderPage()
      expect(screen.getByText(/The live connection is unavailable/)).toBeInTheDocument()
      expect(screen.getByText('Disconnected')).toBeInTheDocument()

      setWebSocketServerStatus({
        ...defaultWSStatus,
        isWebSocketConnected: true,
      })

      await vi.waitFor(() =>
        expect(
          screen.getByText('The addon has a live connection. Features that need real-time communication can use it.'),
        ).toBeInTheDocument(),
      )
      expect(screen.getByText('Connected')).toBeInTheDocument()
      expect(screen.queryByText('Disconnected')).not.toBeInTheDocument()
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

  describe('editing the server inline', () => {
    it('keeps all edits local and Cancel restores the saved values', async () => {
      renderPage()
      await fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Unsaved name' } })
      await fireEvent.input(screen.getByLabelText('Description'), { target: { value: 'Unsaved description' } })
      await fireEvent.click(screen.getByRole('checkbox', { name: 'Show in server ranking' }))
      expect(fetchAPI).not.toHaveBeenCalled()
      expect(JSON.parse(localStorage.getItem('server')!).name).toBe('My Server')
      await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(screen.getByLabelText('Name')).toHaveValue('My Server')
      expect(screen.getByLabelText('Description')).toHaveValue('A cool server')
      expect(screen.getByRole('checkbox', { name: 'Show in server ranking' })).toBeChecked()
      expect(document.getElementById('edit_server')).not.toBeInTheDocument()
    })
    it('validates the name, port and image URL before allowing Save', async () => {
      renderPage()
      const save = screen.getByRole('button', { name: 'Save' })
      await fireEvent.input(screen.getByLabelText('Name'), { target: { value: ' ' } })
      expect(save).toBeDisabled()
      await fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'New name' } })
      await fireEvent.input(screen.getByLabelText('Port'), { target: { value: '70000' } })
      expect(save).toBeDisabled()
      await fireEvent.input(screen.getByLabelText('Port'), { target: { value: '27015' } })
      await fireEvent.input(screen.getByLabelText('Image URL'), { target: { value: 'invalid' } })
      expect(save).toBeDisabled()
      await fireEvent.input(screen.getByLabelText('Image URL'), { target: { value: 'https://example.com/server.png' } })
      expect(save).not.toBeDisabled()
      expect(fetchAPI).not.toHaveBeenCalled()
    })
    it('locks the whole form, prevents duplicate saves and retains a failed draft', async () => {
      let finish!: (value: ReturnType<typeof errJson>) => void
      ;(fetchAPI as Mock).mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve
        }),
      )
      renderPage()
      const name = screen.getByLabelText('Name')
      const save = screen.getByRole('button', { name: 'Save' })
      await fireEvent.input(name, { target: { value: 'Draft name' } })
      await fireEvent.click(save)
      await fireEvent.click(save)
      expect(fetchAPI).toHaveBeenCalledTimes(1)
      expect(save).toBeDisabled()
      expect(name).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Reset Server Token' })).toBeDisabled()
      finish(errJson())
      await vi.waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Unable to save'))
      expect(name).toHaveValue('Draft name')
      expect(JSON.parse(localStorage.getItem('server')!).name).toBe('My Server')
      expect(save).not.toBeDisabled()
    })
    it('saves every editable field together, updates storage and accepts the server response', async () => {
      const updated = {
        ...baseServer,
        name: 'New Name',
        description: 'New Desc',
        image: 'https://example.com/logo.png',
        ip: '5.6.7.8',
        port: '27016',
        isPublic: false,
      }
      ;(fetchAPI as Mock).mockResolvedValue(okJson(updated))
      renderPage()
      await fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'New Name' } })
      await fireEvent.input(screen.getByLabelText('Description'), { target: { value: 'New Desc' } })
      await fireEvent.input(screen.getByLabelText('Image URL'), { target: { value: 'https://example.com/logo.png' } })
      await fireEvent.input(screen.getByLabelText('Server address'), { target: { value: '5.6.7.8' } })
      await fireEvent.input(screen.getByLabelText('Port'), { target: { value: '27016' } })
      await fireEvent.click(screen.getByRole('checkbox', { name: 'Show in server ranking' }))
      await fireEvent.click(screen.getByRole('button', { name: 'Save' }))
      await vi.waitFor(() =>
        expect(fetchAPI).toHaveBeenCalledWith('/users/:discordID/guilds/:guildID/servers/s1', 'PUT', {
          name: 'New Name',
          description: 'New Desc',
          image: 'https://example.com/logo.png',
          ip: '5.6.7.8',
          port: '27016',
          isPublic: false,
        }),
      )
      await vi.waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument())
      expect(JSON.parse(localStorage.getItem('server')!)).toEqual(updated)
      expect(screen.getByLabelText('Name')).toHaveValue('New Name')
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    })
  })
  describe('confirmed server commands', () => {
    it('names the server before deletion and Cancel sends no request', async () => {
      renderPage()
      await fireEvent.click(screen.getByRole('button', { name: 'Delete Server' }))
      const confirm = within(document.getElementById('delete-server')!)
      expect(confirm.getByText(/My Server — Remove this server/)).toBeInTheDocument()
      expect(fetchAPI).not.toHaveBeenCalled()
      await fireEvent.click(confirm.getByRole('button', { name: 'Cancel' }))
      expect(localStorage.getItem('server')).not.toBeNull()
    })
    it('only navigates away after confirmed deletion succeeds', async () => {
      const history = renderPage().history
      await fireEvent.click(screen.getByRole('button', { name: 'Delete Server' }))
      const confirm = within(document.getElementById('delete-server')!)
      ;(fetchAPI as Mock).mockResolvedValueOnce(errJson())
      await fireEvent.click(confirm.getByRole('button', { name: 'Delete Server' }))
      await vi.waitFor(() => expect(confirm.getByRole('alert')).toBeInTheDocument())
      expect(history.get()).toBe('/dashboard/guilds/g1/config/servers/s1')
      expect(localStorage.getItem('server')).not.toBeNull()
      ;(fetchAPI as Mock).mockResolvedValueOnce(okJson({}))
      await fireEvent.click(confirm.getByRole('button', { name: 'Delete Server' }))
      await vi.waitFor(() => expect(history.get()).toBe('/dashboard/guilds/g1/config/servers'))
      expect(fetchAPI).toHaveBeenCalledWith('/users/:discordID/guilds/:guildID/servers/s1', 'DELETE')
      expect(localStorage.getItem('server')).toBeNull()
    })
    it('explains token invalidation and preserves unsaved information while resetting', async () => {
      ;(fetchAPI as Mock).mockResolvedValue(okJson({ ...baseServer, token: 'new-token' }))
      renderPage()
      await fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Unsaved name' } })
      await fireEvent.click(screen.getByRole('button', { name: 'Reset Server Token' }))
      const confirm = within(document.getElementById('reset-server-token')!)
      expect(confirm.getByText(/My Server — The current token will stop working/)).toBeInTheDocument()
      expect(fetchAPI).not.toHaveBeenCalled()
      await fireEvent.click(confirm.getByRole('button', { name: 'Reset Server Token' }))
      await vi.waitFor(() => expect(JSON.parse(localStorage.getItem('server')!).token).toBe('new-token'))
      expect(screen.getByLabelText('Name')).toHaveValue('Unsaved name')
      expect(JSON.parse(localStorage.getItem('server')!).name).toBe('My Server')
      await fireEvent.click(screen.getByRole('button', { name: 'Show Token' }))
      expect(screen.getByText('new-token')).toBeInTheDocument()
      expect(fetchAPI).toHaveBeenCalledWith('/users/:discordID/guilds/:guildID/servers/s1/token', 'POST')
    })
    it('keeps a failed token reset open and preserves the current token', async () => {
      ;(fetchAPI as Mock).mockResolvedValue(errJson())
      renderPage()
      await fireEvent.click(screen.getByRole('button', { name: 'Reset Server Token' }))
      const dialog = document.getElementById('reset-server-token')!
      await fireEvent.click(within(dialog).getByRole('button', { name: 'Reset Server Token' }))
      await vi.waitFor(() => expect(within(dialog).getByRole('alert')).toBeInTheDocument())
      expect(dialog).toHaveAttribute('open')
      expect(JSON.parse(localStorage.getItem('server')!).token).toBe('secret-token')
    })
  })
})
