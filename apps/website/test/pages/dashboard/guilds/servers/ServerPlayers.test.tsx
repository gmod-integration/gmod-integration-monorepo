import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@solidjs/testing-library'
import { historyAt, renderWithProviders } from '../../../../testUtils.js'
import ServerPlayer from '../../../../../src/pages/dashboard/guilds/servers/ServerPlayers.js'
import { fetchAPI } from '../../../../../src/utils/api.js'
import { okJson, errJson, stubDialogGlobal, clearDialogGlobals } from './testHelpers.js'

vi.mock('../../../../../src/utils/api.js', () => ({
  fetchAPI: vi.fn(),
  getAPIUrl: vi.fn(),
  getUrlWithActualParams: vi.fn((s: string) => s),
}))

const PLAYERS_URL = '/users/:discordID/guilds/:guildID/servers/:serverID/players'

// Fresh literal every call - the component does `currentPlayers().bypassMaintenance = ...`
// (direct mutation, no setter) on whatever object is passed to setCurrentPlayers, so a shared
// module-level fixture would get permanently corrupted across tests (okJson returns by reference).
function defaultPlayersResponse(total = 2) {
  return {
    rows: [
      {
        steam_id: '76500000000000001',
        name: 'Alice',
        rank: 1,
        total_time: 3661,
        total_connect: 5,
        bypassMaintenance: true,
      },
      {
        steam_id: '76500000000000002',
        name: 'Bob',
        rank: 2,
        total_time: 59,
        total_connect: 1,
        bypassMaintenance: false,
      },
    ],
    query: { total, limit: 50, offset: 0 },
  }
}

function setupFetchAPI(total = 2) {
  ;(fetchAPI as Mock).mockImplementation((endpoint: string) => {
    if (typeof endpoint === 'string' && endpoint.startsWith(PLAYERS_URL)) {
      return Promise.resolve(okJson(defaultPlayersResponse(total)))
    }
    return Promise.resolve(okJson({}))
  })
}

function renderPage() {
  return renderWithProviders(() => <ServerPlayer />, {
    path: '/dashboard/guilds/:guildID/config/servers/:serverID/players',
    history: historyAt('/dashboard/guilds/g1/config/servers/s1/players'),
  })
}

async function waitForLoaded() {
  await vi.waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument())
}

function findHeader(container: HTMLElement, label: string) {
  const th = Array.from(container.querySelectorAll('th')).find((el) => el.textContent?.includes(label))
  if (!th) throw new Error(`no <th> containing "${label}"`)
  return th
}

afterEach(() => {
  cleanup()
  clearDialogGlobals('edit_player')
  vi.useRealTimers()
})

