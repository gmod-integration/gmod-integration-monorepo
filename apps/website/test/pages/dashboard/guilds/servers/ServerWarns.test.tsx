import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { cleanup, fireEvent, screen } from '@solidjs/testing-library'
import { historyAt, renderWithProviders } from '../../../../testUtils.js'
import ServerWarns from '../../../../../src/pages/dashboard/guilds/servers/ServerWarns.js'
import { fetchAPI } from '../../../../../src/utils/api.js'
import { okJson } from './testHelpers.js'

vi.mock('../../../../../src/utils/api.js', () => ({
  fetchAPI: vi.fn(),
  getAPIUrl: vi.fn(),
  getUrlWithActualParams: vi.fn((s: string) => s),
}))

const WARNS_URL_PREFIX = '/users/:discordID/guilds/:guildID/servers/:serverID/warns'

function defaultWarnsResponse(total = 2) {
  return {
    warns: [
      {
        id: 1,
        serverID: 's1',
        userSteamID64: '76500000000000001',
        adminSteamID64: '76500000000000009',
        reason: 'Spamming chat',
        createdAt: '2024-01-01T10:00:00.000Z',
        updatedAt: '2024-01-01T10:00:00.000Z',
      },
      {
        id: 2,
        serverID: 's1',
        userSteamID64: '76500000000000002',
        adminSteamID64: '76500000000000009',
        reason: 'Prop abuse',
        createdAt: '2024-01-02T10:00:00.000Z',
        updatedAt: '2024-01-02T10:00:00.000Z',
      },
    ],
    query: { limit: 25, offset: 0, sort: 'createdAt', orderBy: 'DESC', total },
  }
}

function setupFetchAPI(total = 2) {
  ;(fetchAPI as Mock).mockImplementation((endpoint: string) => {
    if (typeof endpoint === 'string' && endpoint.startsWith(WARNS_URL_PREFIX)) {
      return Promise.resolve(okJson(defaultWarnsResponse(total)))
    }
    return Promise.resolve(okJson({}))
  })
}

function renderPage() {
  return renderWithProviders(() => <ServerWarns />, {
    path: '/dashboard/guilds/:guildID/config/servers/:serverID/warns',
    history: historyAt('/dashboard/guilds/g1/config/servers/s1/warns'),
  })
}

async function waitForLoaded() {
  await vi.waitFor(() => expect(screen.getByText('Spamming chat')).toBeInTheDocument())
}

afterEach(() => cleanup())

describe('pages/dashboard/guilds/servers/ServerWarns.tsx', () => {
  beforeEach(() => {
    window.localStorage.clear()
    ;(fetchAPI as Mock).mockReset()
    setupFetchAPI()
  })

  it('renders the panel title, description and the AWarn3 addon notice', () => {
    renderPage()
    expect(screen.getByText('Warns')).toBeInTheDocument()
    expect(screen.getByText('List of all warns on your server')).toBeInTheDocument()
    const addonLink = screen.getByText('AWarn3')
    expect(addonLink).toHaveAttribute('href', 'https://www.gmodstore.com/market/view/awarn3-warning-system')
  })

  it('shows a loading spinner in place of rows while warnsData is loading', () => {
    ;(fetchAPI as Mock).mockImplementation(() => new Promise(() => {}))
    const { container } = renderPage()
    expect(container.querySelector('.loading')).toBeInTheDocument()
    expect(screen.queryByText('Spamming chat')).not.toBeInTheDocument()
  })

  it('renders warn rows with formatted date, admin, player and reason', async () => {
    const { container } = renderPage()
    await waitForLoaded()
    expect(screen.getByText('Prop abuse')).toBeInTheDocument()
    const rows = container.querySelectorAll('tbody tr')
    // 2 warn rows + 1 pagination row
    expect(rows.length).toBe(3)
    const firstRow = rows[0]
    const cells = firstRow.querySelectorAll('td')
    expect(cells[0]).toHaveTextContent(new Date('2024-01-01T10:00:00.000Z').toLocaleString())
    expect(cells[1]).toHaveTextContent('76500000000000009')
    expect(cells[2]).toHaveTextContent('76500000000000001')
    expect(cells[3]).toHaveTextContent('Spamming chat')
  })

  it('renders an empty warns table (pagination row only) when there are no warns', async () => {
    setupFetchAPI(0)
    ;(fetchAPI as Mock).mockImplementation((endpoint: string) => {
      if (typeof endpoint === 'string' && endpoint.startsWith(WARNS_URL_PREFIX)) {
        return Promise.resolve(
          okJson({ warns: [], query: { limit: 25, offset: 0, sort: 'createdAt', orderBy: 'DESC', total: 0 } }),
        )
      }
      return Promise.resolve(okJson({}))
    })
    const { container } = renderPage()
    await vi.waitFor(() => expect(container.querySelectorAll('tbody tr').length).toBe(1))
  })

  describe('pagination', () => {
    it('requests the query string built from offset/limit/sort/orderBy', async () => {
      renderPage()
      await waitForLoaded()
      expect(fetchAPI).toHaveBeenCalledWith(
        `${WARNS_URL_PREFIX}?offset=0&limit=25&sort=createdAt&orderBy=DESC`,
        'GET',
      )
    })

    it('requests the next offset and reflects it in the page indicator', async () => {
      setupFetchAPI(60)
      const { container } = renderPage()
      await waitForLoaded()
      expect(screen.getByText('1 / 3')).toBeInTheDocument()

      const nextBtn = container.querySelector('.fa-chevron-right')?.closest('button') as HTMLButtonElement
      await fireEvent.click(nextBtn)

      await vi.waitFor(() =>
        expect(fetchAPI).toHaveBeenLastCalledWith(expect.stringContaining('offset=25'), 'GET'),
      )
      await vi.waitFor(() => expect(screen.getByText('2 / 3')).toBeInTheDocument())
    })

    it('changing the page size resets the offset to 0', async () => {
      setupFetchAPI(200)
      const { container } = renderPage()
      await waitForLoaded()
      const nextBtn = container.querySelector('.fa-chevron-right')?.closest('button') as HTMLButtonElement
      await fireEvent.click(nextBtn)
      await vi.waitFor(() => expect(screen.getByText('2 / 8')).toBeInTheDocument())

      const limitSelect = container.querySelector('select') as HTMLSelectElement
      await fireEvent.change(limitSelect, { target: { value: '50' } })
      await vi.waitFor(() =>
        expect(fetchAPI).toHaveBeenLastCalledWith(expect.stringContaining('limit=50'), 'GET'),
      )
      expect(fetchAPI).toHaveBeenLastCalledWith(expect.stringContaining('offset=0'), 'GET')
    })
  })
})
