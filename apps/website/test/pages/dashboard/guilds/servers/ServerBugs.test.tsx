import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@solidjs/testing-library'
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
    expect(screen.getByText('Bug reports')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Read reports submitted by players. Expand a report to see what happened, the expected result and steps to reproduce it.',
      ),
    ).toBeInTheDocument()
  })

  it('shows a loading indicator while bugsReport is loading', () => {
    ;(fetchAPI as Mock).mockImplementation(() => new Promise(() => {}))
    const { container } = renderPage()
    expect(container.querySelector('.loading')).toBeInTheDocument()
    expect(screen.queryByText('76500000000000001')).not.toBeInTheDocument()
  })

  it('shows an inline recoverable error instead of treating a failed GET as an empty list', async () => {
    ;(fetchAPI as Mock).mockResolvedValueOnce(errJson())
    const { container } = renderPage()
    await vi.waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(container.querySelector('tbody > tr > td [role="alert"]')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitForLoaded()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('sorts bug rows by createdAt descending (most recent first)', async () => {
    const { container } = renderPage()
    await waitForLoaded()
    const rows = container.querySelectorAll('tbody tr')
    expect(rows[0]).toHaveTextContent('76500000000000002') // 2024-01-05, most recent
    expect(rows[1]).toHaveTextContent('76500000000000001') // 2024-01-01
  })

  it('counts reports rather than expanded rows and preserves the selected report across pages', async () => {
    const reports = Array.from({ length: 26 }, (_, index) => ({
      ...defaultBugs()[0],
      id: index + 1,
      steamID64: `player-${index + 1}`,
      description: `Bug number ${index + 1}`,
      actual: `Actual result ${index + 1}`,
      createdAt: new Date(Date.UTC(2024, 0, 1, 0, index)).toISOString(),
    }))
    setupFetchAPI(reports)
    const { container } = renderPage()
    await vi.waitFor(() => expect(screen.getByText('player-26')).toBeInTheDocument())
    const newest = rowFor(container, 'player-26')
    await fireEvent.click(within(newest).getByRole('button', { name: 'Show More' }))
    expect(screen.getByText('Actual result 26')).toBeInTheDocument()
    expect(container.querySelectorAll('tbody tr')).toHaveLength(26)
    const pagination = screen.getByRole('navigation', { name: 'Pagination' })
    expect(pagination.closest('table')).toBeNull()
    expect(within(pagination).getByRole('button', { name: 'Page 1 of 2' })).toBeInTheDocument()
    await fireEvent.click(within(pagination).getByRole('button', { name: 'Next page' }))
    expect(screen.getByText('player-1')).toBeInTheDocument()
    expect(screen.queryByText('Actual result 26')).not.toBeInTheDocument()
    expect(screen.queryByText('Actual result 1')).not.toBeInTheDocument()
    expect(container.querySelectorAll('tbody tr')).toHaveLength(1)
    await fireEvent.click(within(pagination).getByRole('button', { name: 'Previous page' }))
    expect(screen.getByText('Actual result 26')).toBeInTheDocument()
  })

  it('renders each row with formatted date, steam id and importance', async () => {
    const { container } = renderPage()
    await waitForLoaded()
    const row = rowFor(container, '76500000000000001')
    const cells = row.querySelectorAll('td')
    expect(cells[0].querySelector('time')).toHaveAttribute('datetime', '2024-01-01T10:00:00.000Z')
    expect(cells[1]).toHaveTextContent('76500000000000001')
    expect(cells[2]).toHaveTextContent('High')
  })

  it('shows localized severity badges and keeps unsupported importance values explicitly unknown', async () => {
    const levels = [
      ['critical', 'Critical', 'danger', 'circle-alert'],
      ['high', 'High', 'warning', 'triangle-alert'],
      ['medium', 'Medium', 'info', 'info'],
      ['low', 'Low', 'neutral', 'info'],
      ['trivial', 'Minor', 'neutral', 'info'],
      ['unexpected', 'Unknown', 'neutral', 'circle-help'],
    ] as const
    setupFetchAPI(
      levels.map(([importance], index) => ({
        ...defaultBugs()[0],
        id: index + 1,
        steamID64: `importance-${importance}`,
        importance,
      })),
    )
    renderPage()
    await vi.waitFor(() => expect(screen.getByText('importance-critical')).toBeInTheDocument())
    for (const [importance, label, tone, icon] of levels) {
      const row = screen.getByText(`importance-${importance}`).closest<HTMLElement>('tr')!
      const badge = within(row).getByText(label).closest('[data-tone]')!
      expect(badge).toHaveAttribute('data-tone', tone)
      expect(badge.querySelector(`svg[data-icon="${icon}"]`)).toBeInTheDocument()
    }
    expect(screen.queryByText('unexpected', { exact: true })).not.toBeInTheDocument()
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
      expect(row.querySelector('svg[data-icon="chevron-down"]')).toBeInTheDocument()

      await fireEvent.click(row.querySelector('.tooltip') as HTMLElement)

      expect(row.querySelector('svg[data-icon="chevron-up"]')).toBeInTheDocument()
      expect(screen.getByText('Screenshot')).toBeInTheDocument()
      expect(screen.getByText('It should not crash')).toBeInTheDocument()
      expect(screen.getByText('It crashed')).toBeInTheDocument()
      expect(screen.getByText('step 1, step 2')).toBeInTheDocument()
      // full (untruncated) description is shown in the detail panel
      expect(screen.getByText('Short bug description', { selector: 'p' })).toBeInTheDocument()
      const img = container.querySelector('img[alt="Screenshot attached to the bug report"]') as HTMLImageElement
      expect(img).toHaveAttribute('src', 'https://api.example.com/v3/screenshots/shot1.png')
    })

    it('collapses the details row when clicking the same row again', async () => {
      const { container } = renderPage()
      await waitForLoaded()
      const row = rowFor(container, '76500000000000001')
      await fireEvent.click(row.querySelector('.tooltip') as HTMLElement)
      expect(screen.getByText('Screenshot')).toBeInTheDocument()

      await fireEvent.click(row.querySelector('.tooltip') as HTMLElement)
      expect(row.querySelector('svg[data-icon="chevron-down"]')).toBeInTheDocument()
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
      expect(row1.querySelector('svg[data-icon="chevron-down"]')).toBeInTheDocument()
      expect(row2.querySelector('svg[data-icon="chevron-up"]')).toBeInTheDocument()
    })

    it('shows a loading spinner and hides the screenshot image until it loads, then reveals it', async () => {
      const { container } = renderPage()
      await waitForLoaded()
      const row = rowFor(container, '76500000000000001')
      await fireEvent.click(row.querySelector('.tooltip') as HTMLElement)

      const img = container.querySelector('img[alt="Screenshot attached to the bug report"]') as HTMLImageElement
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
      const img = container.querySelector('img[alt="Screenshot attached to the bug report"]') as HTMLImageElement
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
      const img = container.querySelector('img[alt="Screenshot attached to the bug report"]') as HTMLImageElement
      await fireEvent.load(img)
      expect(img).not.toHaveClass('hidden')

      await fireEvent.click(row.querySelector('.tooltip') as HTMLElement) // collapse
      await fireEvent.click(row.querySelector('.tooltip') as HTMLElement) // reopen
      const reopenedImg = container.querySelector(
        'img[alt="Screenshot attached to the bug report"]',
      ) as HTMLImageElement
      expect(reopenedImg).toHaveClass('hidden')
    })
  })
})
