import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@solidjs/testing-library'
import {
  configuration,
  installNetwork,
  PREVIEW,
  puts,
  renderStatus,
  statusButton,
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
const ready = () => vi.waitFor(() => expect(screen.getByRole('button', { name: 'Add Button' })).toBeEnabled())
const editModal = () => document.getElementById('edit_status_button')!
const previews = () => api.mock.calls.filter(([path]) => path === PREVIEW)
async function addButton() {
  await fireEvent.click(screen.getByRole('button', { name: 'Add Button' }))
  const modal = editModal()
  await fireEvent.input(within(modal).getByLabelText('Button label'), { target: { value: 'Community' } })
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

describe('status button card editing', () => {
  it('confirms removal, restores a failed deletion and allows retry', async () => {
    const network = installNetwork(api)
    const { container } = renderStatus()
    await ready()
    await fireEvent.click(container.querySelector('tbody [aria-label="Delete"]')!)
    const modal = screen.getByRole('dialog', { name: 'Delete this item?' })
    expect(puts(network)).toHaveLength(0)
    network.mockResolvedValueOnce({ ...errJson(), status: 503 })
    await fireEvent.click(within(modal).getByRole('button', { name: 'Delete' }))
    await vi.waitFor(() => expect(within(modal).getByRole('alert')).toBeInTheDocument())
    expect(container.querySelector('tbody')).toHaveTextContent('Website')
    await fireEvent.click(within(modal).getByRole('button', { name: 'Delete' }))
    await vi.waitFor(() => expect(modal).not.toHaveAttribute('open'))
    expect(container.querySelector('tbody')).not.toHaveTextContent('Website')
    expect(puts(network)).toHaveLength(2)
  })

  it('labels both enabled and disabled saved buttons with visible text', async () => {
    installNetwork(api, {
      configuration: configuration({
        buttons: [statusButton(), statusButton({ id: 2, name: 'Disabled link', enable: false })],
      }),
    })
    renderStatus()
    await ready()
    const table = within(screen.getByRole('table'))
    expect(table.getByText('Enabled')).toBeInTheDocument()
    expect(table.getByText('Disabled')).toBeInTheDocument()
  })

  it('keeps new buttons local until confirmation, then saves them automatically', async () => {
    const network = installNetwork(api)
    const { container } = renderStatus()
    await ready()
    let modal = await addButton()
    expect(within(modal).getByRole('button', { name: 'Create' })).toBeEnabled()
    expect(puts(network)).toHaveLength(0)
    await fireEvent.click(within(modal).getByRole('button', { name: 'Cancel' }))
    expect(container.querySelector('tbody')).not.toHaveTextContent('Community')
    modal = await addButton()
    await fireEvent.click(within(modal).getByRole('button', { name: 'Create' }))
    expect(container.querySelector('tbody')).toHaveTextContent('Community')
    await vi.waitFor(() => expect(puts(network)).toHaveLength(1))
    expect(api.mock.calls.filter(([path]) => path.endsWith('/status/buttons'))).toHaveLength(0)
  })
  it('previews a modal draft and restores the saved preview on Cancel', async () => {
    const network = installNetwork(api)
    const { container } = renderStatus()
    await ready()
    await fireEvent.click(container.querySelector('tbody [aria-label="Edit"]')!)
    const modal = editModal()
    await fireEvent.input(within(modal).getByLabelText('Button label'), { target: { value: 'Live draft' } })
    await vi.waitFor(() => expect(previews().at(-1)?.[2].buttons[0].name).toBe('Live draft'))
    expect(container.querySelector('tbody')).toHaveTextContent('Website')
    await fireEvent.click(within(modal).getByRole('button', { name: 'Cancel' }))
    await vi.waitFor(() => expect(previews().at(-1)?.[2].buttons[0].name).toBe('Website'))
    expect(puts(network)).toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'Save buttons' })).not.toBeInTheDocument()
  })
  it.each(['close', 'cancel'])('discards button edits on a native dialog %s event', async (eventName) => {
    installNetwork(api)
    const { container } = renderStatus()
    await ready()
    await fireEvent.click(container.querySelector('tbody [aria-label="Edit"]')!)
    const modal = editModal()
    await fireEvent.input(within(modal).getByLabelText('Button label'), { target: { value: 'Temporary' } })
    await vi.waitFor(() => expect(previews().at(-1)?.[2].buttons[0].name).toBe('Temporary'))
    modal.dispatchEvent(new Event(eventName))
    await vi.waitFor(() => expect(previews().at(-1)?.[2].buttons[0].name).toBe('Website'))
    expect(screen.queryByRole('button', { name: 'Save buttons' })).not.toBeInTheDocument()
  })
  it('validates names and URL schemes before applying a modal draft', async () => {
    const network = installNetwork(api)
    renderStatus()
    await ready()
    await fireEvent.click(screen.getByRole('button', { name: 'Add Button' }))
    const modal = editModal()
    const apply = within(modal).getByRole('button', { name: 'Create' })
    expect(apply).toBeDisabled()
    await fireEvent.input(within(modal).getByLabelText('Button label'), { target: { value: 'Unsafe' } })
    await fireEvent.input(within(modal).getByLabelText('URL'), { target: { value: 'javascript:alert(1)' } })
    expect(apply).toBeDisabled()
    expect(within(modal).getByText('Enter a valid HTTP or HTTPS URL.')).toBeInTheDocument()
    await fireEvent.click(apply)
    expect(puts(network)).toHaveLength(0)
  })
  it('saves a new button with saved message settings in one PUT without client-selected IDs', async () => {
    const network = installNetwork(api)
    renderStatus()
    await ready()
    const modal = await addButton()
    network.mockImplementationOnce(async (_url, request) => {
      const submitted = JSON.parse(String(request.body))
      submitted.configuration.buttons[1].id = 2
      return okJson({ ...submitted, revision: 'b'.repeat(64), sync: 'applied' })
    })
    await fireEvent.click(within(modal).getByRole('button', { name: 'Create' }))
    await vi.waitFor(() => expect(puts(network)).toHaveLength(1))
    const body = JSON.parse(String(puts(network)[0][1].body))
    expect(body.configuration.buttons[1]).toEqual({
      name: 'Community',
      emoji: '',
      url: 'https://community.example.test',
      enable: true,
    })
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Add Button' })).toBeEnabled())
    await fireEvent.click(screen.getByRole('checkbox', { name: /Show Player List/ }))
    await vi.waitFor(() => expect(puts(network)).toHaveLength(2))
    expect(JSON.parse(String(puts(network)[1][1].body)).configuration.buttons[1].id).toBe(2)
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
    expect(screen.getByRole('button', { name: 'Add Button' })).toBeDisabled()
    expect(screen.getByText('3 / 3 used')).toBeInTheDocument()
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
    await fireEvent.input(within(modal).getByLabelText('Button label'), { target: { value: 'Repaired' } })
    await fireEvent.input(within(modal).getByLabelText('URL'), { target: { value: 'https://example.com' } })
    await fireEvent.click(within(modal).getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(screen.getByText('Repaired')).toBeInTheDocument())
  })
})
