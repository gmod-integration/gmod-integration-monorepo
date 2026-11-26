import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { cleanup, screen } from '@solidjs/testing-library'
import { historyAt, renderWithProviders } from '../../../../../testUtils.js'
import type { StatusPreviewButton } from '@gmod/schema/server/StatusMessagePreviewSchema.js'

vi.mock('../../../../../../src/utils/api.js', () => ({ fetchAPI: vi.fn() }))
const { fetchAPI } = await import('../../../../../../src/utils/api.js')
const { StatusPreviewProvider, useStatusPreview } =
  await import('../../../../../../src/pages/dashboard/guilds/servers/status/StatusPreviewContext.js')
import type { StatusPreviewContextValue } from '../../../../../../src/pages/dashboard/guilds/servers/status/StatusPreviewContext.js'
import { useI18n } from '../../../../../../src/i18n.js'

const url = '/users/:discordID/guilds/:guildID/servers/:serverID/status/preview'
const result = (title: string) => ({
  simulation: true,
  bot: { name: 'Preview Bot', avatarUrl: null },
  online: false,
  embeds: [{ title, color: 0, fields: [], timestamp: '2026-11-20T12:00:00.000Z', imageUrl: null }],
  buttonRows: [],
})
const ok = (title: string) => ({ ok: true, json: async () => result(title) })
let context: StatusPreviewContextValue
function renderProvider(options: Parameters<typeof renderWithProviders>[1] = {}) {
  return renderWithProviders(
    () => (
      <StatusPreviewProvider>
        {(() => {
          context = useStatusPreview()!
          const { updateLocale } = useI18n()
          return (
            <div>
              <span data-testid="title">{context.preview()?.embeds[0].title}</span>
              <span data-testid="loading">{String(context.loading())}</span>
              <span data-testid="error">{context.error()}</span>
              <button onClick={() => updateLocale('fr')}>Français</button>
              <button onClick={() => updateLocale('en')}>English</button>
            </div>
          )
        })()}
      </StatusPreviewProvider>
    ),
    options,
  )
}
const tick = () => vi.advanceTimersByTimeAsync(250)
beforeEach(() => {
  window.localStorage.clear()
  vi.useFakeTimers()
  ;(fetchAPI as Mock).mockReset()
  ;(fetchAPI as Mock).mockResolvedValue(ok('Stored status'))
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('StatusPreviewProvider read-only live rendering', () => {
  it('requests stored settings initially and coalesces rapid draft changes into one preview', async () => {
    renderProvider()
    expect(context.loading()).toBe(true)
    expect(fetchAPI).not.toHaveBeenCalled()
    context.setSettings({ show_player_list_status: true })
    context.setSettings({ status_player_list_format: '{name}' })
    context.setSettings({ status_player_list_format: '{name} {name}' })
    await vi.advanceTimersByTimeAsync(249)
    expect(fetchAPI).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(fetchAPI).toHaveBeenCalledTimes(1)
    expect(fetchAPI).toHaveBeenCalledWith(
      url,
      'POST',
      {
        simulation: true,
        locale: 'en',
        settings: { show_player_list_status: true, status_player_list_format: '{name} {name}' },
      },
      { signal: expect.any(AbortSignal) },
    )
    expect(screen.getByTestId('title')).toHaveTextContent('Stored status')
    expect(context.loading()).toBe(false)
  })

  it('requests simulation only for previews and preserves its response metadata', async () => {
    renderProvider()
    await tick()
    expect(fetchAPI).toHaveBeenCalledWith(
      url,
      'POST',
      { simulation: true, locale: 'en', settings: {} },
      { signal: expect.any(AbortSignal) },
    )
    expect(context.preview()!.simulation).toBe(true)
    expect((fetchAPI as Mock).mock.calls.every(([endpoint, method]) => endpoint === url && method === 'POST')).toBe(
      true,
    )
    expect(context.preview()!.online).toBe(false)
    expect(context.error()).toBeUndefined()
  })

  it('reuses the rendered result for equivalent saved drafts and newly assigned button IDs', async () => {
    const button = { name: 'Rules', emoji: '📘', url: 'https://example.test/rules', enable: true }
    renderProvider()
    context.setSettings({ show_player_list_status: true, status_player_list_format: '{name}' })
    context.setButtons([button])
    await tick()
    expect(fetchAPI).toHaveBeenCalledOnce()
    context.setSettings({ status_player_list_format: '{name}', show_player_list_status: true })
    context.setButtons([
      { ...button, id: 7 },
      { ...button, name: 'Disabled', enable: false },
    ])
    await vi.advanceTimersByTimeAsync(1_000)
    expect(fetchAPI).toHaveBeenCalledOnce()
    expect(context.loading()).toBe(false)
    expect(context.preview()!.embeds[0].title).toBe('Stored status')

    // An explicit refresh still reads live data and sends the canonical button ID.
    context.refetch()
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchAPI).toHaveBeenCalledTimes(2)
    expect((fetchAPI as Mock).mock.calls[1][2].buttons).toEqual([{ ...button, id: 7 }])
  })

  it('keeps an equivalent in-flight preview current instead of restarting it after saved draft hydration', async () => {
    let resolve!: (value: unknown) => void
    ;(fetchAPI as Mock).mockReturnValueOnce(new Promise((done) => (resolve = done)))
    renderProvider()
    context.setSettings({ status_player_list_format: '{name}' })
    await tick()
    context.setSettings({ status_player_list_format: '{name}' })
    await tick()
    expect(fetchAPI).toHaveBeenCalledOnce()
    resolve(ok('Current status'))
    await vi.advanceTimersByTimeAsync(0)
    expect(context.preview()!.embeds[0].title).toBe('Current status')
    expect(context.loading()).toBe(false)
  })

  it('requests a new server preview even when its rendered draft equals the previous server', async () => {
    const history = historyAt('/dashboard/guilds/g1/config/servers/s1/status')
    renderProvider({ path: '/dashboard/guilds/:guildID/config/servers/:serverID/status', history })
    await tick()
    expect(fetchAPI).toHaveBeenCalledOnce()
    history.set({ value: '/dashboard/guilds/g1/config/servers/s2/status' })
    await tick()
    expect(fetchAPI).toHaveBeenCalledTimes(2)
  })

  it('preserves an unavailable result through equivalent drafts until explicitly retried', async () => {
    ;(fetchAPI as Mock).mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce(ok('Recovered status'))
    renderProvider()
    context.setSettings({ status_player_list_format: '{name}' })
    await tick()
    expect(context.error()).toBe('Unable to load the preview.')
    context.setSettings({ status_player_list_format: '{name}' })
    await tick()
    expect(fetchAPI).toHaveBeenCalledOnce()
    expect(context.error()).toBe('Unable to load the preview.')
    context.refetch()
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchAPI).toHaveBeenCalledTimes(2)
    expect(context.error()).toBeUndefined()
    expect(context.preview()!.embeds[0].title).toBe('Recovered status')
  })

  it('queues only the newest draft while a slow preview is rendering', async () => {
    let resolve!: (value: unknown) => void
    ;(fetchAPI as Mock)
      .mockReturnValueOnce(new Promise((done) => (resolve = done)))
      .mockResolvedValueOnce(ok('Newest status'))
    renderProvider()
    await tick()
    context.setSettings({ status_player_list_format: 'Intermediate draft' })
    await tick()
    context.setSettings({ status_player_list_format: 'Newest draft' })
    await tick()
    expect(fetchAPI).toHaveBeenCalledOnce()
    expect(context.loading()).toBe(true)
    resolve(ok('Outdated status'))
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchAPI).toHaveBeenCalledTimes(2)
    expect((fetchAPI as Mock).mock.calls[1][2].settings.status_player_list_format).toBe('Newest draft')
    expect(context.preview()!.embeds[0].title).toBe('Newest status')
    expect(context.loading()).toBe(false)
    await tick()
    expect(fetchAPI).toHaveBeenCalledTimes(2)
  })

  it('bounds a stalled preview before requesting the queued current draft', async () => {
    ;(fetchAPI as Mock)
      .mockImplementationOnce(
        (_url, _method, _draft, { signal }: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason))),
      )
      .mockResolvedValueOnce(ok('Recovered newest status'))
    renderProvider()
    await tick()
    context.setSettings({ status_player_list_format: 'Newest draft' })
    await tick()
    expect(fetchAPI).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(fetchAPI).toHaveBeenCalledTimes(2)
    expect((fetchAPI as Mock).mock.calls[1][2].settings.status_player_list_format).toBe('Newest draft')
    expect(context.preview()!.embeds[0].title).toBe('Recovered newest status')
    expect(context.error()).toBeUndefined()
    expect(context.loading()).toBe(false)
  })

  it('uses the saved website language and discards an old-language response after switching', async () => {
    window.localStorage.setItem('locale', 'fr')
    let resolveFrench!: (value: unknown) => void
    ;(fetchAPI as Mock)
      .mockReturnValueOnce(new Promise((resolve) => (resolveFrench = resolve)))
      .mockResolvedValueOnce(ok('English status'))
    renderProvider()
    context.setSettings({ status_player_list_format: '**{name}**' })
    await tick()
    expect(fetchAPI).toHaveBeenLastCalledWith(
      url,
      'POST',
      {
        simulation: true,
        locale: 'fr',
        settings: { status_player_list_format: '**{name}**' },
      },
      { signal: expect.any(AbortSignal) },
    )

    screen.getByRole('button', { name: 'English' }).click()
    expect(context.loading()).toBe(true)
    resolveFrench(ok('Statut français'))
    await Promise.resolve()
    await Promise.resolve()
    expect(context.preview()).toBeUndefined()
    await tick()
    expect(fetchAPI).toHaveBeenLastCalledWith(
      url,
      'POST',
      {
        simulation: true,
        locale: 'en',
        settings: { status_player_list_format: '**{name}**' },
      },
      { signal: expect.any(AbortSignal) },
    )
    expect(screen.getByTestId('title')).toHaveTextContent('English status')
    expect(context.loading()).toBe(false)
  })

  it('discards stale responses even when they resolve during the next debounce window', async () => {
    let resolveOld!: (value: unknown) => void
    ;(fetchAPI as Mock)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveOld = resolve
        }),
      )
      .mockResolvedValueOnce(ok('Latest status'))
    renderProvider()
    await tick()
    context.setSettings({ status_player_list_format: 'new draft' })
    expect(context.loading()).toBe(true)
    resolveOld(ok('Outdated status'))
    await Promise.resolve()
    await Promise.resolve()
    expect(context.preview()).toBeUndefined()
    await tick()
    expect(context.preview()!.embeds[0].title).toBe('Latest status')
  })

  it('renders errors for HTTP or malformed responses and retries the current draft immediately', async () => {
    ;(fetchAPI as Mock)
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce(ok('Recovered status'))
    renderProvider()
    await tick()
    expect(context.error()).toBe('Unable to load the preview.')
    expect(context.loading()).toBe(false)
    context.refetch()
    await Promise.resolve()
    await Promise.resolve()
    expect(context.error()).toBe('Unable to load the preview.')
    context.refetch()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(context.error()).toBeUndefined()
    expect(context.preview()!.embeds[0].title).toBe('Recovered status')
  })

  it.each(['provider_unavailable', 'discord_service_unavailable'])(
    'explains %s in the selected language and retries the preserved draft',
    async (code) => {
      window.localStorage.setItem('locale', 'fr')
      ;(fetchAPI as Mock)
        .mockResolvedValueOnce({ ok: false, json: async () => ({ error: code }) })
        .mockResolvedValueOnce(ok('Recovered status'))
      renderProvider()
      context.setSettings({ status_player_list_format: '**{name}**' })
      await tick()
      expect(context.error()).toBe('Discord est temporairement indisponible. Patientez un instant, puis réessayez.')
      context.refetch()
      await vi.advanceTimersByTimeAsync(0)
      expect(fetchAPI).toHaveBeenLastCalledWith(
        url,
        'POST',
        {
          simulation: true,
          locale: 'fr',
          settings: { status_player_list_format: '**{name}**' },
        },
        { signal: expect.any(AbortSignal) },
      )
      expect(context.error()).toBeUndefined()
      expect(context.preview()!.embeds[0].title).toBe('Recovered status')
    },
  )

  it('sends only enabled draft buttons within the real Discord row capacity', async () => {
    const button: StatusPreviewButton = {
      id: 1,
      name: 'Rules',
      emoji: '📘',
      url: 'https://example.test/rules',
      enable: true,
    }
    const original = { ...button }
    renderProvider()
    context.setButtons([
      { ...button, id: 0, enable: false },
      ...Array.from({ length: 30 }, (_, i) => ({ ...button, id: i + 1 })),
    ])
    await tick()
    const sent = (fetchAPI as Mock).mock.calls[0][2]
    expect(sent.buttons).toHaveLength(25)
    expect(sent.buttons.every((row: StatusPreviewButton) => row.enable)).toBe(true)
    expect(button).toEqual(original)
    context.setButtons(undefined)
    await tick()
    expect((fetchAPI as Mock).mock.calls.at(-1)![2]).not.toHaveProperty('buttons')
  })

  it('shows actionable server validation messages and keeps oversized errors generic', async () => {
    ;(fetchAPI as Mock)
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Status charts require Premium.' }) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'x'.repeat(501) }) })
    renderProvider()
    await tick()
    expect(context.error()).toBe('Status charts require Premium.')
    context.refetch()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(context.error()).toBe('Unable to load the preview.')
  })

  it('clears a pending debounce and ignores an inflight response after unmount', async () => {
    const first = renderProvider()
    first.unmount()
    await tick()
    expect(fetchAPI).not.toHaveBeenCalled()
    context.refetch()
    expect(fetchAPI).not.toHaveBeenCalled()
    let resolve!: (value: unknown) => void
    ;(fetchAPI as Mock).mockReturnValue(
      new Promise((done) => {
        resolve = done
      }),
    )
    const second = renderProvider()
    await tick()
    const disposed = context
    context.setSettings({ status_player_list_format: 'Queued draft' })
    await tick()
    const signal = (fetchAPI as Mock).mock.calls.at(-1)![3].signal as AbortSignal
    second.unmount()
    expect(signal.aborted).toBe(true)
    resolve(ok('Too late'))
    await Promise.resolve()
    await Promise.resolve()
    expect(disposed.preview()).toBeUndefined()
    expect(fetchAPI).toHaveBeenCalledOnce()
  })

  it('strips database metadata before posting a strict draft button payload', async () => {
    renderProvider()
    const stored = {
      id: 7,
      name: 'Docs',
      emoji: '📘',
      url: 'https://example.test',
      enable: true,
      server: 's1',
      createdAt: '2026-11-20',
      updatedAt: '2026-11-20',
    }
    context.setButtons([stored])
    await tick()
    expect((fetchAPI as Mock).mock.calls[0][2].buttons).toEqual([
      { id: 7, name: 'Docs', emoji: '📘', url: 'https://example.test', enable: true },
    ])
    context.setButtons([{ name: 'New', emoji: '📘', url: 'https://example.test', enable: true }])
    await tick()
    expect((fetchAPI as Mock).mock.calls.at(-1)![2].buttons[0]).not.toHaveProperty('id')
  })

  it('returns no context outside the provider for isolated legacy editor components', () => {
    let outside: StatusPreviewContextValue | undefined
    renderWithProviders(() => {
      outside = useStatusPreview()
      return <span>Isolated</span>
    })
    expect(outside).toBeUndefined()
  })
})
