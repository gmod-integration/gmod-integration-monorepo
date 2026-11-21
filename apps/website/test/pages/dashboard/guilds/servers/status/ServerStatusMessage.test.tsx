import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@solidjs/testing-library'
import {
  commands,
  configuration,
  installNetwork,
  PREVIEW,
  puts,
  renderStatus,
  STATUS,
  viewport,
} from './statusTestHelpers.js'
import { okJson, errJson } from '../testHelpers.js'

vi.mock('../../../../../../src/utils/api.js', () => ({
  fetchAPI: vi.fn(),
  getAPIUrl: () => '',
  getUrlWithActualParams: (path: string) => path,
}))
const { fetchAPI } = await import('../../../../../../src/utils/api.js')
const api = fetchAPI as Mock
const ready = () => vi.waitFor(() => expect(screen.getByRole('checkbox', { name: /Show Player List/ })).toBeEnabled())
const sendModal = () => document.getElementById('select_channel_modal')!
async function openSend() {
  await fireEvent.click(screen.getByRole('button', { name: 'Send Status' }))
  const modal = sendModal()
  await vi.waitFor(() => expect(modal.querySelector('select')).not.toBeNull())
  await fireEvent.change(modal.querySelector('select')!, { target: { value: 'c1' } })
  return modal
}
beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: true }))
  api.mockReset()
  viewport(true)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('status publication is a separate command', () => {
  it('requires explicit Send after choosing a channel and never writes configuration implicitly', async () => {
    const network = installNetwork(api)
    renderStatus()
    await ready()
    const modal = await openSend()
    const send = within(modal).getByRole('button', { name: 'Send to Discord' })
    expect(commands(api)).toHaveLength(0)
    await vi.waitFor(() => expect(send).toBeEnabled())
    await fireEvent.click(send)
    await vi.waitFor(() => expect(api).toHaveBeenCalledWith(STATUS, 'POST', { channelID: 'c1' }))
    expect(puts(network)).toHaveLength(0)
  })
  it('blocks publication while message or buttons have unsaved changes', async () => {
    const network = installNetwork(api)
    renderStatus()
    await ready()
    await fireEvent.click(screen.getByRole('checkbox', { name: /Show Player List/ }))
    expect(screen.getByRole('button', { name: 'Send Status' })).toBeDisabled()
    expect(screen.getByText('Save or cancel your changes before publishing a message.')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Send Status' }))
    expect(commands(api)).toHaveLength(0)
    expect(puts(network)).toHaveLength(0)
  })
  it('waits for a successful preview and prevents sending when preview fails', async () => {
    installNetwork(api, { failPreview: true })
    renderStatus()
    await ready()
    const modal = await openSend()
    await vi.waitFor(() => expect(within(modal).getByRole('alert')).toBeInTheDocument())
    expect(within(modal).getByRole('button', { name: 'Send to Discord' })).toBeDisabled()
    expect(commands(api)).toHaveLength(0)
  })
  it('keeps a failed send open for retry and blocks Cancel and native Escape while busy', async () => {
    installNetwork(api)
    renderStatus()
    await ready()
    const modal = await openSend()
    const send = within(modal).getByRole('button', { name: 'Send to Discord' })
    await vi.waitFor(() => expect(send).toBeEnabled())
    const original = api.getMockImplementation()!
    let resolve!: (value: any) => void
    api.mockImplementation((path, method, body) =>
      path === STATUS && method === 'POST'
        ? new Promise((done) => {
            resolve = done
          })
        : original(path, method, body),
    )
    await fireEvent.click(send)
    await fireEvent.click(send)
    expect(commands(api)).toHaveLength(1)
    expect(within(modal).getByRole('button', { name: 'Cancel' })).toBeDisabled()
    const cancel = new Event('cancel', { cancelable: true })
    modal.dispatchEvent(cancel)
    expect(cancel.defaultPrevented).toBe(true)
    resolve(errJson())
    await vi.waitFor(() =>
      expect(within(modal).getByRole('alert')).toHaveTextContent('Unable to send the status message.'),
    )
    expect(modal).toHaveAttribute('open')
    api.mockImplementation((path, method, body) =>
      path === STATUS && method === 'POST'
        ? Promise.resolve(okJson({ channel: 'c1', message: 'm1' }))
        : original(path, method, body),
    )
    await fireEvent.click(send)
    await vi.waitFor(() => expect(modal).not.toHaveAttribute('open'))
  })
  it('requires a confirmation to remove the published message and preserves it on failure', async () => {
    installNetwork(api, { status: { channel: 'c1', message: 'm1' } })
    renderStatus()
    await ready()
    await fireEvent.click(screen.getByRole('button', { name: 'Remove Status' }))
    const modal = screen.getByRole('dialog', { name: 'Remove Status' })
    expect(commands(api)).toHaveLength(0)
    const original = api.getMockImplementation()!
    api.mockImplementation((path, method, body) =>
      path === STATUS && method === 'DELETE' ? Promise.resolve(errJson()) : original(path, method, body),
    )
    await fireEvent.click(within(modal).getByRole('button', { name: 'Remove Status' }))
    await vi.waitFor(() => expect(within(modal).getByRole('alert')).toBeInTheDocument())
    expect(modal).toHaveAttribute('open')
    api.mockImplementation((path, method, body) =>
      path === STATUS && method === 'DELETE' ? Promise.resolve(okJson({})) : original(path, method, body),
    )
    await fireEvent.click(within(modal).getByRole('button', { name: 'Remove Status' }))
    await vi.waitFor(() => expect(screen.getByText('No status message')).toBeInTheDocument())
  })
  it('allows configuration editing when the published-message lookup fails', async () => {
    installNetwork(api)
    const original = api.getMockImplementation()!
    api.mockImplementation((path, method, body) =>
      path === STATUS && method === 'GET' ? Promise.resolve(errJson()) : original(path, method, body),
    )
    renderStatus()
    await ready()
    expect(screen.getByRole('button', { name: 'Send Status' })).toBeDisabled()
    await fireEvent.click(screen.getByRole('checkbox', { name: /Show Player List/ }))
    expect(screen.getByRole('button', { name: 'Save status configuration' })).toBeEnabled()
  })
  it('updates the preview for inline format edits without a format-specific Save', async () => {
    installNetwork(api, {
      configuration: configuration({
        settings: { show_player_list_status: true, status_player_list_format: '{name}', show_status_chart: false },
      }),
    })
    renderStatus()
    await ready()
    await fireEvent.input(screen.getByLabelText('Player List Format'), { target: { value: '**{name}** - {team}' } })
    await vi.waitFor(() =>
      expect(api.mock.calls.filter(([path]) => path === PREVIEW).at(-1)?.[2].settings.status_player_list_format).toBe(
        '**{name}** - {team}',
      ),
    )
    expect(document.getElementById('edit_format')).not.toBeInTheDocument()
    expect(commands(api)).toHaveLength(0)
  })
})
