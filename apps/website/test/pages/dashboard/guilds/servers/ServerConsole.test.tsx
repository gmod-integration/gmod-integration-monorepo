import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { MemoryRouter, Route } from '@solidjs/router'
import { AccessProvider, type DashboardAccessSnapshot } from '../../../../../src/components/AccessProvider.js'
import { I18nProvider } from '../../../../../src/i18n.js'
import ServerConsole from '../../../../../src/pages/dashboard/guilds/servers/ServerConsole.js'
import { setWebSocketSignal } from '../../../../../src/utils/websocket.js'
import { historyAt } from '../../../../testUtils.js'
import { fetchAPI } from '../../../../../src/utils/api.js'
import type * as ConsoleAPI from '../../../../../src/utils/api.js'
import { authSession, setAuthSession } from '../../../../../src/utils/authClient.js'
import { normalizeDiscordUserPayload } from '../../../../../src/utils/event.js'

vi.mock('../../../../../src/utils/api.js', async (original) => ({
  ...(await original<typeof ConsoleAPI>()),
  fetchAPI: vi.fn(),
}))

class Socket extends EventTarget {
  readyState: number = WebSocket.OPEN
  send = vi.fn()
  packets() {
    return this.send.mock.calls.map(([value]) => JSON.parse(value as string))
  }
  message(value: unknown) {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(value) }))
  }
  confirm(enabled = true, error?: string, serverID = 's1') {
    this.message({ action: 'console_subscription', serverID, enabled, ...(error ? { error } : {}) })
  }
  output(text: string, serverID = 's1') {
    this.message({ action: 'console_live_exporter', serverID, data: { data: text } })
  }
}
const setSocket = (socket: Socket | null) => setWebSocketSignal(socket as unknown as WebSocket | null)
const viewOutput = () => screen.getByRole('log', { name: 'Console output' })
const commandField = () => screen.getByRole('textbox', { name: 'Console command' }) as HTMLInputElement
const commandDialog = () => within(document.getElementById('server-console-command')!)
const response = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response
const commandAck = (status = 'executed', code = 'executed', overrides: object = {}) =>
  response({
    serverID: 's1',
    requestID: (vi.mocked(fetchAPI).mock.calls.at(-1)?.[2] as { requestID: string }).requestID,
    status,
    code,
    ...overrides,
  })
