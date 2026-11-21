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
const { default: ServerStatusButtons } =
  await import('../../../../../../src/pages/dashboard/guilds/servers/status/ServerStatusButtons.js')
const { StatusPreviewProvider } =
  await import('../../../../../../src/pages/dashboard/guilds/servers/status/StatusPreviewContext.js')

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

function renderPage(withPreview = false) {
  return renderWithProviders(
    () =>
      withPreview ? (
        <StatusPreviewProvider>
          <ServerStatusButtons />
        </StatusPreviewProvider>
      ) : (
        <ServerStatusButtons />
      ),
    {
      path: '/dashboard/guilds/:guildID/config/servers/:serverID/status',
      history: historyAt('/dashboard/guilds/g1/config/servers/s1/status'),
    },
  )
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
    expect(container.querySelector('[data-icon="check"]')).toBeInTheDocument()
  })

  it('shows a disabled marker for an inactive button', async () => {
    ;(fetchAPI as Mock).mockResolvedValue(okJson([statusButton({ enable: false })]))
    const { container } = renderPage()
    await vi.waitFor(() => expect(screen.getByText('Website')).toBeInTheDocument())
    expect(container.querySelector('[data-icon="x"]')).toBeInTheDocument()
  })

  describe('edit modal', () => {
    it('requires a successful current preview before saving a button to Discord', async () => {
      let resolvePreview!: (response: ReturnType<typeof okJson>) => void
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string, body: any) => {
        if (endpoint === BUTTONS_URL && method === 'GET') return Promise.resolve(okJson([statusButton()]))
        if (endpoint.endsWith('/status/preview') && method === 'POST')
          return new Promise((resolve) => {
            resolvePreview = resolve
          })
        if (endpoint === `${BUTTONS_URL}/1` && method === 'PUT') return Promise.resolve(okJson(body))
        return Promise.resolve(okJson({}))
      })
      const { container } = renderPage(true)
      await vi.waitFor(() => expect(container.querySelector('tbody')?.textContent).toContain('Website'))
      stubDialogGlobal(container, 'edit_status_button')
      await fireEvent.click(container.querySelector('[data-icon="pencil"]') as HTMLElement)
      const modal = container.querySelector('#edit_status_button') as HTMLDialogElement
      const save = within(modal).getByRole('button', { name: 'Save' })
      expect(save).toBeDisabled()
      await fireEvent.click(save)
      expect((fetchAPI as Mock).mock.calls.filter(([, method]) => method === 'PUT')).toHaveLength(0)
      await vi.waitFor(() => expect(resolvePreview).toBeTypeOf('function'))
      resolvePreview(errJson())
      await vi.waitFor(() => expect(within(modal).getByRole('alert')).toBeInTheDocument())
      expect(save).toBeDisabled()
      await fireEvent.click(save)
      expect((fetchAPI as Mock).mock.calls.filter(([, method]) => method === 'PUT')).toHaveLength(0)
      await fireEvent.click(within(modal).getByRole('button', { name: 'Try again' }))
      resolvePreview(
        okJson({
          bot: { name: 'Preview bot', avatarUrl: null },
          online: true,
          embeds: [
            { title: 'Ready status', color: 0, fields: [], timestamp: '2026-11-20T12:00:00.000Z', imageUrl: null },
          ],
          buttonRows: [[{ label: 'Website', emoji: '🎮', url: 'https://example.com' }]],
        }),
      )
      await vi.waitFor(() => expect(save).not.toBeDisabled())
      await fireEvent.click(save)
      await vi.waitFor(() =>
        expect(fetchAPI).toHaveBeenCalledWith(`${BUTTONS_URL}/1`, 'PUT', expect.objectContaining({ name: 'Website' })),
      )
      await vi.waitFor(() => expect(modal.open).toBe(false))
    })

    it('keeps edits local and updates the complete preview before Save, then discards them on Cancel', async () => {
      const original = statusButton({ server: 's1', createdAt: new Date().toISOString() })
      const untouched = statusButton({ id: 2, name: 'Community', url: 'https://community.example.test' })
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string, body: any) => {
        if (endpoint === BUTTONS_URL && method === 'GET') return Promise.resolve(okJson([original, untouched]))
        if (endpoint.endsWith('/status/preview') && method === 'POST')
          return Promise.resolve(
            okJson({
              bot: { name: 'Preview bot', avatarUrl: null },
              online: true,
              embeds: [
                {
                  title: 'Server status',
                  color: 0x393a41,
                  fields: [],
                  timestamp: '2026-11-20T12:00:00.000Z',
                  imageUrl: null,
                },
              ],
              buttonRows: [
                body.buttons
                  .filter((button: any) => button.enable)
                  .map((button: any) => ({ label: button.name, emoji: button.emoji, url: button.url })),
              ],
            }),
          )
        return Promise.resolve(okJson({}))
      })
      const { container } = renderPage(true)
      await vi.waitFor(() => expect(container.querySelector('tbody')?.textContent).toContain('Website'))
      stubDialogGlobal(container, 'edit_status_button')
      await fireEvent.click(container.querySelector('[data-icon="pencil"]') as HTMLElement)
      const modal = container.querySelector('#edit_status_button') as HTMLDialogElement
      await vi.waitFor(() => expect(within(modal).getByRole('button', { name: 'Website' })).toBeInTheDocument())
      await fireEvent.input(within(modal).getByDisplayValue('Website'), { target: { value: 'Live draft' } })
      await fireEvent.input(within(modal).getByDisplayValue('https://example.com'), {
        target: { value: 'https://draft.example.test' },
      })
      await vi.waitFor(() =>
        expect(within(modal).getByRole('button', { name: 'Live draft' })).toHaveAttribute(
          'title',
          'https://draft.example.test',
        ),
      )
      await fireEvent.click(modal.querySelector('button.input')!)
      modal.querySelector('emoji-picker')!.dispatchEvent(new CustomEvent('emoji-click', { detail: { unicode: '😀' } }))
      const previews = () => (fetchAPI as Mock).mock.calls.filter(([endpoint]) => endpoint.endsWith('/status/preview'))
      await vi.waitFor(() => expect(previews().at(-1)![2].buttons[0].emoji).toBe('😀'))
      expect(previews().at(-1)![2].buttons).toEqual([
        { id: 1, name: 'Live draft', emoji: '😀', url: 'https://draft.example.test', enable: true },
        untouched,
      ])
      expect(container.querySelector('tbody')?.textContent).toContain('Website')
      expect(original).toMatchObject({ name: 'Website', url: 'https://example.com', enable: true })
      expect(container.querySelector('tbody')?.textContent).toContain('Community')
      await fireEvent.change(within(modal).getByRole('combobox'), { target: { value: 'false' } })
      await vi.waitFor(() => expect(previews().at(-1)![2].buttons).toEqual([untouched]))
      expect(within(modal).queryByRole('button', { name: 'Live draft' })).not.toBeInTheDocument()
      expect(container.querySelector('tbody [data-icon="check"]')).toBeInTheDocument()
      expect((fetchAPI as Mock).mock.calls.filter(([, method]) => method === 'PUT')).toHaveLength(0)
      await fireEvent.click(within(modal).getByRole('button', { name: 'Cancel' }))
      expect(modal.open).toBe(false)
      await vi.waitFor(() => expect(previews().at(-1)![2].buttons[0]).toMatchObject({ name: 'Website', enable: true }))
      expect(
        (fetchAPI as Mock).mock.calls.filter(([, method]) => method === 'PUT' || method === 'DELETE'),
      ).toHaveLength(0)
    })

    it('falls back to stored server buttons for preview when the button list request fails', async () => {
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === BUTTONS_URL && method === 'GET') return Promise.reject(new Error('Buttons unavailable'))
        if (endpoint.endsWith('/status/preview') && method === 'POST')
          return Promise.resolve(
            okJson({
              bot: { name: 'Preview bot', avatarUrl: null },
              online: false,
              embeds: [
                { title: 'Stored status', color: 0, fields: [], timestamp: '2026-11-20T12:00:00.000Z', imageUrl: null },
              ],
              buttonRows: [],
            }),
          )
        return Promise.resolve(okJson({}))
      })
      renderPage(true)
      await vi.waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Failed to load'))
      await vi.waitFor(() =>
        expect((fetchAPI as Mock).mock.calls.some(([endpoint]) => endpoint.endsWith('/status/preview'))).toBe(true),
      )
      const previewCall = (fetchAPI as Mock).mock.calls.find(([endpoint]) => endpoint.endsWith('/status/preview'))!
      expect(previewCall[2]).not.toHaveProperty('buttons')
      expect(
        (fetchAPI as Mock).mock.calls.filter(([, method]) => method === 'PUT' || method === 'DELETE'),
      ).toHaveLength(0)
    })

    it('restores persisted buttons when the dialog is closed or canceled by the browser', async () => {
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string, body: any) => {
        if (endpoint === BUTTONS_URL && method === 'GET') return Promise.resolve(okJson([statusButton()]))
        if (endpoint.endsWith('/status/preview') && method === 'POST')
          return Promise.resolve(
            okJson({
              bot: { name: 'Preview bot', avatarUrl: null },
              online: true,
              embeds: [
                { title: 'Status', color: 0, fields: [], timestamp: '2026-11-20T12:00:00.000Z', imageUrl: null },
              ],
              buttonRows: [
                body.buttons.map((button: any) => ({ label: button.name, emoji: button.emoji, url: button.url })),
              ],
            }),
          )
        return Promise.resolve(okJson({}))
      })
      const { container } = renderPage(true)
      await vi.waitFor(() => expect(container.querySelector('tbody')?.textContent).toContain('Website'))
      const modal = stubDialogGlobal(container, 'edit_status_button')
      for (const eventName of ['close', 'cancel']) {
        await fireEvent.click(container.querySelector('[data-icon="pencil"]') as HTMLElement)
        await fireEvent.input(within(modal).getByDisplayValue('Website'), { target: { value: 'Unpublished' } })
        await vi.waitFor(() =>
          expect(
            (fetchAPI as Mock).mock.calls.filter(([endpoint]) => endpoint.endsWith('/status/preview')).at(-1)![2]
              .buttons[0].name,
          ).toBe('Unpublished'),
        )
        modal.dispatchEvent(new Event(eventName))
        await vi.waitFor(() =>
          expect(
            (fetchAPI as Mock).mock.calls.filter(([endpoint]) => endpoint.endsWith('/status/preview')).at(-1)![2]
              .buttons[0].name,
          ).toBe('Website'),
        )
        modal.close()
      }
      expect((fetchAPI as Mock).mock.calls.filter(([, method]) => method === 'PUT')).toHaveLength(0)
    })

    it('prefills the modal with the selected button and saves changes', async () => {
      ;(fetchAPI as Mock).mockResolvedValue(okJson([statusButton()]))
      const { container } = renderPage()
      await vi.waitFor(() => expect(screen.getByText('Website')).toBeInTheDocument())
      stubDialogGlobal(container, 'edit_status_button')
      await fireEvent.click(container.querySelector('[data-icon="pencil"]') as HTMLElement)

      const modal = container.querySelector('#edit_status_button') as HTMLElement
      expect(modal.hasAttribute('open')).toBe(true)
      expect(within(modal).getByDisplayValue('Website')).toBeInTheDocument()
      expect(within(modal).getByDisplayValue('https://example.com')).toBeInTheDocument()

      const nameInput = within(modal).getByDisplayValue('Website') as HTMLInputElement
      await fireEvent.input(nameInput, { target: { value: 'Renamed' } })
      const urlInput = within(modal).getByDisplayValue('https://example.com') as HTMLInputElement
      await fireEvent.input(urlInput, { target: { value: 'https://new.example.com' } })
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
      await fireEvent.click(container.querySelector('[data-icon="pencil"]') as HTMLElement)
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === `${BUTTONS_URL}/1` && method === 'PUT') return Promise.resolve(errJson())
        return Promise.resolve(okJson([statusButton()]))
      })
      const modal = container.querySelector('#edit_status_button') as HTMLElement
      await fireEvent.click(within(modal).getByText('Save'))
      await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(`${BUTTONS_URL}/1`, 'PUT', expect.anything()))
      expect(screen.getByText('Website')).toBeInTheDocument()
      expect(modal).toHaveAttribute('open')
      expect(within(modal).getByRole('alert')).toHaveTextContent('Unable to save this button. Try again.')
    })

    it('keeps a failed network draft editable and prevents duplicate saves while a request is pending', async () => {
      ;(fetchAPI as Mock).mockResolvedValue(okJson([statusButton()]))
      const { container } = renderPage()
      await vi.waitFor(() => expect(screen.getByText('Website')).toBeInTheDocument())
      stubDialogGlobal(container, 'edit_status_button')
      await fireEvent.click(container.querySelector('[data-icon="pencil"]') as HTMLElement)
      const modal = container.querySelector('#edit_status_button') as HTMLDialogElement
      const input = within(modal).getByDisplayValue('Website')
      await fireEvent.input(input, { target: { value: 'Retry me' } })
      let rejectSave!: (reason: Error) => void
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === `${BUTTONS_URL}/1` && method === 'PUT')
          return new Promise((_, reject) => {
            rejectSave = reject
          })
        return Promise.resolve(okJson([statusButton()]))
      })
      const save = within(modal).getByRole('button', { name: 'Save' })
      await fireEvent.click(save)
      expect(save).toBeDisabled()
      expect(input).toBeDisabled()
      await fireEvent.click(save)
      expect((fetchAPI as Mock).mock.calls.filter(([, method]) => method === 'PUT')).toHaveLength(1)
      rejectSave(new Error('Connection lost'))
      await vi.waitFor(() => expect(within(modal).getByRole('alert')).toBeInTheDocument())
      expect(modal.open).toBe(true)
      expect(input).toHaveValue('Retry me')
      expect(save).not.toBeDisabled()
      expect(screen.getByText('Website')).toBeInTheDocument()
    })

    it('toggles the emoji picker open and closed via the emoji select button', async () => {
      ;(fetchAPI as Mock).mockResolvedValue(okJson([statusButton()]))
      const { container } = renderPage()
      await vi.waitFor(() => expect(screen.getByText('Website')).toBeInTheDocument())
      stubDialogGlobal(container, 'edit_status_button')
      await fireEvent.click(container.querySelector('[data-icon="pencil"]') as HTMLElement)

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
      await fireEvent.click(container.querySelector('[data-icon="pencil"]') as HTMLElement)

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
      await fireEvent.click(container.querySelector('[data-icon="trash-2"]') as HTMLElement)
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
      await fireEvent.click(container.querySelector('[data-icon="trash-2"]') as HTMLElement)
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

    it('requires a successful list retry before allowing creation after a failed GET', async () => {
      let failList = true
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === BUTTONS_URL && method === 'GET') return Promise.resolve(failList ? errJson() : okJson([]))
        if (endpoint === BUTTONS_URL && method === 'POST')
          return Promise.resolve(okJson(statusButton({ id: 3, name: 'First' })))
        return Promise.resolve(okJson([]))
      })
      renderPage()
      await vi.waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Failed to load'))
      expect(screen.getByText('Add Button')).toBeDisabled()
      failList = false
      await fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
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
      await vi.waitFor(() => expect(screen.getByText('Limited to 3 buttons for free users.')).toBeInTheDocument())
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
