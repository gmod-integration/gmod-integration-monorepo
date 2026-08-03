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
  clearDialogGlobals('edit_select_link')
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
    expect(rows[0].querySelector('.fa-check')).toBeInTheDocument()
    expect(rows[1].querySelector('.fa-times')).toBeInTheDocument()
  })

  it('shows a loading spinner and hides the table body while links is loading', () => {
    ;(fetchAPI as Mock).mockImplementation(() => new Promise(() => {}))
    const { container } = renderWithProviders(() => <GuildLinks />)
    expect(container.querySelector('.loading-spinner')).toBeInTheDocument()
    expect(screen.queryAllByRole('row')).toHaveLength(1) // header row only, tbody For is gated
  })

  it('renders an empty list (not an error) when the links GET responds with a non-ok status', async () => {
    ;(fetchAPI as Mock).mockImplementation(() => Promise.resolve(errJson()))
    renderWithProviders(() => <GuildLinks />)
    await vi.waitFor(() => expect(screen.queryAllByRole('row')).toHaveLength(1)) // header row only
    expect(screen.queryByText('Failed to load the links')).not.toBeInTheDocument()
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

    it('adds a link and appends it to the list on success', async () => {
      renderWithProviders(() => <GuildLinks />)
      await waitForLoaded()
      const newLink = { id: 3, alias: 'New', url: 'https://new.example.com', active: true }
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === LINKS_URL && method === 'POST') return Promise.resolve(okJson(newLink))
        return Promise.resolve(okJson({}))
      })
      await fireEvent.click(screen.getByText('Add Link'))
      await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(LINKS_URL, 'POST'))
      await vi.waitFor(() => expect(screen.getByText('New')).toBeInTheDocument())
    })

    it('does not update the list when adding a link fails', async () => {
      renderWithProviders(() => <GuildLinks />)
      await waitForLoaded()
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === LINKS_URL && method === 'POST') return Promise.resolve(errJson())
        return Promise.resolve(okJson({}))
      })
      await fireEvent.click(screen.getByText('Add Link'))
      await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(LINKS_URL, 'POST'))
      expect(screen.getAllByRole('row')).toHaveLength(3) // header + 2 unchanged rows
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
      const deleteIcons = container.querySelectorAll('.fa-trash')
      await fireEvent.click(deleteIcons[1])
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
      const deleteIcons = container.querySelectorAll('.fa-trash')
      await fireEvent.click(deleteIcons[1])
      await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(`${LINKS_URL}/2`, 'DELETE'))
      expect(screen.getByText('Docs')).toBeInTheDocument()
    })
  })

  describe('edit link modal', () => {
    it('opens with the selected link and saves edits to alias, url and active', async () => {
      const { container } = renderWithProviders(() => <GuildLinks />)
      await waitForLoaded()
      stubDialogGlobal(container, 'edit_select_link')

      const editIcons = container.querySelectorAll('.fa-edit')
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
      const editIcons = container.querySelectorAll('.fa-edit')
      await fireEvent.click(editIcons[0])
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === `${LINKS_URL}/1` && method === 'PUT') return Promise.resolve(errJson())
        return Promise.resolve(okJson({}))
      })
      const modal = container.querySelector('#edit_select_link') as HTMLElement
      await fireEvent.click(within(modal).getByText('Save'))
      await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(`${LINKS_URL}/1`, 'PUT', expect.anything()))
      expect(screen.getByText('Site')).toBeInTheDocument()
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
      expect(screen.getByText('Add Link')).toBeInTheDocument()
    })

    it('shows Add Link when free and under the 2-link limit', async () => {
      setupFetchAPI([defaultLinksRaw()[0]])
      renderWithProviders(() => <GuildLinks />)
      await waitForLoaded()
      expect(screen.getByText('Add Link')).toBeInTheDocument()
    })

    it('shows the premium upsell instead of Add Link when free and at the 2-link limit', async () => {
      renderWithProviders(() => <GuildLinks />)
      await waitForLoaded()
      expect(screen.queryByText('Add Link')).not.toBeInTheDocument()
      expect(screen.getByText('Limited to 2 links for free users.')).toBeInTheDocument()
    })
  })
})