async function openCommand(command = 'status') {
  await fireEvent.input(commandField(), { target: { value: command } })
  await fireEvent.submit(commandField().closest('form')!)
}
function renderPage(premium = true) {
  const history = historyAt('/dashboard/guilds/g1/config/servers/s1/console')
  const [isPremium, setPremium] = createSignal(premium)
  const snapshot = (): DashboardAccessSnapshot => ({
    guildID: 'g1',
    premium: isPremium(),
    customBot: false,
    state: 'ready',
    sources: [],
    revision: 'test',
    validUntil: '2099-01-01T00:00:00.000Z',
  })
  return {
    history,
    setPremium,
    ...render(() => (
      <MemoryRouter
        history={history}
        root={(props) => (
          <I18nProvider>
            <AccessProvider snapshot={snapshot()}>{props.children}</AccessProvider>
          </I18nProvider>
        )}
      >
        <Route path="/dashboard/guilds/:guildID/config/servers/:serverID/console" component={ServerConsole} />
      </MemoryRouter>
    )),
  }
}
beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('server', JSON.stringify({ id: 's1', name: 'Sandbox One' }))
  setAuthSession({
    authenticated: true,
    user: normalizeDiscordUserPayload({ id: '123456789012345678' }),
    session: {
      id: 'console-session',
      expiresAt: '2099-01-01T00:00:00.000Z',
      absoluteExpiresAt: '2099-01-01T00:00:00.000Z',
    },
    csrfToken: 'test-csrf',
  })
  vi.mocked(fetchAPI).mockReset()
  setSocket(null)
})
afterEach(() => {
  cleanup()
  setSocket(null)
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('server live console', () => {
  it('opens a concrete command confirmation without sending and cancels without losing the draft', async () => {
    const socket = new Socket()
    setSocket(socket)
    renderPage()
    socket.confirm()
    await openCommand('  say "Server restart in five minutes"  ')
    expect(document.getElementById('server-console-command')).toHaveAttribute('open')
    expect(commandDialog().getByRole('heading', { name: 'Execute a command on Sandbox One?' })).toBeInTheDocument()
    expect(commandDialog().getByText('say "Server restart in five minutes"')).toBeInTheDocument()
    expect(fetchAPI).not.toHaveBeenCalled()
    await fireEvent.click(commandDialog().getByRole('button', { name: 'Cancel' }))
    expect(document.getElementById('server-console-command')).not.toHaveAttribute('open')
    expect(commandField()).toHaveValue('  say "Server restart in five minutes"  ')
    expect(fetchAPI).not.toHaveBeenCalled()
  })

  it('executes once after confirmation, captures exact scope and preserves edits made while pending', async () => {
    const socket = new Socket()
    setSocket(socket)
    renderPage()
    socket.confirm()
    let finish!: (response: Response) => void
    vi.mocked(fetchAPI).mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)))
    await openCommand('  status  ')
    await fireEvent.click(commandDialog().getByRole('button', { name: 'Confirm execution' }))
    await fireEvent.click(commandDialog().getByRole('button', { name: 'Confirm execution' }))
    expect(fetchAPI).toHaveBeenCalledExactlyOnceWith(
      '/v6/guilds/g1/servers/s1/console/commands',
      'POST',
      { requestID: expect.stringMatching(/^[a-f0-9-]{36}$/), command: 'status' },
      { signal: expect.any(AbortSignal) },
    )
    await fireEvent.input(commandField(), { target: { value: 'sv_password next-draft' } })
    finish(commandAck())
    await vi.waitFor(() => expect(document.getElementById('server-console-command')).not.toHaveAttribute('open'))
    expect(commandField()).toHaveValue('sv_password next-draft')
    expect(
      screen.getByText(
        'The game console accepted the command. This acknowledgement does not include its output or confirm its effects.',
      ),
    ).toBeInTheDocument()
  })

  it.each([
    ['executed', 'executed'],
    ['rejected', 'permission_denied'],
    ['unknown', 'delivery_uncertain'],
  ])('distinguishes the %s acknowledgement and clears only a successfully submitted draft', async (status, code) => {
    const socket = new Socket()
    setSocket(socket)
    renderPage()
    socket.confirm()
    vi.mocked(fetchAPI).mockImplementationOnce(async () => commandAck(status, code))
    await openCommand('status')
    await fireEvent.click(commandDialog().getByRole('button', { name: 'Confirm execution' }))
    await vi.waitFor(() => expect(document.getElementById('server-console-command')).not.toHaveAttribute('open'))
    expect(commandField()).toHaveValue(status === 'executed' ? '' : 'status')
    expect(fetchAPI).toHaveBeenCalledTimes(1)
    if (status === 'unknown')
      expect(screen.getByRole('alert')).toHaveTextContent('Command delivery could not be confirmed')
    if (status === 'rejected')
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Your dashboard access does not allow console commands on this server.',
      )
  })

  it.each([
    { serverID: 'other-server' },
    { requestID: '11111111-1111-4111-8111-111111111111' },
    { status: 'executed', code: 'delivery_uncertain' },
  ])(
    'rejects a foreign or malformed acknowledgement and prevents reusing its consumed confirmation: %j',
    async (changes) => {
      const socket = new Socket()
      setSocket(socket)
      renderPage()
      socket.confirm()
      vi.mocked(fetchAPI).mockImplementationOnce(async () => commandAck('executed', 'executed', changes))
      await openCommand('status')
      await fireEvent.click(commandDialog().getByRole('button', { name: 'Confirm execution' }))
      await vi.waitFor(() => expect(commandDialog().getByRole('button', { name: 'Confirm execution' })).toBeDisabled())
      await vi.waitFor(() => expect(commandDialog().getByRole('alert')).toBeInTheDocument())
      expect(commandField()).toHaveValue('status')
      await fireEvent.click(commandDialog().getByRole('button', { name: 'Confirm execution' }))
      expect(fetchAPI).toHaveBeenCalledTimes(1)
      expect(
        screen.getAllByText('Command delivery could not be confirmed. Check the game server before trying again.')
          .length,
      ).toBeGreaterThan(0)
    },
  )

  it('keeps a rejected pre-dispatch draft when the account lacks dashboard administrator access', async () => {
    const socket = new Socket()
    setSocket(socket)
    renderPage()
    socket.confirm()
    vi.mocked(fetchAPI).mockResolvedValueOnce(response({ error: { code: 'forbidden' } }, 403))
    await openCommand('status')
    await fireEvent.click(commandDialog().getByRole('button', { name: 'Confirm execution' }))
    await vi.waitFor(() => expect(commandDialog().getByRole('alert')).toBeInTheDocument())
    expect(
      screen.getAllByText('Your dashboard access does not allow console commands on this server.').length,
    ).toBeGreaterThan(0)
    expect(commandField()).toHaveValue('status')
    expect(fetchAPI).toHaveBeenCalledTimes(1)
  })

  it.each(['route', 'session', 'actor'])(
    'aborts a command and ignores a late acknowledgement after a %s change',
    async (change) => {
      const socket = new Socket()
      setSocket(socket)
      const view = renderPage()
      socket.confirm()
      let finish!: (response: Response) => void
      vi.mocked(fetchAPI).mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)))
      await openCommand('status')
      await fireEvent.click(commandDialog().getByRole('button', { name: 'Confirm execution' }))
      const signal = vi.mocked(fetchAPI).mock.calls[0][3]!.signal as AbortSignal
      if (change === 'route') {
        view.history.set({ value: '/dashboard/guilds/g1/config/servers/s2/console' })
        await vi.waitFor(() =>
          expect(socket.packets().at(-1)).toEqual({ action: 'console_subscribe', data: { serverID: 's2' } }),
        )
      } else if (change === 'session')
        setAuthSession({ ...authSession()!, session: { ...authSession()!.session, id: 'different-session' } })
      else
        setAuthSession({
          ...authSession()!,
          session: { ...authSession()!.session, actorDiscordID: '222222222222222222' },
        })
      expect(signal.aborted).toBe(true)
      await fireEvent.input(commandField(), { target: { value: 'new-context-draft' } })
      finish(commandAck())
      await vi.waitFor(() =>
        expect(screen.getByRole('button', { name: 'Execute command' })).not.toHaveAttribute('aria-busy', 'true'),
      )
      expect(commandField()).toHaveValue('new-context-draft')
      expect(
        screen.queryByText(
          'The game console accepted the command. This acknowledgement does not include its output or confirm its effects.',
        ),
      ).not.toBeInTheDocument()
      expect(fetchAPI).toHaveBeenCalledTimes(1)
    },
  )

  it('validates command bytes and disables dispatch without a live authenticated session', async () => {
    const socket = new Socket()
    setSocket(socket)
    renderPage()
    await fireEvent.input(commandField(), { target: { value: 'status' } })
    expect(screen.getByRole('button', { name: 'Execute command' })).toBeDisabled()
    socket.confirm()
    await fireEvent.input(commandField(), { target: { value: 'é'.repeat(4097) } })
    expect(screen.getByRole('button', { name: 'Execute command' })).toBeDisabled()
    await fireEvent.input(commandField(), { target: { value: 'status' } })
    expect(screen.getByRole('button', { name: 'Execute command' })).toBeEnabled()
    setAuthSession(undefined)
    await fireEvent.input(commandField(), { target: { value: 'status' } })
    expect(screen.getByRole('button', { name: 'Execute command' })).toBeDisabled()
    expect(fetchAPI).not.toHaveBeenCalled()
  })

  it('allows an authorized delegated dashboard session without Steam or in-game player metadata', async () => {
    const socket = new Socket()
    setSocket(socket)
    setAuthSession({ ...authSession()!, session: { ...authSession()!.session, actorDiscordID: '222222222222222222' } })
    renderPage()
    socket.confirm()
    vi.mocked(fetchAPI).mockImplementationOnce(async () => commandAck())
    await openCommand('status')
    expect(fetchAPI).not.toHaveBeenCalled()
    await fireEvent.click(commandDialog().getByRole('button', { name: 'Confirm execution' }))
    await vi.waitFor(() => expect(document.getElementById('server-console-command')).not.toHaveAttribute('open'))
    expect(fetchAPI).toHaveBeenCalledTimes(1)
    expect(commandField()).toHaveValue('')
    expect(
      screen.getByText(
        'Dashboard administrators with access to this server can execute console commands. Each command requires confirmation.',
      ),
    ).toBeInTheDocument()
  })

  it('does not dispatch console commands without the required capability', async () => {
    const socket = new Socket()
    setSocket(socket)
    renderPage(false)
    await openCommand('status')
    expect(document.getElementById('server-console-command')).not.toHaveAttribute('open')
    expect(fetchAPI).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Execute command' })).toBeDisabled()
  })

  it('preserves a command draft while capability access expires and is refreshed', async () => {
    const socket = new Socket()
    setSocket(socket)
    const view = renderPage()
    socket.confirm()
    await fireEvent.input(commandField(), { target: { value: 'status' } })
    view.setPremium(false)
    expect(commandField()).toHaveValue('status')
    expect(screen.getByRole('button', { name: 'Execute command' })).toBeDisabled()
    view.setPremium(true)
    socket.confirm()
    expect(commandField()).toHaveValue('status')
    expect(screen.getByRole('button', { name: 'Execute command' })).toBeEnabled()
    expect(fetchAPI).not.toHaveBeenCalled()
  })
  it('retains valid escaped text whose encoded JSON exceeds 40,000 characters', () => {
    const socket = new Socket()
    setSocket(socket)
    renderPage()
    socket.confirm()
    const text = '\\'.repeat(22_000)
    socket.output(text)
    expect(viewOutput().textContent).toBe(text)
  })
  it('subscribes only while mounted, renews its lease and unsubscribes the exact server on cleanup', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const socket = new Socket()
    setSocket(socket)
    const view = renderPage()
    expect(socket.packets()).toEqual([{ action: 'console_subscribe', data: { serverID: 's1' } }])
    socket.confirm()
    expect(screen.getByText('Live')).toBeInTheDocument()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(socket.packets()).toHaveLength(2)
    socket.confirm()
    view.unmount()
    expect(socket.packets().at(-1)).toEqual({ action: 'console_unsubscribe', data: { serverID: 's1' } })
    const count = socket.send.mock.calls.length
    await vi.advanceTimersByTimeAsync(30_000)
    socket.dispatchEvent(new Event('open'))
    window.dispatchEvent(new Event('pageshow'))
    expect(socket.send).toHaveBeenCalledTimes(count)
  })

  it('waits for an open socket, binds reconnects and removes listeners from the previous transport', () => {
    const first = new Socket()
    first.readyState = WebSocket.CONNECTING
    const remove = vi.spyOn(first, 'removeEventListener')
    setSocket(first)
    renderPage()
    expect(first.send).not.toHaveBeenCalled()
    first.readyState = WebSocket.OPEN
    first.dispatchEvent(new Event('open'))
    first.confirm()
    first.output('old connection\n')
    expect(viewOutput()).toHaveTextContent('old connection')
    const second = new Socket()
    setSocket(second)
    expect(first.packets().at(-1)).toEqual({ action: 'console_unsubscribe', data: { serverID: 's1' } })
    expect(remove.mock.calls.map(([name]) => name)).toEqual(expect.arrayContaining(['open', 'message', 'close']))
    expect(second.packets()).toEqual([{ action: 'console_subscribe', data: { serverID: 's1' } }])
    first.output('must be ignored')
    expect(viewOutput()).not.toHaveTextContent('must be ignored')
    second.confirm()
    second.output('new connection\n')
    expect(viewOutput()).toHaveTextContent('new connection')
    expect(viewOutput()).not.toHaveTextContent('old connection')
  })

  it('unsubscribes the old route before subscribing a different server', async () => {
    const socket = new Socket()
    setSocket(socket)
    const view = renderPage()
    socket.confirm()
    socket.output('server one\n')
    view.history.set({ value: '/dashboard/guilds/g1/config/servers/s2/console' })
    await vi.waitFor(() =>
      expect(socket.packets().at(-1)).toEqual({ action: 'console_subscribe', data: { serverID: 's2' } }),
    )
    expect(socket.packets().slice(-2)).toEqual([
      { action: 'console_unsubscribe', data: { serverID: 's1' } },
      { action: 'console_subscribe', data: { serverID: 's2' } },
    ])
    socket.confirm(true, undefined, 's2')
    socket.output('wrong server\n')
    socket.output('server two\n', 's2')
    expect(viewOutput()).toHaveTextContent('server two')
    expect(viewOutput()).not.toHaveTextContent('server one')
    expect(viewOutput()).not.toHaveTextContent('wrong server')
  })

  it('shows only validated, acknowledged and server-scoped output as plain text', () => {
    const socket = new Socket()
    setSocket(socket)
    renderPage()
    socket.output('before acknowledgement')
    socket.confirm(true, undefined, 'other-server')
    socket.output('still unconfirmed')
    expect(viewOutput()).not.toHaveTextContent('before acknowledgement')
    expect(viewOutput()).not.toHaveTextContent('still unconfirmed')
    socket.confirm()
    socket.output('other server', 'other-server')
    socket.dispatchEvent(new MessageEvent('message', { data: '{invalid' }))
    socket.message({ action: 'console_live_exporter', serverID: 's1', data: { data: { nested: true } } })
    socket.output('x'.repeat(32_769))
    socket.output('<script>window.compromised = true</script>\nsecond line\n')
    expect(viewOutput().textContent).toBe('<script>window.compromised = true</script>\nsecond line\n')
    expect(viewOutput().querySelector('script')).toBeNull()
  })

  it('bounds retained output, permits clearing it and lets the reader turn off following', async () => {
    const socket = new Socket()
    setSocket(socket)
    renderPage()
    socket.confirm()
    socket.output('discarded first line\n')
    socket.output(Array.from({ length: 2100 }, (_, line) => `line ${line}`).join('\n'))
    expect(viewOutput().textContent!.split('\n')).toHaveLength(2000)
    expect(viewOutput()).not.toHaveTextContent('discarded first line')
    expect(viewOutput()).toHaveTextContent('line 2099')
    for (let index = 0; index < 6; index++) socket.output('x'.repeat(30_000))
    expect(viewOutput().textContent!.length).toBeLessThanOrEqual(128 * 1024)
    const checkbox = screen.getByRole('checkbox', { name: 'Follow new output' })
    expect(checkbox).toBeChecked()
    await fireEvent.click(checkbox)
    expect(checkbox).not.toBeChecked()
    await fireEvent.click(screen.getByRole('button', { name: 'Clear output' }))
    expect(viewOutput()).toHaveTextContent('New console output will appear here once the stream is active.')
    expect(screen.getByRole('button', { name: 'Clear output' })).toBeDisabled()
  })

  it('stops on pagehide and resumes only when the same page is restored', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const socket = new Socket()
    setSocket(socket)
    renderPage()
    socket.confirm()
    window.dispatchEvent(new Event('pagehide'))
    expect(socket.packets().at(-1)).toEqual({ action: 'console_unsubscribe', data: { serverID: 's1' } })
    const count = socket.send.mock.calls.length
    await vi.advanceTimersByTimeAsync(30_000)
    socket.output('hidden page output')
    expect(socket.send).toHaveBeenCalledTimes(count)
    expect(viewOutput()).not.toHaveTextContent('hidden page output')
    window.dispatchEvent(new Event('pageshow'))
    expect(socket.packets().at(-1)).toEqual({ action: 'console_subscribe', data: { serverID: 's1' } })
  })

  it('does not start without the capability and clears/unsubscribes after access is lost', () => {
    const socket = new Socket()
    setSocket(socket)
    const view = renderPage(false)
    expect(socket.send).not.toHaveBeenCalled()
    expect(screen.getByText('This feature requires Premium.')).toBeInTheDocument()
    view.setPremium(true)
    expect(socket.packets()).toEqual([{ action: 'console_subscribe', data: { serverID: 's1' } }])
    socket.confirm()
    socket.output('private console output\n')
    view.setPremium(false)
    expect(socket.packets().at(-1)).toEqual({ action: 'console_unsubscribe', data: { serverID: 's1' } })
    socket.output('revoked output')
    expect(viewOutput()).not.toHaveTextContent('private console output')
    expect(viewOutput()).not.toHaveTextContent('revoked output')
  })

  it('shows backend failures and times out missing acknowledgements without accepting output', async () => {
    vi.useFakeTimers()
    const socket = new Socket()
    setSocket(socket)
    renderPage()
    socket.confirm(false, 'server_offline')
    expect(screen.getByText('Game server offline')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(socket.packets().filter((packet) => packet.action === 'console_subscribe')).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(8_001)
    expect(screen.getByText('The console stream is temporarily unavailable.')).toBeInTheDocument()
    socket.output('unconfirmed data')
    expect(viewOutput()).not.toHaveTextContent('unconfirmed data')
    socket.confirm(false, 'forbidden')
    expect(screen.getByText('Access to this console is unavailable.')).toBeInTheDocument()
    const count = socket.send.mock.calls.length
    await vi.advanceTimersByTimeAsync(30_000)
    expect(socket.send).toHaveBeenCalledTimes(count)
  })
})
