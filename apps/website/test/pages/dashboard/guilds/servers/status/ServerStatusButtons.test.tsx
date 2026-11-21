import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@solidjs/testing-library'
import { configuration, installNetwork, PREVIEW, puts, renderStatus, viewport } from './statusTestHelpers.js'

vi.mock('../../../../../../src/utils/api.js', () => ({
  fetchAPI: vi.fn(),
  getAPIUrl: () => '',
  getUrlWithActualParams: (path: string) => path,
}))
const { fetchAPI } = await import('../../../../../../src/utils/api.js')
const api = fetchAPI as Mock
const ready = () => vi.waitFor(() => expect(screen.getByRole('button', { name: 'Add Button' })).toBeEnabled())
const editModal = () => document.getElementById('edit_status_button')!
const mainSave = () => screen.getByRole('button', { name: 'Save status configuration' })
const mainCancel = () => mainSave().parentElement!.querySelector('button')!
const previews = () => api.mock.calls.filter(([path]) => path === PREVIEW)
async function addButton() {
  await fireEvent.click(screen.getByRole('button', { name: 'Add Button' }))
  const modal = editModal()
  await fireEvent.input(within(modal).getByLabelText('Name'), { target: { value: 'Community' } })
  await fireEvent.input(within(modal).getByLabelText('URL'), { target: { value: 'https://community.example.test' } })
  await fireEvent.click(within(modal).getByRole('checkbox', { name: 'Active' }))
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

describe('status buttons share the status draft', () => {
  it('adds a complete button only to the draft, cancels the aggregate and never creates a server row', async () => {
    const network = installNetwork(api)
    const { container } = renderStatus()
    await ready()
    const modal = await addButton()
    expect(within(modal).getByRole('button', { name: 'Apply to draft' })).toBeEnabled()
    await fireEvent.click(within(modal).getByRole('button', { name: 'Apply to draft' }))
    expect(container.querySelector('tbody')).toHaveTextContent('Community')
    expect(puts(network)).toHaveLength(0)
    expect(api.mock.calls.filter(([path]) => path.endsWith('/status/buttons'))).toHaveLength(0)
    await fireEvent.click(mainCancel())
    expect(container.querySelector('tbody')).not.toHaveTextContent('Community')
    expect(mainSave()).toBeDisabled()
  })
  it('previews a modal draft and restores the saved preview on Cancel', async () => {
    const network = installNetwork(api)
    const { container } = renderStatus()
    await ready()
    await fireEvent.click(container.querySelector('tbody [aria-label="Edit"]')!)
    const modal = editModal()
    await fireEvent.input(within(modal).getByLabelText('Name'), { target: { value: 'Live draft' } })
    await vi.waitFor(() => expect(previews().at(-1)?.[2].buttons[0].name).toBe('Live draft'))
    expect(container.querySelector('tbody')).toHaveTextContent('Website')
    await fireEvent.click(within(modal).getByRole('button', { name: 'Cancel' }))
    await vi.waitFor(() => expect(previews().at(-1)?.[2].buttons[0].name).toBe('Website'))
    expect(puts(network)).toHaveLength(0)
    expect(mainSave()).toBeDisabled()
  })
  it.each(['close', 'cancel'])('discards button edits on a native dialog %s event', async (eventName) => {
    installNetwork(api)
    const { container } = renderStatus()
    await ready()
    await fireEvent.click(container.querySelector('tbody [aria-label="Edit"]')!)
    const modal = editModal()
    await fireEvent.input(within(modal).getByLabelText('Name'), { target: { value: 'Temporary' } })
    await vi.waitFor(() => expect(previews().at(-1)?.[2].buttons[0].name).toBe('Temporary'))
    modal.dispatchEvent(new Event(eventName))
    await vi.waitFor(() => expect(previews().at(-1)?.[2].buttons[0].name).toBe('Website'))
    expect(mainSave()).toBeDisabled()
  })
  it('validates names and URL schemes before applying a modal draft', async () => {
    const network = installNetwork(api)
    renderStatus()
    await ready()
    await fireEvent.click(screen.getByRole('button', { name: 'Add Button' }))
    const modal = editModal()
    const apply = within(modal).getByRole('button', { name: 'Apply to draft' })
    expect(apply).toBeDisabled()
    await fireEvent.input(within(modal).getByLabelText('Name'), { target: { value: 'Unsafe' } })
    await fireEvent.input(within(modal).getByLabelText('URL'), { target: { value: 'javascript:alert(1)' } })
    expect(apply).toBeDisabled()
    expect(within(modal).getByText('Enter a valid HTTP or HTTPS URL.')).toBeInTheDocument()
    await fireEvent.click(apply)
    expect(puts(network)).toHaveLength(0)
  })
  it('saves a new button with the rest of the status in one PUT without client-selected IDs', async () => {
    const network = installNetwork(api)
    renderStatus()
    await ready()
    const modal = await addButton()
    await fireEvent.click(within(modal).getByRole('button', { name: 'Apply to draft' }))
    await fireEvent.click(mainSave())
    await vi.waitFor(() => expect(puts(network)).toHaveLength(1))
    const body = JSON.parse(String(puts(network)[0][1].body))
    expect(body.configuration.buttons[1]).toEqual({
      name: 'Community',
      emoji: '',
      url: 'https://community.example.test',
      enable: true,
    })
  })
  it('enforces the free button limit before opening creation', async () => {
    localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: false }))
    installNetwork(api, {
      configuration: configuration({
        buttons: [1, 2, 3].map((id) => ({
          id,
          name: `Link ${id}`,
          emoji: '',
          url: 'https://example.com',
          enable: false,
        })),
      }),
    })
    renderStatus()
    await vi.waitFor(() => expect(screen.getByText('Link 3')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Add Button' })).not.toBeInTheDocument()
    expect(screen.getByText('Limited to 3 buttons for free users.')).toBeInTheDocument()
  })
  it('renders a legacy unsupported URL as text while the user repairs it', async () => {
    installNetwork(api, {
      configuration: configuration({
        buttons: [{ id: 1, name: 'Old link', emoji: '', url: 'javascript:alert(1)', enable: false }],
      }),
    })
    const { container } = renderStatus()
    await ready()
    expect(container.querySelector('tbody')).toHaveTextContent('javascript:alert(1)')
    expect(container.querySelector('tbody a')).not.toBeInTheDocument()
  })
  it('loads legacy blank button rows so users can repair them before saving', async () => {
    installNetwork(api, {
      configuration: configuration({ buttons: [{ id: 1, name: '', emoji: '', url: '', enable: false }] }),
    })
    const { container } = renderStatus()
    await ready()
    await fireEvent.click(container.querySelector('tbody [aria-label="Edit"]')!)
    const modal = editModal()
    await fireEvent.input(within(modal).getByLabelText('Name'), { target: { value: 'Repaired' } })
    await fireEvent.input(within(modal).getByLabelText('URL'), { target: { value: 'https://example.com' } })
    await fireEvent.click(within(modal).getByRole('button', { name: 'Apply to draft' }))
    expect(mainSave()).toBeEnabled()
  })
})