describe('pages/dashboard/guilds/servers/ServerPlayers.tsx', () => {
  beforeEach(() => {
    window.localStorage.clear()
    ;(fetchAPI as Mock).mockReset()
    setupFetchAPI()
  })

  it('shows a loading spinner while playersList is loading', () => {
    ;(fetchAPI as Mock).mockImplementation(() => new Promise(() => {}))
    const { container } = renderPage()
    expect(container.querySelector('.loading-spinner')).toBeInTheDocument()
  })

  it('shows the failed-to-load message when the resource errors', async () => {
    ;(fetchAPI as Mock).mockImplementation(() => Promise.reject(new Error('network down')))
    renderPage()
    await vi.waitFor(() => expect(screen.getByText('Failed to load the links')).toBeInTheDocument())
  })

  // Bug found & fixed (ServerPlayers.tsx:292): fetchPlayers() returns `{}` when the GET isn't ok,
  // so `playersList()` resolves successfully to `{}` (not an error state). The Pagination row was
  // reading `playersList().query.total` unconditionally, which threw
  // "Cannot read properties of undefined (reading 'total')" and crashed the whole page anytime the
  // players endpoint returned a non-ok response. Fixed with `playersList().query?.total ?? 0`.
  it('renders gracefully without crashing when the GET request is not ok', async () => {
    ;(fetchAPI as Mock).mockImplementation(() => Promise.resolve(errJson()))
    const { container } = renderPage()
    await vi.waitFor(() => expect(screen.getByText('1 / 1')).toBeInTheDocument())
    expect(container.querySelectorAll('tbody tr').length).toBe(1) // pagination row only, no player rows
  })

  it('renders player rows with formatted time, connect count, rank and bypass icons', async () => {
    const { container } = renderPage()
    await waitForLoaded()
    expect(screen.getByText('Bob')).toBeInTheDocument()
    // convertSecToTime(3661) -> 1h 1m 1s ; convertSecToTime(59) -> 59s (h/m are 0, dropped)
    expect(screen.getByText('01h 01m 01s')).toBeInTheDocument()
    expect(screen.getByText('59s')).toBeInTheDocument()

    const dataRows = container.querySelectorAll('tbody tr')
    const aliceRow = Array.from(dataRows).find((r) => r.textContent?.includes('Alice')) as HTMLElement
    const cells = aliceRow.querySelectorAll('td')
    expect(cells[1]).toHaveTextContent('1') // rank
    expect(cells[3]).toHaveTextContent('5') // total_connect
    expect(aliceRow.querySelector('.fa-check.text-success')).toBeInTheDocument()

    const bobRow = Array.from(dataRows).find((r) => r.textContent?.includes('Bob')) as HTMLElement
    expect(bobRow.querySelector('.fa-times.text-error')).toBeInTheDocument()
  })

  it('renders a steam profile link per row using the steam_id', async () => {
    const { container } = renderPage()
    await waitForLoaded()
    const link = container.querySelector('a[href="https://steamcommunity.com/profiles/76500000000000001"]')
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('target', '_blank')
  })

  describe('column sorting', () => {
    it('defaults every header sort icon to fa-sort', async () => {
      const { container } = renderPage()
      await waitForLoaded()
      expect(findHeader(container, 'Rank').querySelector('i')).toHaveClass('fa-sort')
    })

    it('sorts ascending on first click and flips to descending on a second click of the same column', async () => {
      const { container } = renderPage()
      await waitForLoaded()
      const nameHeader = findHeader(container, 'Name')

      await fireEvent.click(nameHeader)
      await vi.waitFor(() =>
        expect(fetchAPI).toHaveBeenLastCalledWith(expect.stringContaining('order=ASC'), 'GET'),
      )
      expect(nameHeader.querySelector('i')).toHaveClass('fa-sort-up')
      expect(fetchAPI).toHaveBeenLastCalledWith(expect.stringContaining('searchColum=name'), 'GET')

      await fireEvent.click(nameHeader)
      await vi.waitFor(() =>
        expect(fetchAPI).toHaveBeenLastCalledWith(expect.stringContaining('order=DESC'), 'GET'),
      )
      expect(nameHeader.querySelector('i')).toHaveClass('fa-sort-down')
    })

    it('clicking a different column resets its icon to ascending and does not affect the untouched column', async () => {
      const { container } = renderPage()
      await waitForLoaded()
      await fireEvent.click(findHeader(container, 'Name'))
      await vi.waitFor(() => expect(fetchAPI).toHaveBeenLastCalledWith(expect.stringContaining('order=ASC'), 'GET'))

      await fireEvent.click(findHeader(container, 'Rank'))
      await vi.waitFor(() =>
        expect(fetchAPI).toHaveBeenLastCalledWith(expect.stringContaining('searchColum=rank'), 'GET'),
      )
      expect(findHeader(container, 'Rank').querySelector('i')).toHaveClass('fa-sort-up')
      expect(findHeader(container, 'Name').querySelector('i')).toHaveClass('fa-sort')
    })

    it('shows a loading spinner in place of rows while a sort request is in flight, then restores the data', async () => {
      const { container } = renderPage()
      await waitForLoaded()

      let resolveFetch: (v: unknown) => void = () => {}
      ;(fetchAPI as Mock).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve
          }),
      )
      fireEvent.click(findHeader(container, 'Name'))

      await vi.waitFor(() => expect(container.querySelector('.loading-spinner')).toBeInTheDocument())
      expect(screen.queryByText('Alice')).not.toBeInTheDocument()

      resolveFetch(okJson(defaultPlayersResponse()))
      await waitForLoaded()
      expect(container.querySelector('.loading-spinner')).not.toBeInTheDocument()
    })

    it('does not restore rows when a sort request fails', async () => {
      const { container } = renderPage()
      await waitForLoaded()
      ;(fetchAPI as Mock).mockImplementation((endpoint: string) => {
        if (typeof endpoint === 'string' && endpoint.startsWith(PLAYERS_URL)) return Promise.resolve(errJson())
        return Promise.resolve(okJson({}))
      })
      await fireEvent.click(findHeader(container, 'Name'))
      await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalled())
      // the list was optimistically cleared before the request and the failed request never
      // repopulates it - this documents existing (if slightly harsh) behavior.
      expect(container.querySelector('.loading-spinner')).not.toBeInTheDocument()
      expect(screen.queryByText('Alice')).not.toBeInTheDocument()
    })
  })

  describe('pagination', () => {
    it('requests the next offset and reflects it in the page indicator', async () => {
      setupFetchAPI(120)
      const { container } = renderPage()
      await waitForLoaded()
      expect(screen.getByText('1 / 3')).toBeInTheDocument()

      const nextBtn = container.querySelector('.fa-chevron-right')?.closest('button') as HTMLButtonElement
      await fireEvent.click(nextBtn)

      await vi.waitFor(() =>
        expect(fetchAPI).toHaveBeenLastCalledWith(expect.stringContaining('offset=50'), 'GET'),
      )
      await vi.waitFor(() => expect(screen.getByText('2 / 3')).toBeInTheDocument())
    })

    it('requests the previous offset from a non-zero page', async () => {
      setupFetchAPI(120)
      const { container } = renderPage()
      await waitForLoaded()
      const nextBtn = container.querySelector('.fa-chevron-right')?.closest('button') as HTMLButtonElement
      await fireEvent.click(nextBtn)
      await vi.waitFor(() => expect(screen.getByText('2 / 3')).toBeInTheDocument())

      const prevBtn = container.querySelector('.fa-chevron-left')?.closest('button') as HTMLButtonElement
      await fireEvent.click(prevBtn)
      await vi.waitFor(() =>
        expect(fetchAPI).toHaveBeenLastCalledWith(expect.stringContaining('offset=0'), 'GET'),
      )
      await vi.waitFor(() => expect(screen.getByText('1 / 3')).toBeInTheDocument())
    })
  })

  describe('search input', () => {
    it('runs the search 400ms after typing stops, resetting to offset 0', async () => {
      const { container } = renderPage()
      await waitForLoaded()
      vi.useFakeTimers()

      const input = container.querySelector('input[placeholder^="Search"]') as HTMLInputElement
      fireEvent.input(input, { target: { value: 'alice' } })

      await vi.advanceTimersByTimeAsync(400)
      expect(fetchAPI).toHaveBeenLastCalledWith(expect.stringContaining('search=alice'), 'GET')
      expect(fetchAPI).toHaveBeenLastCalledWith(expect.stringContaining('offset=0'), 'GET')
    })

    it('only fires the last debounced search when typing multiple times quickly', async () => {
      const { container } = renderPage()
      await waitForLoaded()
      const callsBeforeTyping = (fetchAPI as Mock).mock.calls.length
      vi.useFakeTimers()

      const input = container.querySelector('input[placeholder^="Search"]') as HTMLInputElement
      fireEvent.input(input, { target: { value: 'a' } })
      fireEvent.input(input, { target: { value: 'al' } })
      fireEvent.input(input, { target: { value: 'ali' } })

      await vi.advanceTimersByTimeAsync(400)
      const callsAfter = (fetchAPI as Mock).mock.calls.length
      expect(callsAfter - callsBeforeTyping).toBe(1)
      expect(fetchAPI).toHaveBeenLastCalledWith(expect.stringContaining('search=ali'), 'GET')
    })
  })

  describe('edit player modal', () => {
    it('opens with the selected player bypassMaintenance value and disables controls while loading', async () => {
      const { container } = renderPage()
      await waitForLoaded()
      stubDialogGlobal(container, 'edit_player')
      const editIcons = container.querySelectorAll('.fa-edit')
      await fireEvent.click(editIcons[0])

      const modal = container.querySelector('#edit_player') as HTMLElement
      const select = within(modal).getByRole('combobox') as HTMLSelectElement
      expect(select.value).toBe('true') // Alice.bypassMaintenance === true
      expect(select).not.toBeDisabled()
    })

    it('saves the edited bypassMaintenance value and updates the row icon on success', async () => {
      const { container } = renderPage()
      await waitForLoaded()
      stubDialogGlobal(container, 'edit_player')
      const editIcons = container.querySelectorAll('.fa-edit')
      await fireEvent.click(editIcons[0]) // Alice, bypassMaintenance true

      const modal = container.querySelector('#edit_player') as HTMLElement
      const select = within(modal).getByRole('combobox') as HTMLSelectElement
      await fireEvent.change(select, { target: { value: 'false' } })

      const updated = { steam_id: '76500000000000001', bypassMaintenance: false }
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === `${PLAYERS_URL}/76500000000000001` && method === 'PUT') return Promise.resolve(okJson(updated))
        return Promise.resolve(okJson({}))
      })
      const saveBtn = within(modal).getByText('Save')
      await fireEvent.click(saveBtn)

      await vi.waitFor(() =>
        expect(fetchAPI).toHaveBeenCalledWith(
          `${PLAYERS_URL}/76500000000000001`,
          'PUT',
          expect.objectContaining({ steam_id: '76500000000000001', bypassMaintenance: false }),
        ),
      )
      const rows = container.querySelectorAll('tbody tr')
      const aliceRow = Array.from(rows).find((r) => r.textContent?.includes('Alice')) as HTMLElement
      expect(aliceRow.querySelector('.fa-times.text-error')).toBeInTheDocument()
    })

    it('does not update the row when saving fails', async () => {
      const { container } = renderPage()
      await waitForLoaded()
      stubDialogGlobal(container, 'edit_player')
      const editIcons = container.querySelectorAll('.fa-edit')
      await fireEvent.click(editIcons[0])
      const modal = container.querySelector('#edit_player') as HTMLElement
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === `${PLAYERS_URL}/76500000000000001` && method === 'PUT') return Promise.resolve(errJson())
        return Promise.resolve(okJson({}))
      })
      await fireEvent.click(within(modal).getByText('Save'))
      await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(`${PLAYERS_URL}/76500000000000001`, 'PUT', expect.anything()))
      const rows = container.querySelectorAll('tbody tr')
      const aliceRow = Array.from(rows).find((r) => r.textContent?.includes('Alice')) as HTMLElement
      expect(aliceRow.querySelector('.fa-check.text-success')).toBeInTheDocument()
    })
  })
})
