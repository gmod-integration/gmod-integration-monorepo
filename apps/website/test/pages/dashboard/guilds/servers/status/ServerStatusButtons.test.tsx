import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@solidjs/testing-library'
import { historyAt, renderWithProviders } from '../../../../../testUtils.js'
import { okJson, errJson, stubDialogGlobal, clearDialogGlobals } from '../testHelpers.js'

vi.mock('../../../../../../src/utils/api.js', () => ({
  fetchAPI: vi.fn(),
  getAPIUrl: vi.fn(),
  getUrlWithActualParams: vi.fn((s: string) => s),
}))

const { fetchAPI } = await import('../../../../../../src/utils/api.js')
const { default: ServerStatusButtons } = await import(
  '../../../../../../src/pages/dashboard/guilds/servers/status/ServerStatusButtons.js'
)

const BUTTONS_URL = '/users/:discordID/guilds/:guildID/servers/:serverID/status/buttons'

function statusButton(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    emoji: '🎮',
    name: 'Website',
    url: 'https://example.com',
    enable: true,
    ...overrides,
  }
}

function renderPage() {
  return renderWithProviders(() => <ServerStatusButtons />, {
    path: '/dashboard/guilds/:guildID/config/servers/:serverID/status',
    history: historyAt('/dashboard/guilds/g1/config/servers/s1/status'),
  })
}

afterEach(() => {
  cleanup()
  clearDialogGlobals('edit_status_button')
})

