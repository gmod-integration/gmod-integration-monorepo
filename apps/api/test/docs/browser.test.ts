import { runInNewContext } from 'node:vm'
import { Window } from 'happy-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { docsBrowserSource } from '../../src/docs/browser.js'
import { createDocsPage } from '../../src/docs/page.js'

const config = {
  apiUrl: 'http://localhost:53136',
  wsUrl: 'ws://localhost:53139',
  websiteUrl: 'http://localhost:3000',
}
const session = { authenticated: true, csrfToken: 'test-csrf-private' }
const asyncapi = {
  components: {
    messages: {
      status: {
        name: 'server_status',
        summary: 'État du serveur',
        'x-client': 'dashboard',
        'x-direction': 'client-to-server',
        payload: { type: 'object' },
        examples: [{ payload: { action: 'server_status' } }],
      },
    },
  },
}

const windows: Window[] = []
afterEach(() => {
  for (const window of windows.splice(0)) window.happyDOM.abort()
  vi.restoreAllMocks()
})

async function boot(
  options: {
    url?: string
    configuration?: unknown
    handler?: (url: string, init?: RequestInit) => Promise<Response> | undefined
  } = {},
) {
  const window = new Window({
    url: options.url || config.apiUrl + '/v6/docs',
    settings: { disableCSSFileLoading: true, disableJavaScriptFileLoading: true },
  })
  windows.push(window)
  window.document.write(createDocsPage())
  const fetch = vi.fn((input: string | URL, init?: RequestInit) => {
    const url = String(input)
    const handled = options.handler?.(url, init)
    if (handled) return handled
    if (url.endsWith('/config.json')) return Promise.resolve(Response.json(options.configuration || config))
    if (url.endsWith('/asyncapi.json')) return Promise.resolve(Response.json(asyncapi))
    if (url.endsWith('/auth/session')) return Promise.resolve(Response.json(session))
    if (url.endsWith('/auth/ws-ticket')) return Promise.resolve(Response.json({ ticket: 'test-ticket-private' }))
    throw new Error('Unexpected fetch ' + url)
  })
  const sockets: FakeSocket[] = []
  class FakeSocket {
    static OPEN = 1
    readyState = 0
    onopen?: () => void
    onmessage?: (event: { data: unknown }) => void
    onclose?: (event: { code: number; reason: string }) => void
    onerror?: () => void
    send = vi.fn()
    close = vi.fn((code = 1000, reason = '') => {
      this.readyState = 3
      this.onclose?.({ code, reason })
    })
    constructor(public url: string) {
      sockets.push(this)
    }
    open() {
      this.readyState = 1
      this.onopen?.()
    }
    receive(data: unknown) {
      this.onmessage?.({ data })
    }
  }
  const swagger = vi.fn()
  Object.assign(window, { SwaggerUIBundle: swagger })
  runInNewContext(docsBrowserSource, {
    window,
    document: window.document,
    location: window.location,
    fetch,
    WebSocket: FakeSocket,
    Headers,
    URL,
    AbortSignal,
  })
  const element = <T extends HTMLElement = HTMLElement>(id: string) =>
    window.document.getElementById(id)! as unknown as T
  await vi.waitFor(() =>
    expect(element('ws-target').textContent !== 'Chargement…' || !element('docs-error').hidden).toBe(true),
  )
  return { window, fetch, swagger, sockets, element }
}

