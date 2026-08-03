import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { cleanup, fireEvent, screen } from '@solidjs/testing-library'
import { historyAt, renderWithProviders } from '../../../../testUtils.js'
import ServerBugs from '../../../../../src/pages/dashboard/guilds/servers/ServerBugs.js'
import { fetchAPI, getAPIUrl } from '../../../../../src/utils/api.js'
import { okJson, errJson } from './testHelpers.js'

vi.mock('../../../../../src/utils/api.js', () => ({
  fetchAPI: vi.fn(),
  getAPIUrl: vi.fn(() => 'https://api.example.com/v3'),
  getUrlWithActualParams: vi.fn((s: string) => s),
}))

const BUGS_URL = '/users/:discordID/guilds/:guildID/servers/:serverID/bugs'
const LONG_DESCRIPTION = 'A'.repeat(165)

function defaultBugs() {
  return [
    {
      id: 1,
      serverID: 's1',
      steamID64: '76500000000000001',
      description: 'Short bug description',
      status: 'open',
      steps: 'step 1, step 2',
      expected: 'It should not crash',
      actual: 'It crashed',
      importance: 'high',
      screenshot: 'shot1.png',
      createdAt: '2024-01-01T10:00:00.000Z',
      updatedAt: '2024-01-01T10:00:00.000Z',
    },
    {
      id: 2,
      serverID: 's1',
      steamID64: '76500000000000002',
      description: LONG_DESCRIPTION,
      status: 'open',
      steps: 'reproduce steps',
      expected: 'expected behavior',
      actual: 'actual behavior',
      importance: 'low',
      screenshot: 'shot2.png',
      createdAt: '2024-01-05T10:00:00.000Z',
      updatedAt: '2024-01-05T10:00:00.000Z',
    },
  ]
}

function setupFetchAPI(bugs: unknown = defaultBugs()) {
  ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
    if (endpoint === BUGS_URL && method === 'GET') return Promise.resolve(okJson(bugs))
    return Promise.resolve(okJson({}))
  })
}

function renderPage() {
  return renderWithProviders(() => <ServerBugs />, {
    path: '/dashboard/guilds/:guildID/config/servers/:serverID/bugs',
    history: historyAt('/dashboard/guilds/g1/config/servers/s1/bugs'),
  })
}

async function waitForLoaded() {
  await vi.waitFor(() => expect(screen.getByText('76500000000000001')).toBeInTheDocument())
}

function rowFor(container: HTMLElement, steamID: string) {
  const cell = screen.getByText(steamID)
  return cell.closest('tr') as HTMLElement
}

afterEach(() => cleanup())

