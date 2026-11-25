import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@solidjs/testing-library'
import { configuration, installNetwork, puts, renderStatus, viewport } from './statusTestHelpers.js'
import { okJson, errJson } from '../testHelpers.js'

vi.mock('../../../../../../src/utils/api.js', () => ({
  fetchAPI: vi.fn(),
  getAPIUrl: () => '',
  getUrlWithActualParams: (path: string) => path,
}))
const { fetchAPI } = await import('../../../../../../src/utils/api.js')
const api = fetchAPI as Mock
const players = () => screen.getByRole('checkbox', { name: /Show Player List/ })
const ready = () => vi.waitFor(() => expect(players()).toBeEnabled())
const panelFor = (tab: HTMLElement) => document.getElementById(tab.getAttribute('aria-controls')!)!
const messageCard = () => screen.getByRole('region', { name: 'Message content' })
async function editButton(name: string) {
  await fireEvent.click(document.querySelector('tbody [aria-label="Edit"]')!)
  const modal = within(document.getElementById('edit_status_button')!)
  await fireEvent.input(modal.getByLabelText('Button label'), { target: { value: name } })
  await fireEvent.click(modal.getByRole('button', { name: 'Save' }))
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

describe('automatic status settings', () => {
  it('keeps configuration cards free of Save/Cancel controls and publication explicit', async () => {
    const network = installNetwork(api)
    const { container } = renderStatus()
    await ready()
    for (const name of ['Message content', 'Status Buttons']) {
      const card = screen.getByRole('region', { name })
      expect(within(card).queryByRole('button', { name: /^Save/ })).not.toBeInTheDocument()
      expect(within(card).queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
    }
    const publication = screen.getByRole('region', { name: 'Publish to Discord' })
    expect(within(publication).getByRole('button', { name: 'Publish status message' })).toBeInTheDocument()
    expect(container.querySelector('[data-status-configuration]')).not.toHaveAttribute('hidden')
    expect(container.querySelector('.status-preview-panel')).not.toHaveAttribute('hidden')
    expect(puts(network)).toHaveLength(0)
  })
  it('coalesces rapid message edits and saves one atomic configuration automatically', async () => {
    const network = installNetwork(api)
    renderStatus()
    await ready()
    await fireEvent.click(players())
    await fireEvent.input(screen.getByLabelText('Player List Format'), { target: { value: '**{name}**' } })
    expect(puts(network)).toHaveLength(0)
    await vi.waitFor(() => expect(puts(network)).toHaveLength(1))
    expect(JSON.parse(String(puts(network)[0][1].body))).toEqual({
      configuration: {
        settings: { show_player_list_status: true, status_player_list_format: '**{name}**', show_status_chart: false },
        buttons: configuration().buttons,
      },
      revision: 'a'.repeat(64),
    })
  })
  it('serializes card changes and carries the latest revision and saved sibling into the next write', async () => {
    const network = installNetwork(api)
    renderStatus()
    await ready()
    await fireEvent.click(players())
    await editButton('Community')
    await vi.waitFor(() => expect(puts(network)).toHaveLength(2), { timeout: 2000 })
    const requests = puts(network).map(([, request]) => JSON.parse(String(request.body)))
    expect(requests[0].revision).toBe('a'.repeat(64))
    expect(requests[1].revision).toBe('b'.repeat(64))
    expect(requests[1].configuration.settings.show_player_list_status).toBe(true)
    expect(requests[1].configuration.buttons[0].name).toBe('Community')
  })
  it('saves buttons using the saved message when a new message format is invalid', async () => {
    const network = installNetwork(api, {
      configuration: configuration({
        settings: { show_player_list_status: true, status_player_list_format: '{name}', show_status_chart: false },
      }),
    })
    renderStatus()
    await ready()
    const format = screen.getByLabelText('Player List Format')
    await fireEvent.input(format, { target: { value: 'x'.repeat(256) } })
    await editButton('Community')
    await vi.waitFor(() => expect(puts(network)).toHaveLength(1))
    expect(JSON.parse(String(puts(network)[0][1].body)).configuration.settings.status_player_list_format).toBe('{name}')
    expect(format).toHaveValue('x'.repeat(256))
    expect(within(messageCard()).getByRole('alert')).toBeInTheDocument()
  })
  it('repairs legacy invalid buttons before persisting a queued message change', async () => {
    const network = installNetwork(api, {
      configuration: configuration({ buttons: [{ id: 1, name: '', emoji: '', url: '', enable: false }] }),
    })
    renderStatus()
    await ready()
    await fireEvent.click(players())
    expect(within(messageCard()).getByRole('alert')).toHaveTextContent('Repair and save the existing link buttons')
    await fireEvent.click(document.querySelector('tbody [aria-label="Edit"]')!)
    const modal = within(document.getElementById('edit_status_button')!)
    await fireEvent.input(modal.getByLabelText('Button label'), { target: { value: 'Repaired' } })
    await fireEvent.input(modal.getByLabelText('URL'), { target: { value: 'https://example.com' } })
    await fireEvent.click(modal.getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(puts(network)).toHaveLength(2), { timeout: 2000 })
    expect(JSON.parse(String(puts(network)[0][1].body)).configuration.settings.show_player_list_status).toBe(false)
    expect(JSON.parse(String(puts(network)[1][1].body)).configuration.settings.show_player_list_status).toBe(true)
  })
  it('preserves a failed draft, stops automatic retries and supports an explicit retry', async () => {
    const network = installNetwork(api)
    renderStatus()
    await ready()
    network.mockResolvedValueOnce({ ...errJson(), status: 503 })
    await fireEvent.click(players())
    await vi.waitFor(() => expect(within(messageCard()).getByRole('alert')).toBeInTheDocument())
    expect(players()).toBeChecked()
    expect(puts(network)).toHaveLength(1)
    const retry = within(messageCard()).getByRole('button', { name: 'Try again' })
    await fireEvent.click(retry)
    await vi.waitFor(() => expect(puts(network)).toHaveLength(2))
    await vi.waitFor(() => expect(within(messageCard()).queryByRole('alert')).not.toBeInTheDocument())
  })
  it('keeps message fields editable during a request and saves the later draft after it completes', async () => {
    const network = installNetwork(api)
    renderStatus()
    await ready()
    let resolve!: (value: unknown) => void
    network.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    await fireEvent.click(players())
    await vi.waitFor(() => expect(puts(network)).toHaveLength(1))
    const format = screen.getByLabelText('Player List Format')
    expect(format).toBeEnabled()
    await fireEvent.input(format, { target: { value: '**{name}**' } })
    expect(puts(network)).toHaveLength(1)
    resolve(
      okJson({
        configuration: configuration({
          settings: { show_player_list_status: true, status_player_list_format: '{name}', show_status_chart: false },
        }),
        revision: 'b'.repeat(64),
        sync: 'applied',
      }),
    )
    await vi.waitFor(() => expect(puts(network)).toHaveLength(2), { timeout: 2000 })
    expect(JSON.parse(String(puts(network)[1][1].body)).configuration.settings.status_player_list_format).toBe(
      '**{name}**',
    )
    expect(format).toHaveValue('**{name}**')
  })
  it('reports persisted settings with pending Discord delivery as saved', async () => {
    const network = installNetwork(api)
    renderStatus()
    await ready()
    network.mockResolvedValueOnce(
      okJson({
        configuration: configuration({
          settings: { show_player_list_status: true, status_player_list_format: '{name}', show_status_chart: false },
        }),
        revision: 'b'.repeat(64),
        sync: 'pending',
      }),
    )
    await fireEvent.click(players())
    await vi.waitFor(() => expect(screen.getByText(/Discord update has not been confirmed/)).toBeInTheDocument())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
  it('preserves conflicting edits and requires reloading the current server values', async () => {
    const network = installNetwork(api)
    renderStatus()
    await ready()
    network.mockResolvedValueOnce({ ...errJson(), status: 409 })
    await fireEvent.click(players())
    await vi.waitFor(() => expect(within(messageCard()).getByRole('alert')).toHaveTextContent(/saved values changed/))
    expect(players()).toBeChecked()
    await fireEvent.click(screen.getByRole('button', { name: 'Discard changes and reload saved values' }))
    await vi.waitFor(() => expect(players()).not.toBeChecked())
    expect(puts(network)).toHaveLength(1)
  })
  it('disables edits for failed initial loads and supports retry', async () => {
    const network = installNetwork(api, { failGet: true })
    renderStatus()
    await vi.waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0))
    expect(players()).toBeDisabled()
    network.mockResolvedValueOnce(okJson({ configuration: configuration(), revision: 'a'.repeat(64) }))
    await fireEvent.click(screen.getAllByRole('button', { name: 'Try again' })[0])
    await ready()
  })
  it('protects pending changes until automatic saving succeeds', async () => {
    const network = installNetwork(api)
    renderStatus(true)
    await ready()
    await fireEvent.click(players())
    const unsaved = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unsaved)
    expect(unsaved.defaultPrevented).toBe(true)
    await vi.waitFor(() => expect(puts(network)).toHaveLength(1))
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Publish status message' })).toBeEnabled())
    const saved = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(saved)
    expect(saved.defaultPrevented).toBe(false)
  })
  it('switches mobile tabs without losing edits and supports keyboard navigation', async () => {
    viewport(false)
    installNetwork(api)
    renderStatus()
    await ready()
    const config = screen.getByRole('tab', { name: 'Configuration' })
    const preview = screen.getByRole('tab', { name: 'Live Discord preview' })
    await fireEvent.click(players())
    await fireEvent.click(preview)
    expect(panelFor(config)).toHaveAttribute('hidden')
    await fireEvent.keyDown(preview, { key: 'Home' })
    expect(config).toHaveFocus()
    expect(players()).toBeChecked()
    await fireEvent.keyDown(config, { key: 'ArrowRight' })
    expect(preview).toHaveFocus()
  })
  it('keeps a ready preview mounted when the viewport widens', async () => {
    const resize = viewport(false)
    installNetwork(api)
    renderStatus()
    const config = screen.getByRole('tab', { name: 'Configuration' })
    const preview = screen.getByRole('tab', { name: 'Live Discord preview' })
    await fireEvent.click(preview)
    expect(panelFor(config)).toHaveAttribute('hidden')
    resize(true)
    expect(panelFor(config)).not.toHaveAttribute('hidden')
    expect(panelFor(preview)).not.toHaveAttribute('hidden')
    resize(false)
    expect(panelFor(config)).toHaveAttribute('hidden')
  })
})
