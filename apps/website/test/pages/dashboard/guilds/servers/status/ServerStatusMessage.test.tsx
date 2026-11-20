import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@solidjs/testing-library'
import { historyAt, renderWithProviders } from '../../../../../testUtils.js'
import { okJson, errJson, stubDialogGlobal } from '../testHelpers.js'

vi.mock('../../../../../../src/utils/api.js', () => ({
  fetchAPI: vi.fn(() => Promise.resolve({ ok: true, json: async () => [] })),
  getAPIUrl: vi.fn(),
  getUrlWithActualParams: vi.fn((path: string) => path),
}))
const { fetchAPI } = await import('../../../../../../src/utils/api.js')
const { guildChannelsMutate } = await import('../../../../../../src/pages/dashboard/guilds/GuildInformations.js')
const { default: ServerStatusMessage } =
  await import('../../../../../../src/pages/dashboard/guilds/servers/status/ServerStatusMessage.js')
const { StatusPreviewProvider } =
  await import('../../../../../../src/pages/dashboard/guilds/servers/status/StatusPreviewContext.js')

const STATUS = '/users/:discordID/guilds/:guildID/servers/:serverID/status'
const SETTING = '/users/:discordID/guilds/:guildID/servers/:serverID/settings/'
const PREVIEW = STATUS + '/preview'
const snapshot = {
  bot: { name: 'Dev Bot', avatarUrl: null },
  online: true,
  embeds: [
    { title: 'Status of Demo', color: 3750465, fields: [], timestamp: '2026-11-20T12:00:00.000Z', imageUrl: null },
  ],
  buttonRows: [],
}
const settingValues: Record<string, unknown> = {
  show_player_list_status: false,
  status_player_list_format: '{name}',
  show_status_chart: false,
}
function mockApi(
  options: {
    status?: unknown
    failGet?: boolean
    failWrite?: boolean
    failPreview?: boolean
    format?: unknown
    boolStrings?: boolean
  } = {},
) {
  ;(fetchAPI as Mock).mockImplementation(
    async (path: string, method: string, body?: { value?: unknown; settings?: unknown }) => {
      if (path === PREVIEW) return options.failPreview ? errJson() : okJson(snapshot)
      if (method === 'GET') {
        if (options.failGet) return errJson()
        if (path.endsWith('/channels'))
          return okJson([{ id: 'c1', name: 'general', type: 0, position: 0, parentID: null }])
        if (path === STATUS) return okJson(options.status || {})
        if (path.startsWith(SETTING)) {
          const key = path.slice(SETTING.length)
          if (key === 'status_player_list_format' && options.format !== undefined)
            return okJson({ value: options.format })
          return okJson({
            value: options.boolStrings && key !== 'status_player_list_format' ? 'true' : settingValues[key],
          })
        }
        return okJson([])
      }
      if (options.failWrite) return errJson()
      if (method === 'POST') return okJson({ channel: 'c1', message: 'm1' })
      return okJson({ value: body?.value })
    },
  )
}
function renderPage(provider = false) {
  return renderWithProviders(
    () =>
      provider ? (
        <StatusPreviewProvider>
          <ServerStatusMessage />
        </StatusPreviewProvider>
      ) : (
        <ServerStatusMessage />
      ),
    {
      path: '/dashboard/guilds/:guildID/config/servers/:serverID/status',
      history: historyAt('/dashboard/guilds/g1/config/servers/s1/status'),
    },
  )
}
const writeCalls = () => (fetchAPI as Mock).mock.calls.filter(([path, method]) => method !== 'GET' && path !== PREVIEW)
const ready = (container: HTMLElement) =>
  vi.waitFor(() =>
    expect(container.querySelector('.fa-plus') || container.querySelector('.fa-xmark')).not.toBeDisabled(),
  )
