import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { cleanup, fireEvent, screen } from '@solidjs/testing-library'
import { configuration, installNetwork, puts, renderStatus, viewport } from './statusTestHelpers.js'
import { okJson, errJson } from '../testHelpers.js'

vi.mock('../../../../../../src/utils/api.js', () => ({
  fetchAPI: vi.fn(),
  getAPIUrl: () => '',
  getUrlWithActualParams: (path: string) => path,
}))
const { fetchAPI } = await import('../../../../../../src/utils/api.js')
const api = fetchAPI as Mock
const mainSave = () => screen.getByRole('button', { name: 'Save status configuration' })
const mainCancel = () => mainSave().parentElement!.querySelector('button')!
const players = () => screen.getByRole('checkbox', { name: /Show Player List/ })
const ready = () => vi.waitFor(() => expect(players()).toBeEnabled())
const panelFor = (tab: HTMLElement) => document.getElementById(tab.getAttribute('aria-controls')!)!

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

describe('aggregate status editing', () => {
  it('keeps both desktop panels and a single Save/Cancel for the configuration', async () => {
    installNetwork(api)
    const { container } = renderStatus()
    await ready()
    expect(screen.getByText('Status Buttons')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Save status configuration' })).toHaveLength(1)
    expect(mainSave()).toBeDisabled()
    expect(container.querySelector('[data-status-configuration]')).not.toHaveAttribute('hidden')
    expect(container.querySelector('.status-preview-panel')).not.toHaveAttribute('hidden')
  })
  it('saves message settings, inline format and buttons in one request then marks the accepted draft clean', async () => {
    const network = installNetwork(api)
    const { container } = renderStatus()
    await ready()
    await fireEvent.click(players())
    await fireEvent.input(screen.getByLabelText('Player List Format'), { target: { value: '**{name}**' } })
    await fireEvent.click(container.querySelector('tbody [aria-label="Delete"]')!)
    expect(puts(network)).toHaveLength(0)
    await fireEvent.click(mainSave())
    await vi.waitFor(() => expect(mainSave()).toBeDisabled())
    expect(puts(network)).toHaveLength(1)
    expect(JSON.parse(String(puts(network)[0][1].body))).toEqual({
      configuration: {
        settings: { show_player_list_status: true, status_player_list_format: '**{name}**', show_status_chart: false },
        buttons: [],
      },
      revision: 'a'.repeat(64),
    })
  })
  it('restores all settings and removed buttons when Cancel is clicked without any write', async () => {
    const network = installNetwork(api)
    const { container } = renderStatus()
    await ready()
    await fireEvent.click(players())
    await fireEvent.click(container.querySelector('tbody [aria-label="Delete"]')!)
    expect(container.querySelector('tbody')).not.toHaveTextContent('Website')
    await fireEvent.click(mainCancel())
    expect(players()).not.toBeChecked()
    expect(container.querySelector('tbody')).toHaveTextContent('Website')
    expect(mainSave()).toBeDisabled()
    expect(puts(network)).toHaveLength(0)
  })
  it('retains failed changes for retry and deduplicates while Save is busy', async () => {
    const network = installNetwork(api)
    renderStatus()
    await ready()
    await fireEvent.click(players())
    network.mockResolvedValueOnce({ ...errJson(), status: 503 })
    await fireEvent.click(mainSave())
    await vi.waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(players()).toBeChecked()
    expect(mainSave()).toBeEnabled()
    let resolve!: (value: any) => void
    network.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    await fireEvent.click(mainSave())
    await fireEvent.click(mainSave())
    expect(mainSave()).toBeDisabled()
    expect(mainCancel()).toBeDisabled()
    expect(players()).toBeDisabled()
    expect(puts(network)).toHaveLength(2)
    resolve(
      okJson({
        configuration: configuration({
          settings: { show_player_list_status: true, status_player_list_format: '{name}', show_status_chart: false },
        }),
        revision: 'b'.repeat(64),
        sync: 'applied',
      }),
    )
    await vi.waitFor(() => expect(mainCancel()).toBeEnabled())
    expect(mainSave()).toBeDisabled()
  })
  it('reports a persisted update with pending Discord delivery as saved', async () => {
    const network = installNetwork(api)
    renderStatus()
    await ready()
    await fireEvent.click(players())
    network.mockResolvedValueOnce(
      okJson({
        configuration: configuration({
          settings: { show_player_list_status: true, status_player_list_format: '{name}', show_status_chart: false },
        }),
        revision: 'b'.repeat(64),
        sync: 'pending',
      }),
    )
    await fireEvent.click(mainSave())
    await vi.waitFor(() => expect(screen.getByText(/Discord update has not been confirmed/)).toBeInTheDocument())
    expect(mainSave()).toBeDisabled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
  it('preserves a conflicting draft and offers an explicit discard and reload action', async () => {
    const network = installNetwork(api)
    renderStatus()
    await ready()
    await fireEvent.click(players())
    network.mockResolvedValueOnce({ ...errJson(), status: 409 })
    await fireEvent.click(mainSave())
    await vi.waitFor(() => expect(screen.getByText(/saved values changed/)).toBeInTheDocument())
    expect(players()).toBeChecked()
    await fireEvent.click(screen.getByRole('button', { name: 'Discard changes and reload saved values' }))
    await vi.waitFor(() => expect(players()).not.toBeChecked())
    expect(mainSave()).toBeDisabled()
  })
  it('disables edits for failed initial loads and supports retry', async () => {
    const network = installNetwork(api, { failGet: true })
    renderStatus()
    await vi.waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0))
    expect(players()).toBeDisabled()
    expect(mainSave()).toBeDisabled()
    network.mockResolvedValueOnce(okJson({ configuration: configuration(), revision: 'a'.repeat(64) }))
    await fireEvent.click(screen.getAllByRole('button', { name: 'Try again' })[0])
    await ready()
  })
  it('guards leaving with unsaved changes and beforeunload, but Cancel clears the guard', async () => {
    installNetwork(api)
    renderStatus(true)
    await ready()
    await fireEvent.click(players())
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    await fireEvent.click(screen.getByRole('link', { name: 'Other page' }))
    expect(screen.getByRole('dialog', { name: 'Leave without saving?' })).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Stay on this page' }))
    await fireEvent.click(mainCancel())
    const clean = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(clean)
    expect(clean.defaultPrevented).toBe(false)
  })
  it('switches mobile tabs without losing the draft and supports keyboard navigation', async () => {
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