describe('pages/dashboard/guilds/servers/status/ServerStatusButtons.tsx', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: true }))
    ;(fetchAPI as Mock).mockReset()
  })

  it('renders the panel title and description', () => {
    ;(fetchAPI as Mock).mockResolvedValue(okJson([]))
    renderPage()
    expect(screen.getByText('Status Buttons')).toBeInTheDocument()
    expect(screen.getByText('Add utility buttons to your server status message.')).toBeInTheDocument()
  })

  it('shows a loading spinner while statusButtons is loading', () => {
    ;(fetchAPI as Mock).mockImplementation(() => new Promise(() => {}))
    const { container } = renderPage()
    expect(container.querySelector('.loading-spinner')).toBeInTheDocument()
  })

  it('shows a failed-to-load message when the fetch rejects', async () => {
    ;(fetchAPI as Mock).mockRejectedValue(new Error('network down'))
    const { container } = renderPage()
    // en.json has an actual translation for this key ("Failed to load"), which wins over the
    // component's inline default ("Failed to load the links").
    await vi.waitFor(() => expect(container.textContent).toContain('Failed to load'))
  })

  it('renders a fetched button row with icon, name, url and active marker', async () => {
    ;(fetchAPI as Mock).mockResolvedValue(okJson([statusButton()]))
    const { container } = renderPage()
    await vi.waitFor(() => expect(screen.getByText('Website')).toBeInTheDocument())
    expect(screen.getByText('🎮')).toBeInTheDocument()
    expect(screen.getByText('example.com')).toBeInTheDocument()
    expect(container.querySelector('.fa-check')).toBeInTheDocument()
  })

  it('shows a disabled marker for an inactive button', async () => {
    ;(fetchAPI as Mock).mockResolvedValue(okJson([statusButton({ enable: false })]))
    const { container } = renderPage()
    await vi.waitFor(() => expect(screen.getByText('Website')).toBeInTheDocument())
    expect(container.querySelector('.fa-times')).toBeInTheDocument()
  })

  describe('edit modal', () => {
    it('prefills the modal with the selected button and saves changes', async () => {
      ;(fetchAPI as Mock).mockResolvedValue(okJson([statusButton()]))
      const { container } = renderPage()
      await vi.waitFor(() => expect(screen.getByText('Website')).toBeInTheDocument())
      stubDialogGlobal(container, 'edit_status_button')
      await fireEvent.click(container.querySelector('.fa-edit') as HTMLElement)

      const modal = container.querySelector('#edit_status_button') as HTMLElement
      expect(modal.hasAttribute('open')).toBe(true)
      expect(within(modal).getByDisplayValue('Website')).toBeInTheDocument()
      expect(within(modal).getByDisplayValue('https://example.com')).toBeInTheDocument()

      const nameInput = within(modal).getByDisplayValue('Website') as HTMLInputElement
      await fireEvent.change(nameInput, { target: { value: 'Renamed' } })
      const urlInput = within(modal).getByDisplayValue('https://example.com') as HTMLInputElement
      await fireEvent.change(urlInput, { target: { value: 'https://new.example.com' } })
      const actionSelect = within(modal).getByRole('combobox') as HTMLSelectElement
      await fireEvent.change(actionSelect, { target: { value: 'false' } })

      const updated = statusButton({ name: 'Renamed', url: 'https://new.example.com', enable: false })
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === `${BUTTONS_URL}/1` && method === 'PUT') return Promise.resolve(okJson(updated))
        return Promise.resolve(okJson([statusButton()]))
      })
      await fireEvent.click(within(modal).getByText('Save'))
      await vi.waitFor(() =>
        expect(fetchAPI).toHaveBeenCalledWith(`${BUTTONS_URL}/1`, 'PUT', {
          id: 1,
          emoji: '🎮',
          name: 'Renamed',
          url: 'https://new.example.com',
          enable: false,
        }),
      )
      await vi.waitFor(() => expect(screen.getByText('Renamed')).toBeInTheDocument())
    })

    it('does not update the row when saving the edit fails', async () => {
      ;(fetchAPI as Mock).mockResolvedValue(okJson([statusButton()]))
      const { container } = renderPage()
      await vi.waitFor(() => expect(screen.getByText('Website')).toBeInTheDocument())
      stubDialogGlobal(container, 'edit_status_button')
      await fireEvent.click(container.querySelector('.fa-edit') as HTMLElement)
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === `${BUTTONS_URL}/1` && method === 'PUT') return Promise.resolve(errJson())
        return Promise.resolve(okJson([statusButton()]))
      })
      const modal = container.querySelector('#edit_status_button') as HTMLElement
      await fireEvent.click(within(modal).getByText('Save'))
      await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(`${BUTTONS_URL}/1`, 'PUT', expect.anything()))
      expect(screen.getByText('Website')).toBeInTheDocument()
    })

    it('toggles the emoji picker open and closed via the emoji select button', async () => {
      ;(fetchAPI as Mock).mockResolvedValue(okJson([statusButton()]))
      const { container } = renderPage()
      await vi.waitFor(() => expect(screen.getByText('Website')).toBeInTheDocument())
      stubDialogGlobal(container, 'edit_status_button')
      await fireEvent.click(container.querySelector('.fa-edit') as HTMLElement)

      const modal = container.querySelector('#edit_status_button') as HTMLElement
      const emojiToggle = within(modal).getByText('🎮')
      expect(modal.querySelector('emoji-picker')).not.toBeInTheDocument()
      await fireEvent.click(emojiToggle)
      expect(modal.querySelector('emoji-picker')).toBeInTheDocument()
      await fireEvent.click(emojiToggle)
      expect(modal.querySelector('emoji-picker')).not.toBeInTheDocument()
    })

    it('updates the emoji and closes the picker when an emoji-click event is received', async () => {
      ;(fetchAPI as Mock).mockResolvedValue(okJson([statusButton()]))
      const { container } = renderPage()
      await vi.waitFor(() => expect(screen.getByText('Website')).toBeInTheDocument())
      stubDialogGlobal(container, 'edit_status_button')
      await fireEvent.click(container.querySelector('.fa-edit') as HTMLElement)

      const modal = container.querySelector('#edit_status_button') as HTMLElement
      await fireEvent.click(within(modal).getByText('🎮'))
      const picker = modal.querySelector('emoji-picker') as HTMLElement
      const event = new CustomEvent('emoji-click', { detail: { unicode: '😀' } })
      picker.dispatchEvent(event)

      await vi.waitFor(() => expect(within(modal).getByText('😀')).toBeInTheDocument())
      expect(modal.querySelector('emoji-picker')).not.toBeInTheDocument()
    })
  })

  describe('deleting a button', () => {
    it('removes the row on success', async () => {
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === BUTTONS_URL && method === 'GET') return Promise.resolve(okJson([statusButton()]))
        if (endpoint === `${BUTTONS_URL}/1` && method === 'DELETE') return Promise.resolve(okJson({}))
        return Promise.resolve(okJson([]))
      })
      const { container } = renderPage()
      await vi.waitFor(() => expect(screen.getByText('Website')).toBeInTheDocument())
      await fireEvent.click(container.querySelector('.fa-trash') as HTMLElement)
      await vi.waitFor(() => expect(screen.queryByText('Website')).not.toBeInTheDocument())
    })

    it('leaves the row when deletion fails', async () => {
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === BUTTONS_URL && method === 'GET') return Promise.resolve(okJson([statusButton()]))
        if (endpoint === `${BUTTONS_URL}/1` && method === 'DELETE') return Promise.resolve(errJson())
        return Promise.resolve(okJson([]))
      })
      const { container } = renderPage()
      await vi.waitFor(() => expect(screen.getByText('Website')).toBeInTheDocument())
      await fireEvent.click(container.querySelector('.fa-trash') as HTMLElement)
      await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(`${BUTTONS_URL}/1`, 'DELETE'))
      expect(screen.getByText('Website')).toBeInTheDocument()
    })
  })

  describe('adding a button', () => {
    it('appends the created button to an existing list on success', async () => {
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === BUTTONS_URL && method === 'GET') return Promise.resolve(okJson([statusButton()]))
        if (endpoint === BUTTONS_URL && method === 'POST')
          return Promise.resolve(okJson(statusButton({ id: 2, name: 'Second' })))
        return Promise.resolve(okJson([]))
      })
      renderPage()
      await vi.waitFor(() => expect(screen.getByText('Website')).toBeInTheDocument())
      await fireEvent.click(screen.getByText('Add Button'))
      await vi.waitFor(() => expect(screen.getByText('Second')).toBeInTheDocument())
    })

    it('starts a fresh list with just the created button when the previous value was not an array (failed initial GET)', async () => {
      // Regression test for a bug: fetchStatusButtons() falls back to `{}` (not an array) when the
      // initial GET fails, and the old `prevButtons ? [...prevButtons, x] : []` mutate callback
      // would throw trying to spread that `{}` (an unhandled rejection, since the onClick handler
      // never awaits/catches createStatusButton()'s promise) - and even its own fallback branch
      // discarded the newly created button. Now fixed to check Array.isArray and keep the button.
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === BUTTONS_URL && method === 'GET') return Promise.resolve(errJson())
        if (endpoint === BUTTONS_URL && method === 'POST') return Promise.resolve(okJson(statusButton({ id: 3, name: 'First' })))
        return Promise.resolve(okJson([]))
      })
      renderPage()
      await vi.waitFor(() => expect(screen.getByText('Add Button')).not.toBeDisabled())
      await fireEvent.click(screen.getByText('Add Button'))
      await vi.waitFor(() => expect(screen.getByText('First')).toBeInTheDocument())
    })

    it('does not add a row when creation fails', async () => {
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === BUTTONS_URL && method === 'GET') return Promise.resolve(okJson([statusButton()]))
        if (endpoint === BUTTONS_URL && method === 'POST') return Promise.resolve(errJson())
        return Promise.resolve(okJson([]))
      })
      renderPage()
      await vi.waitFor(() => expect(screen.getByText('Website')).toBeInTheDocument())
      await fireEvent.click(screen.getByText('Add Button'))
      await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(BUTTONS_URL, 'POST'))
      expect(screen.getAllByRole('row')).toHaveLength(2) // header + the one unchanged row
    })
  })

  describe('premium gating for the Add Button control', () => {
    it('shows Add Button directly when premium, regardless of count', async () => {
      window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: true }))
      ;(fetchAPI as Mock).mockResolvedValue(
        okJson([statusButton({ id: 1 }), statusButton({ id: 2 }), statusButton({ id: 3 })]),
      )
      renderPage()
      await vi.waitFor(() => expect(screen.getByText('Add Button')).toBeInTheDocument())
    })

    it('shows the premium upsell instead of Add Button when free and at the 3-button limit', async () => {
      window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: false }))
      ;(fetchAPI as Mock).mockResolvedValue(
        okJson([statusButton({ id: 1 }), statusButton({ id: 2 }), statusButton({ id: 3 })]),
      )
      renderPage()
      await vi.waitFor(() =>
        expect(screen.getByText('Limited to 3 buttons for free users.')).toBeInTheDocument(),
      )
      expect(screen.queryByText('Add Button')).not.toBeInTheDocument()
    })

    it('shows Add Button when free but under the 3-button limit', async () => {
      window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: false }))
      ;(fetchAPI as Mock).mockResolvedValue(okJson([statusButton({ id: 1 })]))
      renderPage()
      await vi.waitFor(() => expect(screen.getByText('Add Button')).toBeInTheDocument())
    })

    it('hides the Add Button control entirely while statusButtons is loading', () => {
      ;(fetchAPI as Mock).mockImplementation(() => new Promise(() => {}))
      renderPage()
      expect(screen.queryByText('Add Button')).not.toBeInTheDocument()
      expect(screen.queryByText('Limited to 3 buttons for free users.')).not.toBeInTheDocument()
    })
  })
})
