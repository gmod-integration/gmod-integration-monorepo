import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@solidjs/testing-library'
import { renderWithProviders } from '../../../testUtils.js'
import GuildLinks from '../../../../src/pages/dashboard/guilds/GuildLinks.js'
import { fetchAPI } from '../../../../src/utils/api.js'
import { okJson, errJson, stubDialogGlobal, clearDialogGlobals } from './servers/testHelpers.js'

vi.mock('../../../../src/utils/api.js', () => ({
  fetchAPI: vi.fn(),
  getAPIUrl: vi.fn(),
  getUrlWithActualParams: vi.fn((s: string) => s),
}))

const LINKS_URL = '/users/:discordID/guilds/:guildID/links'

afterEach(() => {
  cleanup()
  clearDialogGlobals('edit_select_link', 'delete_link')
  vi.restoreAllMocks()
})

function defaultLinksRaw() {
  return [
    { id: 1, alias: 'Site', url: 'https://example.com/', active: true },
    { id: 2, alias: 'Docs', url: 'https://docs.example.com', active: false },
  ]
}

function setupFetchAPI(links: unknown = defaultLinksRaw()) {
  ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
    if (endpoint === LINKS_URL && method === 'GET') return Promise.resolve(okJson(links))
    return Promise.resolve(okJson({}))
  })
}

async function waitForLoaded() {
  await vi.waitFor(() => expect(screen.getByText('Site')).toBeInTheDocument())
}

