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
const saveMessage = () => screen.getByRole('button', { name: 'Save message' })
const saveButtons = () => screen.getByRole('button', { name: 'Save buttons' })
const cancelMessage = () => within(saveMessage().closest('.ui-form-actions')!).getByRole('button', { name: 'Cancel' })
const cancelButtons = () => within(saveButtons().closest('.ui-form-actions')!).getByRole('button', { name: 'Cancel' })
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

describe('independent status cards', () => {
  it('keeps each Save/Cancel inside its own card and publication separate', async () => {
    installNetwork(api)
    const { container } = renderStatus()
    await ready()
    expect(saveMessage()).toBeDisabled()
    expect(saveButtons()).toBeDisabled()
    const messageCard = saveMessage().closest<HTMLElement>('.dashboard-panel')!
    const buttonsCard = saveButtons().closest<HTMLElement>('.dashboard-panel')!
    expect(messageCard).not.toBe(buttonsCard)
    expect(within(messageCard).getByRole('checkbox', { name: /Show Player List/ })).toBeInTheDocument()
    expect(within(messageCard).queryByRole('button', { name: 'Save buttons' })).not.toBeInTheDocument()
    expect(within(buttonsCard).getByRole('heading', { name: 'Status Buttons' })).toBeInTheDocument()
    expect(within(buttonsCard).queryByRole('button', { name: 'Save message' })).not.toBeInTheDocument()
    const publication = screen.getByRole('region', { name: 'Publish to Discord' })
    expect(within(publication).getByRole('button', { name: 'Publish status message' })).toBeInTheDocument()
    expect(within(publication).queryByRole('button', { name: /^Save / })).not.toBeInTheDocument()
    expect(container.querySelector('[data-status-configuration]')).not.toHaveAttribute('hidden')
    expect(container.querySelector('.status-preview-panel')).not.toHaveAttribute('hidden')
  })
  it.each(['message', 'buttons'] as const)(
    'saves %s first using the saved sibling, then saves the sibling with the latest revision',
    async (first) => {
      const network = installNetwork(api)
      const { container } = renderStatus()
      await ready()
      await fireEvent.click(players())
      await fireEvent.input(screen.getByLabelText('Player List Format'), { target: { value: '**{name}**' } })
      await fireEvent.click(container.querySelector('tbody [aria-label="Delete"]')!)
      const message = {
        show_player_list_status: true,
        status_player_list_format: '**{name}**',
        show_status_chart: false,
      }
      expect(puts(network)).toHaveLength(0)
      const firstSave = first === 'message' ? saveMessage : saveButtons
      const secondSave = first === 'message' ? saveButtons : saveMessage
      await fireEvent.click(firstSave())
      await vi.waitFor(() => {
        expect(firstSave()).toBeDisabled()
        expect(secondSave()).toBeEnabled()
      })
      expect(puts(network)).toHaveLength(1)
      expect(JSON.parse(String(puts(network)[0][1].body))).toEqual({
        configuration: {
          settings: first === 'message' ? message : configuration().settings,
          buttons: first === 'buttons' ? [] : configuration().buttons,
        },
        revision: 'a'.repeat(64),
      })
      expect(players()).toBeChecked()
      expect(screen.getByLabelText('Player List Format')).toHaveValue('**{name}**')
      expect(container.querySelector('tbody')).not.toHaveTextContent('Website')
      expect(secondSave()).toBeEnabled()
      await fireEvent.click(secondSave())
      await vi.waitFor(() => {
        expect(secondSave()).toBeDisabled()
        expect(cancelMessage()).toBeEnabled()
        expect(cancelButtons()).toBeEnabled()
      })
      expect(puts(network)).toHaveLength(2)
      expect(JSON.parse(String(puts(network)[1][1].body))).toEqual({
        configuration: { settings: message, buttons: [] },
        revision: 'b'.repeat(64),
      })
      expect(saveMessage()).toBeDisabled()
      expect(saveButtons()).toBeDisabled()
    },
  )
  it('cancels each card without discarding the other card draft or writing', async () => {
    const network = installNetwork(api)
    const { container } = renderStatus()
    await ready()
    await fireEvent.click(players())
    await fireEvent.click(container.querySelector('tbody [aria-label="Delete"]')!)
    await fireEvent.click(cancelMessage())
    expect(players()).not.toBeChecked()
    expect(container.querySelector('tbody')).not.toHaveTextContent('Website')
    expect(saveMessage()).toBeDisabled()
    expect(saveButtons()).toBeEnabled()
    await fireEvent.click(players())
    await fireEvent.click(cancelButtons())
    expect(players()).toBeChecked()
    expect(container.querySelector('tbody')).toHaveTextContent('Website')
    expect(saveMessage()).toBeEnabled()
    expect(saveButtons()).toBeDisabled()
    expect(puts(network)).toHaveLength(0)
  })
  it('allows a button save while the unsaved message format is invalid', async () => {
    const network = installNetwork(api, {
      configuration: configuration({
        settings: { show_player_list_status: true, status_player_list_format: '{name}', show_status_chart: false },
      }),
    })
    const { container } = renderStatus()
    await ready()
    const format = screen.getByLabelText('Player List Format')
    await fireEvent.input(format, { target: { value: 'x'.repeat(256) } })
    await fireEvent.click(container.querySelector('tbody [aria-label="Delete"]')!)
    expect(saveMessage()).toBeDisabled()
    expect(saveButtons()).toBeEnabled()
    await fireEvent.click(saveButtons())
    await vi.waitFor(() => expect(saveButtons()).toBeDisabled())
    expect(puts(network)).toHaveLength(1)
    expect(JSON.parse(String(puts(network)[0][1].body)).configuration).toEqual({
      settings: { show_player_list_status: true, status_player_list_format: '{name}', show_status_chart: false },
      buttons: [],
    })
    expect(format).toHaveValue('x'.repeat(256))
    expect(saveMessage()).toBeDisabled()
  })
  it('requires saved legacy buttons to be repaired before the message can be persisted', async () => {
    const network = installNetwork(api, {
      configuration: configuration({ buttons: [{ id: 1, name: '', emoji: '', url: '', enable: false }] }),
    })
    const { container } = renderStatus()
    await ready()
    await fireEvent.click(players())
    expect(saveMessage()).toBeDisabled()
    expect(
      within(saveMessage().closest<HTMLElement>('.dashboard-panel')!).getByText(
        'Repair and save the existing link buttons before saving the message.',
      ),
    ).toBeInTheDocument()
    await fireEvent.click(container.querySelector('tbody [aria-label="Edit"]')!)
    const modal = within(document.getElementById('edit_status_button')!)
    await fireEvent.input(modal.getByLabelText('Button label'), { target: { value: 'Repaired' } })
    await fireEvent.input(modal.getByLabelText('URL'), { target: { value: 'https://example.com' } })
    await fireEvent.click(modal.getByRole('button', { name: 'Apply to draft' }))
    expect(saveMessage()).toBeDisabled()
    expect(saveButtons()).toBeEnabled()
    await fireEvent.click(saveButtons())
    await vi.waitFor(() => expect(saveMessage()).toBeEnabled())
    expect(players()).toBeChecked()
    expect(JSON.parse(String(puts(network)[0][1].body)).configuration.settings.show_player_list_status).toBe(false)
    await fireEvent.click(saveMessage())
    await vi.waitFor(() => {
      expect(saveMessage()).toBeDisabled()
      expect(cancelMessage()).toBeEnabled()
    })
    expect(puts(network)).toHaveLength(2)
    expect(JSON.parse(String(puts(network)[1][1].body))).toEqual({
      configuration: {
        settings: { ...configuration().settings, show_player_list_status: true },
        buttons: [{ id: 1, name: 'Repaired', emoji: '', url: 'https://example.com', enable: false }],
      },
      revision: 'b'.repeat(64),
    })
  })
  it('retains both failed drafts for retry and permits only one configuration write at a time', async () => {
    const network = installNetwork(api)
    const { container } = renderStatus()
    await ready()
    await fireEvent.click(players())
    await fireEvent.click(container.querySelector('tbody [aria-label="Delete"]')!)
    network.mockResolvedValueOnce({ ...errJson(), status: 503 })
    await fireEvent.click(saveMessage())
    await vi.waitFor(() =>
      expect(within(saveMessage().closest<HTMLElement>('.dashboard-panel')!).getByRole('alert')).toBeInTheDocument(),
    )
    expect(players()).toBeChecked()
    expect(container.querySelector('tbody')).not.toHaveTextContent('Website')
    expect(saveMessage()).toBeEnabled()
    expect(saveButtons()).toBeEnabled()
    let resolve!: (value: any) => void
    network.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    await fireEvent.click(saveMessage())
    await fireEvent.click(saveMessage())
    await fireEvent.click(saveButtons())
    expect(saveMessage()).toBeDisabled()
    expect(saveButtons()).toBeDisabled()
    expect(cancelMessage()).toBeDisabled()
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
    await vi.waitFor(() => expect(cancelMessage()).toBeEnabled())
    expect(saveMessage()).toBeDisabled()
    expect(saveButtons()).toBeEnabled()
    expect(container.querySelector('tbody')).not.toHaveTextContent('Website')
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
    await fireEvent.click(saveMessage())
    await vi.waitFor(() => expect(screen.getByText(/Discord update has not been confirmed/)).toBeInTheDocument())
    expect(saveMessage()).toBeDisabled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
  it('preserves a conflicting draft and offers an explicit discard and reload action', async () => {
    const network = installNetwork(api)
    const { container } = renderStatus()
    await ready()
    await fireEvent.click(players())
    await fireEvent.click(container.querySelector('tbody [aria-label="Delete"]')!)
    network.mockResolvedValueOnce({ ...errJson(), status: 409 })
    await fireEvent.click(saveMessage())
    await vi.waitFor(() =>
      expect(within(saveMessage().closest<HTMLElement>('.dashboard-panel')!).getByRole('alert')).toHaveTextContent(
        /saved values changed/,
      ),
    )
    expect(players()).toBeChecked()
    await fireEvent.click(cancelMessage())
    expect(players()).not.toBeChecked()
    expect(saveButtons()).toBeDisabled()
    expect(screen.getAllByRole('button', { name: 'Discard changes and reload saved values' })).toHaveLength(1)
    await fireEvent.click(screen.getByRole('button', { name: 'Discard changes and reload saved values' }))
    await vi.waitFor(() => expect(players()).not.toBeChecked())
    expect(saveMessage()).toBeDisabled()
  })
  it('disables edits for failed initial loads and supports retry', async () => {
    const network = installNetwork(api, { failGet: true })
    renderStatus()
    await vi.waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0))
    expect(players()).toBeDisabled()
    expect(saveMessage()).toBeDisabled()
    network.mockResolvedValueOnce(okJson({ configuration: configuration(), revision: 'a'.repeat(64) }))
    await fireEvent.click(screen.getAllByRole('button', { name: 'Try again' })[0])
    await ready()
  })
  it('keeps navigation protection after cancelling one card until both drafts are clean', async () => {
    installNetwork(api)
    const { container } = renderStatus(true)
    await ready()
    await fireEvent.click(players())
    await fireEvent.click(container.querySelector('tbody [aria-label="Delete"]')!)
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    await fireEvent.click(screen.getByRole('link', { name: 'Other page' }))
    expect(screen.getByRole('dialog', { name: 'Leave without saving?' })).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Stay on this page' }))
    await fireEvent.click(cancelMessage())
    const remaining = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(remaining)
    expect(remaining.defaultPrevented).toBe(true)
    await fireEvent.click(cancelButtons())
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