describe('API documentation browser', () => {
  it('initializes local Swagger and renders the AsyncAPI contract with accessible tabs', async () => {
    const page = await boot()
    await vi.waitFor(() => expect(page.element('asyncapi-messages').textContent).toContain('État du serveur'))
    const options = page.swagger.mock.calls[0][0]
    expect(options).toMatchObject({
      url: '/v6/docs/openapi.json',
      validatorUrl: null,
      persistAuthorization: false,
      withCredentials: true,
    })
    expect(page.element<HTMLAnchorElement>('dashboard-link').href).toBe('http://localhost:3000/dashboard/guilds')
    page.element('tab-ws').click()
    expect(page.element('tab-ws').getAttribute('aria-selected')).toBe('true')
    expect(page.element('panel-http').hidden).toBe(true)
    page.element('tab-ws').dispatchEvent(new page.window.KeyboardEvent('keydown', { key: 'ArrowLeft' }))
    expect(page.element('tab-http').getAttribute('aria-selected')).toBe('true')
    expect(page.window.document.activeElement?.id).toBe('tab-http')
    expect(page.window.localStorage.length).toBe(0)
  })

  it('obtains fresh CSRF for a cookie mutation and refuses sending credentials outside this API', async () => {
    const page = await boot()
    const interceptor = page.swagger.mock.calls[0][0].requestInterceptor
    const request = await interceptor({ url: config.apiUrl + '/v6/guilds/guild/settings', method: 'PUT', headers: {} })
    expect(request.headers['x-csrf-token']).toBe(session.csrfToken)
    expect(request.credentials).toBe('include')
    expect(page.fetch).toHaveBeenCalledWith(
      new URL(config.apiUrl + '/v6/auth/session'),
      expect.objectContaining({ credentials: 'include', cache: 'no-store' }),
    )
    const calls = page.fetch.mock.calls.length
    await expect(interceptor({ url: 'https://external.example/v6/settings', method: 'POST' })).rejects.toThrow(
      'limités',
    )
    await expect(interceptor({ url: config.apiUrl + '/v3/settings', method: 'POST' })).rejects.toThrow('limités')
    expect(page.fetch).toHaveBeenCalledTimes(calls)
  })

  it('does not require a cookie session for bearer requests, reads or one-use legacy conversion', async () => {
    const page = await boot()
    const interceptor = page.swagger.mock.calls[0][0].requestInterceptor
    const calls = page.fetch.mock.calls.length
    const authorized = await interceptor({
      url: '/v6/guilds/g/settings',
      method: 'PUT',
      headers: { Authorization: 'Bearer test-only' },
    })
    expect(authorized.headers.authorization).toBe('Bearer test-only')
    expect(authorized.headers['x-csrf-token']).toBeUndefined()
    await interceptor({ url: '/v6/auth/legacy-session', method: 'POST' })
    await interceptor({ url: '/v6/auth/session', method: 'GET' })
    expect(page.fetch).toHaveBeenCalledTimes(calls)
  })

  it('uses an expired delegation recovery proof only for returning to the actor or logout', async () => {
    const page = await boot({
      handler: (url) =>
        url.endsWith('/auth/session')
          ? Promise.resolve(
              Response.json(
                { error: { code: 'actor_session_available' }, csrfToken: 'actor-recovery-proof' },
                { status: 401 },
              ),
            )
          : undefined,
    })
    const interceptor = page.swagger.mock.calls[0][0].requestInterceptor
    const result = await interceptor({ url: '/v6/auth/impersonations/end', method: 'POST' })
    expect(result.headers['x-csrf-token']).toBe('actor-recovery-proof')
    await expect(interceptor({ url: '/v6/guilds/g/settings', method: 'PUT' })).rejects.toThrow('session valide')
    expect(page.window.document.body.textContent).not.toContain('actor-recovery-proof')
  })

  it('still obtains the cookie CSRF proof for ending delegation when Swagger adds an Authorization header', async () => {
    const page = await boot({
      handler: (url) =>
        url.endsWith('/auth/session')
          ? Promise.resolve(
              Response.json(
                { error: { code: 'actor_session_available' }, csrfToken: 'actor-cookie-proof' },
                { status: 401 },
              ),
            )
          : undefined,
    })
    const interceptor = page.swagger.mock.calls[0][0].requestInterceptor
    const request = await interceptor({
      url: '/v6/auth/impersonations/end',
      method: 'POST',
      headers: { Authorization: 'Bearer unrelated-expired-token' },
    })
    expect(request.headers['x-csrf-token']).toBe('actor-cookie-proof')
    expect(page.fetch).toHaveBeenCalledWith(
      new URL(config.apiUrl + '/v6/auth/session'),
      expect.objectContaining({ credentials: 'include' }),
    )
    expect(page.window.document.body.textContent).not.toContain('actor-cookie-proof')
  })

  it('connects with a fresh ticket, sends JSON and masks secrets in received messages', async () => {
    let ticketNumber = 0
    const page = await boot({
      handler: (url) =>
        url.endsWith('/auth/ws-ticket')
          ? Promise.resolve(Response.json({ ticket: 'test-ticket-private-' + ++ticketNumber }))
          : undefined,
    })
    page.element('ws-connect').click()
    page.element('ws-connect').click()
    await vi.waitFor(() => expect(page.sockets).toHaveLength(1))
    expect(page.fetch).toHaveBeenCalledWith(
      new URL(config.apiUrl + '/v6/auth/ws-ticket'),
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken },
      }),
    )
    const first = page.sockets[0]
    expect(new URL(first.url).searchParams.get('ticket')).toBe('test-ticket-private-1')
    first.open()
    expect(page.element<HTMLButtonElement>('ws-send').disabled).toBe(false)
    page.element<HTMLInputElement>('server-id').value = 'my-server'
    page.element('ws-example').click()
    page.element('ws-send').click()
    expect(first.send).toHaveBeenCalledExactlyOnceWith(
      JSON.stringify({ action: 'server_status', data: { serverID: 'my-server' } }),
    )
    first.receive(
      JSON.stringify({
        data: {
          ticket: 'test-ticket-private-1',
          text: 'Bearer abc.def-private',
          nested: { password: 'hidden-password' },
        },
      }),
    )
    first.receive('URL ?ticket=test-ticket-private-1')
    expect(page.element('ws-events').textContent).toContain('[masqué]')
    expect(page.window.document.body.textContent).not.toContain('test-ticket-private-1')
    expect(page.window.document.body.textContent).not.toContain('hidden-password')
    expect(page.window.document.body.textContent).not.toContain('abc.def-private')
    page.element('ws-disconnect').click()
    expect(first.close).toHaveBeenCalledWith(1000, 'Console déconnectée')
    page.element('ws-connect').click()
    await vi.waitFor(() => expect(page.sockets).toHaveLength(2))
    expect(new URL(page.sockets[1].url).searchParams.get('ticket')).toBe('test-ticket-private-2')
    expect(page.sockets[1].send).not.toHaveBeenCalled()
    expect(page.window.localStorage.length).toBe(0)
  })

  it('keeps JSON editable on errors and never sends malformed messages or replays on reconnect', async () => {
    const page = await boot()
    page.element('ws-connect').click()
    await vi.waitFor(() => expect(page.sockets).toHaveLength(1))
    const socket = page.sockets[0]
    socket.open()
    const input = page.element<HTMLTextAreaElement>('ws-message')
    input.value = '{broken'
    page.element('ws-send').click()
    expect(input.value).toBe('{broken')
    expect(socket.send).not.toHaveBeenCalled()
    expect(page.element('ws-feedback').textContent).toContain('Envoi impossible')
    input.value = '[]'
    page.element('ws-send').click()
    expect(socket.send).not.toHaveBeenCalled()
    socket.onerror?.()
    expect(page.element('ws-feedback').textContent).toContain('échoué')
    socket.close(4003, 'Discord authorization required')
    expect(page.element('ws-status').textContent).toContain('4003')
    expect(page.element<HTMLButtonElement>('ws-connect').disabled).toBe(false)
    expect(page.sockets).toHaveLength(1)
    page.element('ws-clear').click()
    expect(page.element('ws-events').children).toHaveLength(0)
  })

  it('does not connect a stale ticket if the user disconnects while its request is pending', async () => {
    let release!: (response: Response) => void
    const ticket = new Promise<Response>((resolve) => {
      release = resolve
    })
    const page = await boot({ handler: (url) => (url.endsWith('/auth/ws-ticket') ? ticket : undefined) })
    page.element('ws-connect').click()
    await vi.waitFor(() => expect(page.fetch.mock.calls.some(([url]) => String(url).endsWith('/ws-ticket'))).toBe(true))
    page.element('ws-disconnect').click()
    release(Response.json({ ticket: 'stale-ticket-must-not-connect' }))
    await Promise.resolve()
    await Promise.resolve()
    expect(page.sockets).toHaveLength(0)
    expect(page.element<HTMLButtonElement>('ws-connect').disabled).toBe(false)
    expect(page.window.document.body.textContent).not.toContain('stale-ticket-must-not-connect')
  })

  it('shows sign-in guidance for an absent session without clearing the JSON editor', async () => {
    const page = await boot({
      handler: (url) =>
        url.endsWith('/auth/session') ? Promise.resolve(Response.json({}, { status: 401 })) : undefined,
    })
    page.element<HTMLTextAreaElement>('ws-message').value = '{"action":"server_status","data":{"serverID":"keep"}}'
    page.element('refresh-session').click()
    await vi.waitFor(() => expect(page.element('session-status').textContent).toContain('Connectez-vous'))
    expect(page.element<HTMLTextAreaElement>('ws-message').value).toContain('keep')
    expect(page.element('docs-error').textContent).toContain('session valide')
    expect(page.sockets).toHaveLength(0)
  })

  it.each([
    { ...config, apiUrl: 'https://external.example' },
    { ...config, wsUrl: 'ws://user:password@localhost:53139' },
    { ...config, wsUrl: 'ws://localhost:53139?ticket=embedded-secret' },
    { ...config, websiteUrl: 'javascript:alert(1)' },
  ])('rejects credentials, external API origins and untrusted configuration: %j', async (configuration) => {
    const page = await boot({ configuration })
    expect(page.swagger).not.toHaveBeenCalled()
    expect(page.element('docs-error').hidden).toBe(false)
    expect(page.element<HTMLButtonElement>('ws-connect').disabled).toBe(true)
    expect(page.element('reload-docs').hidden).toBe(false)
  })

  it('opens the WebSocket tab directly for its dedicated URL', async () => {
    const page = await boot({ url: config.apiUrl + '/v6/docs/ws' })
    expect(page.element('tab-ws').getAttribute('aria-selected')).toBe('true')
    expect(page.element('panel-ws').hidden).toBe(false)
  })

  it('expands local payload references without mutating the contract or following recursive links forever', async () => {
    const document = {
      components: {
        schemas: {
          request: { type: 'object', properties: { data: { $ref: '#/components/schemas/data' } } },
          data: {
            type: 'object',
            properties: { serverID: { type: 'string' }, next: { $ref: '#/components/schemas/data' } },
          },
        },
        messages: {
          request: {
            name: 'server_status',
            payload: { $ref: '#/components/schemas/request' },
            examples: [{ payload: { action: 'server_status' } }],
          },
        },
      },
    }
    const original = JSON.stringify(document)
    const page = await boot({
      handler: (url) => (url.endsWith('/asyncapi.json') ? Promise.resolve(Response.json(document)) : undefined),
    })
    await vi.waitFor(() => expect(page.element('asyncapi-messages').querySelector('pre')).not.toBeNull())
    const displayed = JSON.parse(page.element('asyncapi-messages').querySelector('pre')!.textContent!)
    expect(displayed.payload.properties.data.properties.serverID).toEqual({ type: 'string' })
    expect(displayed.payload.properties.data.properties.next).toEqual({ $ref: '#/components/schemas/data' })
    expect(displayed.examples).toEqual(document.components.messages.request.examples)
    expect(JSON.stringify(document)).toBe(original)
  })
})