describe('pages/dashboard/guilds/servers/ServerBugs.tsx', () => {
  beforeEach(() => {
    window.localStorage.clear()
    ;(fetchAPI as Mock).mockReset()
    ;(getAPIUrl as Mock).mockReset()
    ;(getAPIUrl as Mock).mockReturnValue('https://api.example.com/v3')
    setupFetchAPI()
  })

  it('renders the panel title and description', () => {
    renderPage()
    expect(screen.getByText('Bugs Report')).toBeInTheDocument()
    expect(screen.getByText('List of all bugs reported on your server')).toBeInTheDocument()
  })

  it('shows a loading indicator while bugsReport is loading', () => {
    ;(fetchAPI as Mock).mockImplementation(() => new Promise(() => {}))
    const { container } = renderPage()
    expect(container.querySelector('.loading')).toBeInTheDocument()
    expect(screen.queryByText('76500000000000001')).not.toBeInTheDocument()
  })

  it('renders an empty list without crashing when the GET is not ok', async () => {
    ;(fetchAPI as Mock).mockImplementation(() => Promise.resolve(errJson()))
    const { container } = renderPage()
    await vi.waitFor(() => expect(container.querySelector('.loading')).not.toBeInTheDocument())
    expect(container.querySelectorAll('tbody tr').length).toBe(0)
  })

  it('sorts bug rows by createdAt descending (most recent first)', async () => {
    const { container } = renderPage()
    await waitForLoaded()
    const rows = container.querySelectorAll('tbody tr')
    expect(rows[0]).toHaveTextContent('76500000000000002') // 2024-01-05, most recent
    expect(rows[1]).toHaveTextContent('76500000000000001') // 2024-01-01
  })

  it('renders each row with formatted date, steam id and importance', async () => {
    const { container } = renderPage()
    await waitForLoaded()
    const row = rowFor(container, '76500000000000001')
    const cells = row.querySelectorAll('td')
    expect(cells[0]).toHaveTextContent(new Date('2024-01-01T10:00:00.000Z').toLocaleString())
    expect(cells[1]).toHaveTextContent('76500000000000001')
    expect(cells[2]).toHaveTextContent('high')
  })

  it('renders the full description unshortened when at or under 160 characters', async () => {
    const { container } = renderPage()
    await waitForLoaded()
    const row = rowFor(container, '76500000000000001')
    expect(row).toHaveTextContent('Short bug description')
    expect(row.textContent).not.toContain('...')
  })

  it('truncates the description to 160 characters and appends "..." when longer', async () => {
    const { container } = renderPage()
    await waitForLoaded()
    const row = rowFor(container, '76500000000000002')
    expect(row.textContent).toContain(LONG_DESCRIPTION.substring(0, 160) + '...')
    expect(row.textContent).not.toContain(LONG_DESCRIPTION)
  })

  describe('show more / details toggle', () => {
    it('expands the details row on click, showing screenshot, description, expected, actual and steps', async () => {
      const { container } = renderPage()
      await waitForLoaded()
      const row = rowFor(container, '76500000000000001')
      expect(row.querySelector('.fa-chevron-down')).toBeInTheDocument()

      await fireEvent.click(row.querySelector('.tooltip') as HTMLElement)

      expect(row.querySelector('.fa-chevron-up')).toBeInTheDocument()
      expect(screen.getByText('Screenshot')).toBeInTheDocument()
      expect(screen.getByText('It should not crash')).toBeInTheDocument()
      expect(screen.getByText('It crashed')).toBeInTheDocument()
      expect(screen.getByText('step 1, step 2')).toBeInTheDocument()
      // full (untruncated) description is shown in the detail panel
      expect(screen.getByText('Short bug description', { selector: 'p' })).toBeInTheDocument()
      const img = container.querySelector('img[alt="screenshot"]') as HTMLImageElement
      expect(img).toHaveAttribute('src', 'https://api.example.com/v3/screenshots/shot1.png')
    })

    it('collapses the details row when clicking the same row again', async () => {
      const { container } = renderPage()
      await waitForLoaded()
      const row = rowFor(container, '76500000000000001')
      await fireEvent.click(row.querySelector('.tooltip') as HTMLElement)
      expect(screen.getByText('Screenshot')).toBeInTheDocument()

      await fireEvent.click(row.querySelector('.tooltip') as HTMLElement)
      expect(row.querySelector('.fa-chevron-down')).toBeInTheDocument()
      expect(screen.queryByText('Screenshot')).not.toBeInTheDocument()
    })

    it('switches the expanded row when a different row is clicked', async () => {
      const { container } = renderPage()
      await waitForLoaded()
      const row1 = rowFor(container, '76500000000000001')
      const row2 = rowFor(container, '76500000000000002')

      await fireEvent.click(row1.querySelector('.tooltip') as HTMLElement)
      expect(screen.getByText('It crashed')).toBeInTheDocument()

      await fireEvent.click(row2.querySelector('.tooltip') as HTMLElement)
      expect(screen.queryByText('It crashed')).not.toBeInTheDocument()
      expect(screen.getByText('actual behavior')).toBeInTheDocument()
      expect(row1.querySelector('.fa-chevron-down')).toBeInTheDocument()
      expect(row2.querySelector('.fa-chevron-up')).toBeInTheDocument()
    })

    it('shows a loading spinner and hides the screenshot image until it loads, then reveals it', async () => {
      const { container } = renderPage()
      await waitForLoaded()
      const row = rowFor(container, '76500000000000001')
      await fireEvent.click(row.querySelector('.tooltip') as HTMLElement)

      const img = container.querySelector('img[alt="screenshot"]') as HTMLImageElement
      expect(img).toHaveClass('hidden')
      expect(container.querySelector('.loading.loading-lg')).toBeInTheDocument()

      await fireEvent.load(img)
      expect(img).not.toHaveClass('hidden')
      expect(container.querySelector('.loading.loading-lg')).not.toBeInTheDocument()
    })

    it('re-hides the screenshot and shows the spinner again if the image errors after loading', async () => {
      const { container } = renderPage()
      await waitForLoaded()
      const row = rowFor(container, '76500000000000001')
      await fireEvent.click(row.querySelector('.tooltip') as HTMLElement)
      const img = container.querySelector('img[alt="screenshot"]') as HTMLImageElement
      await fireEvent.load(img)
      expect(img).not.toHaveClass('hidden')

      await fireEvent.error(img)
      expect(img).toHaveClass('hidden')
      expect(container.querySelector('.loading.loading-lg')).toBeInTheDocument()
    })

    it('resets the screenshot loaded state to hidden when reopening a row', async () => {
      const { container } = renderPage()
      await waitForLoaded()
      const row = rowFor(container, '76500000000000001')
      await fireEvent.click(row.querySelector('.tooltip') as HTMLElement)
      const img = container.querySelector('img[alt="screenshot"]') as HTMLImageElement
      await fireEvent.load(img)
      expect(img).not.toHaveClass('hidden')

      await fireEvent.click(row.querySelector('.tooltip') as HTMLElement) // collapse
      await fireEvent.click(row.querySelector('.tooltip') as HTMLElement) // reopen
      const reopenedImg = container.querySelector('img[alt="screenshot"]') as HTMLImageElement
      expect(reopenedImg).toHaveClass('hidden')
    })
  })
})