const mainSave = () => screen.getAllByRole('button', { name: 'Save', hidden: true }).at(-1)!
const chooseChannel = async (modal: Element) => {
  await vi.waitFor(() => expect(modal.querySelector('select')).not.toBeNull())
  await fireEvent.change(modal.querySelector('select')!, { target: { value: 'c1' } })
}

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: true }))
  guildChannelsMutate([{ id: 'c1', name: 'general', type: 0, position: 0, parentID: null }])
  ;(fetchAPI as Mock).mockReset()
  mockApi()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('status message editor draft workflow', () => {
  it('loads stored settings and keeps toggles in a local draft until Save', async () => {
    const { container } = renderPage()
    await ready(container)
    expect(screen.getByText('Server Status')).toBeInTheDocument()
    expect(screen.getByText('No status message')).toBeInTheDocument()
    const toggle = screen.getByRole('checkbox', { name: /Show Player List/ })
    expect(mainSave()).toBeDisabled()
    await fireEvent.click(toggle)
    expect(toggle).toBeChecked()
    expect(writeCalls()).toHaveLength(0)
    expect(screen.getByText(/Preview only/)).toBeInTheDocument()
    await fireEvent.click(mainSave())
    await vi.waitFor(() =>
      expect(fetchAPI).toHaveBeenCalledWith(SETTING + 'show_player_list_status', 'PUT', { value: true }),
    )
    expect(writeCalls()).toHaveLength(1)
    await vi.waitFor(() => expect(mainSave()).toBeDisabled())
  })

  it('does not send when a channel is selected; explicit confirmation sends the message', async () => {
    const { container } = renderPage()
    await ready(container)
    stubDialogGlobal(container, 'select_channel_modal')
    await fireEvent.click(screen.getByRole('button', { name: 'Send Status' }))
    const modal = container.querySelector('#select_channel_modal')!
    const send = within(modal as HTMLElement).getByRole('button', { name: 'Send to Discord', hidden: true })
    expect(send).toBeDisabled()
    await chooseChannel(modal)
    expect(writeCalls()).toHaveLength(0)
    expect(send).not.toBeDisabled()
    await fireEvent.click(send)
    await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(STATUS, 'POST', { channelID: 'c1' }))
    await vi.waitFor(() => expect(screen.getByText('#general >', { exact: false })).toBeInTheDocument())
  })

  it('saves pending settings before explicitly sending the selected preview', async () => {
    const { container } = renderPage()
    await ready(container)
    await fireEvent.click(screen.getByRole('checkbox', { name: /Show Player List/ }))
    await fireEvent.click(screen.getByRole('button', { name: 'Send Status' }))
    const modal = container.querySelector('#select_channel_modal')! as HTMLElement
    await chooseChannel(modal)
    await fireEvent.click(within(modal).getByRole('button', { name: 'Send to Discord', hidden: true }))
    await vi.waitFor(() => expect(writeCalls()).toHaveLength(2))
    expect(writeCalls().map(([path]) => path)).toEqual([SETTING + 'show_player_list_status', STATUS])
  })

  it('waits for the latest live preview before enabling explicit Send', async () => {
    const { container } = renderPage(true)
    await ready(container)
    await fireEvent.click(screen.getByRole('button', { name: 'Send Status' }))
    const modal = container.querySelector('#select_channel_modal')! as HTMLElement
    await chooseChannel(modal)
    const send = within(modal).getByRole('button', { name: 'Send to Discord', hidden: true })
    expect(send).toBeDisabled()
    await vi.waitFor(() => expect(send).not.toBeDisabled())
    expect(fetchAPI).toHaveBeenCalledWith(PREVIEW, 'POST', { simulation: true, settings: { ...settingValues } })
    expect(writeCalls()).toHaveLength(0)
  })

  it('reports preview errors and prevents sending until a preview is available', async () => {
    mockApi({ failPreview: true })
    const { container } = renderPage(true)
    await ready(container)
    await fireEvent.click(screen.getByRole('button', { name: 'Send Status' }))
    const modal = container.querySelector('#select_channel_modal')! as HTMLElement
    await chooseChannel(modal)
    await vi.waitFor(() => expect(within(modal).getByText('Unable to load the preview.')).toBeInTheDocument())
    expect(within(modal).getByRole('button', { name: 'Send to Discord', hidden: true })).toBeDisabled()
    expect(writeCalls()).toHaveLength(0)
  })

  it('keeps format typing local, updates live preview, cancels safely and saves only an explicit changed format', async () => {
    const { container } = renderPage(true)
    await ready(container)
    stubDialogGlobal(container, 'edit_format')
    await fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const modal = container.querySelector('#edit_format')! as HTMLElement
    const input = within(modal).getByLabelText('Format')
    await fireEvent.input(input, { target: { value: '**{name}** - {team}' } })
    await vi.waitFor(() =>
      expect(fetchAPI).toHaveBeenCalledWith(PREVIEW, 'POST', {
        simulation: true,
        settings: { ...settingValues, status_player_list_format: '**{name}** - {team}' },
      }),
    )
    expect(writeCalls()).toHaveLength(0)
    await fireEvent.click(within(modal).getByRole('button', { name: 'Cancel', hidden: true }))
    expect(screen.getByLabelText('Player List Format:')).toHaveValue('{name}')
    await fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    await fireEvent.input(within(modal).getByLabelText('Format'), { target: { value: '{team}' } })
    expect(within(modal).getByRole('button', { name: 'Save', hidden: true })).toBeDisabled()
    await vi.waitFor(() => expect(within(modal).getByRole('button', { name: 'Save', hidden: true })).not.toBeDisabled())
    await fireEvent.click(within(modal).getByRole('button', { name: 'Save', hidden: true }))
    await vi.waitFor(() =>
      expect(fetchAPI).toHaveBeenCalledWith(SETTING + 'status_player_list_format', 'PUT', { value: '{team}' }),
    )
    expect(writeCalls()).toHaveLength(1)
  })

  it('resets the format when the native dialog is closed without saving', async () => {
    const { container } = renderPage()
    await ready(container)
    await fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const modal = container.querySelector('#edit_format')! as HTMLElement
    await fireEvent.input(within(modal).getByLabelText('Format'), { target: { value: 'unsaved' } })
    await fireEvent(modal, new Event('close'))
    expect(screen.getByLabelText('Player List Format:')).toHaveValue('{name}')
    expect(writeCalls()).toHaveLength(0)
  })

  it('blocks the chart toggle for free guilds but permits an explicitly saved premium draft', async () => {
    localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: false }))
    const free = renderPage()
    await ready(free.container)
    expect(screen.getByRole('checkbox', { name: /Show Player Chart/ })).toBeDisabled()
    free.unmount()
    localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: true }))
    const paid = renderPage()
    await ready(paid.container)
    await fireEvent.click(screen.getByRole('checkbox', { name: /Show Player Chart/ }))
    expect(writeCalls()).toHaveLength(0)
    await fireEvent.click(mainSave())
    await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(SETTING + 'show_status_chart', 'PUT', { value: true }))
  })

  it('keeps a failed Save as an unsaved draft and allows retry', async () => {
    const { container } = renderPage()
    await ready(container)
    await fireEvent.click(screen.getByRole('checkbox', { name: /Show Player List/ }))
    mockApi({ failWrite: true })
    await fireEvent.click(mainSave())
    await vi.waitFor(() => expect(screen.getByText('Unable to save the status settings.')).toBeInTheDocument())
    expect(mainSave()).not.toBeDisabled()
    mockApi()
    await fireEvent.click(mainSave())
    await vi.waitFor(() => expect(mainSave()).toBeDisabled())
  })

  it('requires the current preview before Save can publish a changed setting', async () => {
    const { container } = renderPage(true)
    await ready(container)
    await fireEvent.click(screen.getByRole('checkbox', { name: /Show Player List/ }))
    expect(mainSave()).toBeDisabled()
    expect(writeCalls()).toHaveLength(0)
    await vi.waitFor(() => expect(mainSave()).not.toBeDisabled())
    await fireEvent.click(mainSave())
    await vi.waitFor(() =>
      expect(fetchAPI).toHaveBeenCalledWith(SETTING + 'show_player_list_status', 'PUT', { value: true }),
    )
  })

  it('keeps Save disabled when a changed draft cannot be previewed', async () => {
    mockApi({ failPreview: true })
    const { container } = renderPage(true)
    await ready(container)
    await fireEvent.click(screen.getByRole('checkbox', { name: /Show Player List/ }))
    await vi.waitFor(() =>
      expect(fetchAPI).toHaveBeenCalledWith(PREVIEW, 'POST', {
        simulation: true,
        settings: { ...settingValues, show_player_list_status: true },
      }),
    )
    expect(mainSave()).toBeDisabled()
    expect(writeCalls()).toHaveLength(0)
  })

  it('shows loading failures and retries without letting users send or save unknown settings', async () => {
    mockApi({ failGet: true })
    const { container } = renderPage()
    await vi.waitFor(() => expect(screen.getByText('Unable to load the status settings.')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Send Status' })).toBeDisabled()
    mockApi()
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await ready(container)
  })

  it('loads boolean string values and normalizes invalid format values without crashing', async () => {
    mockApi({ boolStrings: true, format: 42 })
    const { container } = renderPage()
    await ready(container)
    expect(screen.getByRole('checkbox', { name: /Show Player List/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /Show Player Chart/ })).toBeChecked()
    expect(screen.getByLabelText('Player List Format:')).toHaveValue('')
  })

  it('removes a configured status only after an explicit click and retains it on errors', async () => {
    mockApi({ status: { channel: 'c1', message: 'm1' }, failWrite: true })
    const { container } = renderPage()
    await ready(container)
    await fireEvent.click(screen.getByRole('button', { name: 'Remove Status' }))
    await vi.waitFor(() => expect(screen.getByText('Unable to remove the status message.')).toBeInTheDocument())
    expect(screen.getByText('#general >', { exact: false })).toBeInTheDocument()
    mockApi()
    await fireEvent.click(screen.getByRole('button', { name: 'Remove Status' }))
    await vi.waitFor(() => expect(screen.getByText('No status message')).toBeInTheDocument())
  })

  it('keeps a failed send dialog open with an actionable error', async () => {
    mockApi({ failWrite: true })
    const { container } = renderPage()
    await ready(container)
    await fireEvent.click(screen.getByRole('button', { name: 'Send Status' }))
    const modal = container.querySelector('#select_channel_modal')! as HTMLElement
    await chooseChannel(modal)
    await fireEvent.click(within(modal).getByRole('button', { name: 'Send to Discord', hidden: true }))
    await vi.waitFor(() => expect(within(modal).getByText('Unable to send the status message.')).toBeInTheDocument())
    expect(screen.getByText('No status message')).toBeInTheDocument()
  })
})