describe('pages/dashboard/guilds/GuildLinks.tsx', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: false }))
    ;(fetchAPI as Mock).mockReset()
    setupFetchAPI()
  })

  it('renders the loaded link list with alias, url and active markers', async () => {
    renderWithProviders(() => <GuildLinks />)
    await waitForLoaded()
    expect(screen.getByText('Docs')).toBeInTheDocument()
    // LinkValue strips the protocol and trailing slash when no explicit text is given.
    expect(screen.getByText('example.com')).toBeInTheDocument()
    expect(screen.getByText('docs.example.com')).toBeInTheDocument()
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows[0].querySelector('svg[data-icon="check"]')).toBeInTheDocument()
    expect(rows[1].querySelector('svg[data-icon="x"]')).toBeInTheDocument()
  })

  it('shows a loading spinner and hides the table body while links is loading', () => {
    ;(fetchAPI as Mock).mockImplementation(() => new Promise(() => {}))
    const { container } = renderWithProviders(() => <GuildLinks />)
    expect(container.querySelector('.loading-spinner')).toBeInTheDocument()
    expect(screen.queryAllByRole('row')).toHaveLength(1) // header row only, tbody For is gated
  })

  it('shows a retryable error when the links GET responds with a non-ok status', async () => {
    ;(fetchAPI as Mock).mockImplementation(() => Promise.resolve(errJson()))
    renderWithProviders(() => <GuildLinks />)
    await vi.waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Failed to load the links'))
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    setupFetchAPI()
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitForLoaded()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('Docs')).toBeInTheDocument()
  })

  it('shows the failed-to-load message when the links fetch rejects', async () => {
    ;(fetchAPI as Mock).mockImplementation(() => Promise.reject(new Error('network down')))
    renderWithProviders(() => <GuildLinks />)
    await vi.waitFor(() => expect(screen.getByText('Failed to load the links')).toBeInTheDocument())
  })

  describe('add link', () => {
    beforeEach(() => {
      // The default 2-link fixture is already at the free-tier limit, which hides "Add Link"
      // behind the premium upsell (covered separately below) - go premium here so it's visible.
      window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: true }))
    })

    it('opens an empty draft and sends all fields only on Create', async () => {
      const { container } = renderWithProviders(() => <GuildLinks />)
      await waitForLoaded()
      await fireEvent.click(screen.getByRole('button', { name: 'Add Link' }))
      const modal = container.querySelector<HTMLDialogElement>('#edit_select_link')!
      expect(within(modal).getByLabelText(/^Alias/)).toHaveValue('')
      expect(within(modal).getByRole('button', { name: 'Create' })).toBeDisabled()
      await fireEvent.input(within(modal).getByLabelText(/^Alias/), { target: { value: 'New' } })
      await fireEvent.input(within(modal).getByLabelText(/^URL/), { target: { value: 'https://new.example.com' } })
      await fireEvent.change(within(modal).getByLabelText('Active'), { target: { value: 'true' } })
      expect((fetchAPI as Mock).mock.calls.filter(([, method]) => method === 'POST')).toHaveLength(0)
      ;(fetchAPI as Mock).mockResolvedValue(
        okJson({ id: 3, alias: 'New', url: 'https://new.example.com', active: true }),
      )
      await fireEvent.click(within(modal).getByRole('button', { name: 'Create' }))
      await vi.waitFor(() =>
        expect(fetchAPI).toHaveBeenCalledWith(LINKS_URL, 'POST', {
          alias: 'New',
          url: 'https://new.example.com',
          active: true,
        }),
      )
      await vi.waitFor(() => expect(screen.getByText('New')).toBeInTheDocument())
      await vi.waitFor(() => expect(modal.open).toBe(false))
    })

    it('preserves a failed creation draft and permits retry', async () => {
      const { container } = renderWithProviders(() => <GuildLinks />)
      await waitForLoaded()
      await fireEvent.click(screen.getByRole('button', { name: 'Add Link' }))
      const modal = container.querySelector<HTMLDialogElement>('#edit_select_link')!
      await fireEvent.input(within(modal).getByLabelText(/^Alias/), { target: { value: 'New' } })
      await fireEvent.input(within(modal).getByLabelText(/^URL/), { target: { value: 'https://new.example.com' } })
      ;(fetchAPI as Mock).mockResolvedValue(errJson())
      await fireEvent.click(within(modal).getByRole('button', { name: 'Create' }))
      await vi.waitFor(() => expect(within(modal).getByRole('alert')).toBeInTheDocument())
      expect(within(modal).getByLabelText(/^Alias/)).toHaveValue('New')
      expect(modal.open).toBe(true)
      ;(fetchAPI as Mock).mockResolvedValue(
        okJson({ id: 3, alias: 'New', url: 'https://new.example.com', active: false }),
      )
      await fireEvent.click(within(modal).getByRole('button', { name: 'Create' }))
      await vi.waitFor(() => expect(modal.open).toBe(false))
    })

    it('rejects empty aliases and unsafe URL schemes before any request', async () => {
      const { container } = renderWithProviders(() => <GuildLinks />)
      await waitForLoaded()
      await fireEvent.click(screen.getByRole('button', { name: 'Add Link' }))
      const modal = container.querySelector<HTMLDialogElement>('#edit_select_link')!
      await fireEvent.input(within(modal).getByLabelText(/^Alias/), { target: { value: '   ' } })
      await fireEvent.input(within(modal).getByLabelText(/^URL/), { target: { value: 'javascript:alert(1)' } })
      expect(within(modal).getByRole('button', { name: 'Create' })).toBeDisabled()
      expect((fetchAPI as Mock).mock.calls.filter(([, method]) => method !== 'GET')).toHaveLength(0)
    })
  })

  describe('delete link', () => {
    it('deletes a link and removes it from the list on success', async () => {
      const { container } = renderWithProviders(() => <GuildLinks />)
      await waitForLoaded()
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === `${LINKS_URL}/2` && method === 'DELETE') return Promise.resolve(okJson({ id: 2 }))
        return Promise.resolve(okJson({}))
      })
      const deleteIcons = container.querySelectorAll('svg[data-icon="trash-2"]')
      await fireEvent.click(deleteIcons[1])
      const confirmation = container.querySelector<HTMLDialogElement>('#delete_link')!
      expect(within(confirmation).getByText('Delete Docs?')).toBeInTheDocument()
      expect((fetchAPI as Mock).mock.calls.filter(([, method]) => method === 'DELETE')).toHaveLength(0)
      await fireEvent.click(within(confirmation).getByRole('button', { name: 'Delete' }))
      await vi.waitFor(() => expect(screen.queryByText('Docs')).not.toBeInTheDocument())
      expect(screen.getByText('Site')).toBeInTheDocument()
    })

    it('does not remove the row when deleting a link fails', async () => {
      const { container } = renderWithProviders(() => <GuildLinks />)
      await waitForLoaded()
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === `${LINKS_URL}/2` && method === 'DELETE') return Promise.resolve(errJson())
        return Promise.resolve(okJson({}))
      })
      const deleteIcons = container.querySelectorAll('svg[data-icon="trash-2"]')
      await fireEvent.click(deleteIcons[1])
      const confirmation = container.querySelector<HTMLDialogElement>('#delete_link')!
      expect(within(confirmation).getByText('Delete Docs?')).toBeInTheDocument()
      expect((fetchAPI as Mock).mock.calls.filter(([, method]) => method === 'DELETE')).toHaveLength(0)
      await fireEvent.click(within(confirmation).getByRole('button', { name: 'Delete' }))
      await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(`${LINKS_URL}/2`, 'DELETE'))
      expect(screen.getByText('Docs')).toBeInTheDocument()
    })
  })

  describe('edit link modal', () => {
    it('opens with the selected link and saves edits to alias, url and active', async () => {
      const { container } = renderWithProviders(() => <GuildLinks />)
      await waitForLoaded()
      stubDialogGlobal(container, 'edit_select_link')

      const editIcons = container.querySelectorAll('svg[data-icon="pencil"]')
      await fireEvent.click(editIcons[0])

      const modal = container.querySelector('#edit_select_link') as HTMLElement
      const [aliasInput, urlInput] = within(modal).getAllByRole('textbox') as HTMLInputElement[]
      expect(aliasInput.value).toBe('Site')
      expect(urlInput.value).toBe('https://example.com/')

      await fireEvent.input(aliasInput, { target: { value: 'Site Renamed' } })
      await fireEvent.input(urlInput, { target: { value: 'https://renamed.example.com' } })
      const activeSelect = within(modal).getByRole('combobox') as HTMLSelectElement
      expect(activeSelect.value).toBe('true')
      await fireEvent.change(activeSelect, { target: { value: 'false' } })

      const updated = { id: 1, alias: 'Site Renamed', url: 'https://renamed.example.com', active: false }
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === `${LINKS_URL}/1` && method === 'PUT') return Promise.resolve(okJson(updated))
        return Promise.resolve(okJson({}))
      })
      await fireEvent.click(within(modal).getByText('Save'))

      await vi.waitFor(() =>
        expect(fetchAPI).toHaveBeenCalledWith(`${LINKS_URL}/1`, 'PUT', {
          alias: 'Site Renamed',
          url: 'https://renamed.example.com',
          active: false,
        }),
      )
      await vi.waitFor(() => expect(screen.getByText('Site Renamed')).toBeInTheDocument())
    })

    it('does not update the list when editing a link fails', async () => {
      const { container } = renderWithProviders(() => <GuildLinks />)
      await waitForLoaded()
      stubDialogGlobal(container, 'edit_select_link')
      const editIcons = container.querySelectorAll('svg[data-icon="pencil"]')
      await fireEvent.click(editIcons[0])
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === `${LINKS_URL}/1` && method === 'PUT') return Promise.resolve(errJson())
        return Promise.resolve(okJson({}))
      })
      const modal = container.querySelector('#edit_select_link') as HTMLElement
      await fireEvent.input(within(modal).getByLabelText(/^Alias/), { target: { value: 'Unsaved alias' } })
      await fireEvent.click(within(modal).getByText('Save'))
      await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(`${LINKS_URL}/1`, 'PUT', expect.anything()))
      expect(screen.getByText('Site')).toBeInTheDocument()
      expect(modal).toHaveAttribute('open')
      await vi.waitFor(() => expect(within(modal).getByRole('alert')).toBeInTheDocument())
      expect(within(modal).getByLabelText(/^Alias/)).toHaveValue('Unsaved alias')
    })

    it('discards changes on Cancel and restores the saved values when reopened', async () => {
      const { container } = renderWithProviders(() => <GuildLinks />)
      await waitForLoaded()
      const edit = screen.getAllByRole('button', { name: 'Edit' })[0]
      await fireEvent.click(edit)
      const modal = container.querySelector<HTMLDialogElement>('#edit_select_link')!
      await fireEvent.input(within(modal).getByLabelText(/^Alias/), { target: { value: 'Local draft' } })
      await fireEvent.input(within(modal).getByLabelText(/^URL/), { target: { value: 'https://draft.example' } })
      expect(screen.getByText('Site')).toBeInTheDocument()
      expect(screen.queryByText('Local draft')).not.toBeInTheDocument()
      await fireEvent.click(within(modal).getByRole('button', { name: 'Cancel' }))
      await vi.waitFor(() => expect(modal.open).toBe(false))
      await fireEvent.click(edit)
      expect(within(modal).getByLabelText(/^Alias/)).toHaveValue('Site')
      expect(within(modal).getByLabelText(/^URL/)).toHaveValue('https://example.com/')
      expect((fetchAPI as Mock).mock.calls.filter(([, method]) => method === 'PUT')).toHaveLength(0)
    })

    it('blocks duplicate saves and keeps the dialog open until the request succeeds', async () => {
      const { container } = renderWithProviders(() => <GuildLinks />)
      await waitForLoaded()
      await fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0])
      const modal = container.querySelector<HTMLDialogElement>('#edit_select_link')!
      await fireEvent.input(within(modal).getByLabelText(/^Alias/), { target: { value: 'Saved alias' } })
      let resolveSave!: (response: ReturnType<typeof okJson>) => void
      ;(fetchAPI as Mock).mockImplementation(() => new Promise((resolve) => (resolveSave = resolve)))
      const save = within(modal).getByRole('button', { name: 'Save' })
      await fireEvent.click(save)
      await fireEvent.click(save)
      expect((fetchAPI as Mock).mock.calls.filter(([, method]) => method === 'PUT')).toHaveLength(1)
      expect(save).toBeDisabled()
      expect(within(modal).getByRole('button', { name: 'Cancel' })).toBeDisabled()
      expect(within(modal).getByLabelText(/^Alias/)).toBeDisabled()
      expect(modal.open).toBe(true)
      resolveSave(okJson({ ...defaultLinksRaw()[0], alias: 'Saved alias' }))
      await vi.waitFor(() => expect(modal.open).toBe(false))
      expect(screen.getByText('Saved alias')).toBeInTheDocument()
    })

    it('disables the modal fields while links is loading', () => {
      ;(fetchAPI as Mock).mockImplementation(() => new Promise(() => {}))
      const { container } = renderWithProviders(() => <GuildLinks />)
      const modal = container.querySelector('#edit_select_link') as HTMLElement
      const inputs = within(modal).getAllByRole('textbox', { hidden: true }) as HTMLInputElement[]
      inputs.forEach((input) => expect(input).toBeDisabled())
      expect(within(modal).getByRole('combobox', { hidden: true })).toBeDisabled()
    })
  })

  describe('premium gating for Add Link', () => {
    it('shows Add Link directly when premium, even at the free limit', async () => {
      window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: true }))
      renderWithProviders(() => <GuildLinks />)
      await waitForLoaded()
      expect(screen.getByRole('button', { name: 'Add Link' })).toBeInTheDocument()
    })

    it('shows Add Link when free and under the 2-link limit', async () => {
      setupFetchAPI([defaultLinksRaw()[0]])
      renderWithProviders(() => <GuildLinks />)
      await waitForLoaded()
      expect(screen.getByRole('button', { name: 'Add Link' })).toBeInTheDocument()
    })

    it('keeps Add Link visible and disabled with its quota when free and at the 2-link limit', async () => {
      renderWithProviders(() => <GuildLinks />)
      await waitForLoaded()
      expect(screen.getByRole('button', { name: 'Add Link' })).toBeDisabled()
      expect(screen.getByText('2 / 2 used')).toBeInTheDocument()
    })
  })
  it('paginates large link lists and edits the selected link on a later page', async () => {
    localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: true }))
    const links = Array.from({ length: 26 }, (_, index) => ({
      id: index + 1,
      alias: `Link ${index + 1}`,
      url: `https://example.com/${index + 1}`,
      active: true,
    }))
    setupFetchAPI(links)
    const { container } = renderWithProviders(() => <GuildLinks />)
    await vi.waitFor(() => expect(screen.getByText('Link 1')).toBeInTheDocument())
    expect(screen.getByRole('table').querySelectorAll('tbody tr')).toHaveLength(25)
    const pager = screen.getByRole('navigation', { name: 'Pagination' })
    expect(pager.closest('table')).toBeNull()
    await fireEvent.click(within(pager).getByRole('button', { name: 'Next page' }))
    expect(screen.getByText('Link 26')).toBeInTheDocument()
    expect(screen.queryByText('Link 1')).not.toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const editor = within(container.querySelector<HTMLDialogElement>('#edit_select_link')!)
    await fireEvent.input(editor.getByLabelText(/^Alias/), { target: { value: 'Updated 26' } })
    ;(fetchAPI as Mock).mockResolvedValueOnce(okJson({ ...links[25], alias: 'Updated 26' }))
    await fireEvent.click(editor.getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(screen.getByText('Updated 26')).toBeInTheDocument())
    expect(fetchAPI).toHaveBeenCalledWith(`${LINKS_URL}/26`, 'PUT', {
      alias: 'Updated 26',
      url: 'https://example.com/26',
      active: true,
    })
    await fireEvent.click(within(pager).getByRole('button', { name: 'Previous page' }))
    expect(screen.getByText('Link 1')).toBeInTheDocument()
    expect(screen.queryByText('Updated 26')).not.toBeInTheDocument()
  })

  it('uses the full link count for quotas and clamps after deleting the last page', async () => {
    const links = Array.from({ length: 26 }, (_, index) => ({
      id: index + 1,
      alias: `Link ${index + 1}`,
      url: `https://example.com/${index + 1}`,
      active: true,
    }))
    setupFetchAPI(links)
    renderWithProviders(() => <GuildLinks />)
    await vi.waitFor(() => expect(screen.getByText('26 / 2 used')).toBeInTheDocument())
    await fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.getByRole('button', { name: 'Add Link' })).toBeDisabled()
    expect(screen.getByText('26 / 2 used')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    const confirmation = screen.getByRole('dialog', { name: 'Delete Link 26?' })
    await fireEvent.click(within(confirmation).getByRole('button', { name: 'Delete' }))
    await vi.waitFor(() => expect(screen.getByText('Link 1')).toBeInTheDocument())
    expect(fetchAPI).toHaveBeenCalledWith(`${LINKS_URL}/26`, 'DELETE')
    expect(screen.queryByRole('navigation', { name: 'Pagination' })).not.toBeInTheDocument()
    expect(screen.getByText('25 / 2 used')).toBeInTheDocument()
  })
  it('reveals a newly created link when it starts a new page', async () => {
    localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: true }))
    const links = Array.from({ length: 25 }, (_, index) => ({
      id: index + 1,
      alias: `Link ${index + 1}`,
      url: `https://example.com/${index + 1}`,
      active: true,
    }))
    setupFetchAPI(links)
    renderWithProviders(() => <GuildLinks />)
    await vi.waitFor(() => expect(screen.getByText('Link 1')).toBeInTheDocument())
    await fireEvent.click(screen.getByRole('button', { name: 'Add Link' }))
    const editor = within(document.getElementById('edit_select_link')!)
    await fireEvent.input(editor.getByLabelText(/^Alias/), { target: { value: 'New link' } })
    await fireEvent.input(editor.getByLabelText(/^URL/), { target: { value: 'https://new.example.com' } })
    ;(fetchAPI as Mock).mockResolvedValueOnce(
      okJson({ id: 26, alias: 'New link', url: 'https://new.example.com', active: false }),
    )
    await fireEvent.click(editor.getByRole('button', { name: 'Create' }))
    await vi.waitFor(() => expect(screen.getByText('New link')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Page 2 of 2' })).toBeInTheDocument()
    expect(screen.getByRole('table').querySelectorAll('tbody tr')).toHaveLength(1)
    expect(screen.queryByText('Link 1')).not.toBeInTheDocument()
  })
})
