import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@solidjs/testing-library'
import { ErrorBoundary } from 'solid-js/web'
import { historyAt, renderWithProviders } from '../../../../../testUtils.js'
import { okJson } from '../testHelpers.js'

vi.mock('../../../../../../src/utils/api.js', () => ({
  fetchAPI: vi.fn(),
  getAPIUrl: vi.fn(),
  getUrlWithActualParams: vi.fn((s: string) => s),
}))

const { fetchAPI } = await import('../../../../../../src/utils/api.js')
const { default: ServerErrors } = await import(
  '../../../../../../src/pages/dashboard/guilds/servers/errors/ServerErrors.js'
)

const ERRORS_URL_PREFIX = '/users/:discordID/guilds/:guildID/servers/:serverID/errors?'

function errorEntry(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    serverID: 's1',
    count: 3,
    realm: 'server',
    error: 'attempt to call a nil value',
    stack: JSON.stringify(['lua:1', 'lua:2']),
    name: 'my_addon',
    steamID64: '765000000',
    workshopID: '123456',
    uptime: 1000,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function errorsPage(errors: unknown[], total = errors.length) {
  return {
    errors,
    query: { limit: 25, offset: 0, sort: 'createdAt', orderBy: 'DESC', total },
  }
}

function renderPage() {
  return renderWithProviders(() => <ServerErrors />, {
    path: '/dashboard/guilds/:guildID/config/servers/:serverID/errors',
    history: historyAt('/dashboard/guilds/g1/config/servers/s1/errors'),
  })
}

afterEach(() => cleanup())

describe('pages/dashboard/guilds/servers/errors/ServerErrors.tsx', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: true }))
    ;(fetchAPI as Mock).mockReset()
  })

  it('renders the panel title and description', async () => {
    ;(fetchAPI as Mock).mockResolvedValue(okJson(errorsPage([])))
    renderPage()
    expect(screen.getByText('Errors')).toBeInTheDocument()
    expect(screen.getByText('Watch the errors of your server.')).toBeInTheDocument()
  })

  it('fetches with the correct query string on mount', async () => {
    ;(fetchAPI as Mock).mockResolvedValue(okJson(errorsPage([])))
    renderPage()
    await vi.waitFor(() =>
      expect(fetchAPI).toHaveBeenCalledWith(
        `${ERRORS_URL_PREFIX}offset=0&limit=25&sort=createdAt&orderBy=DESC`,
        'GET',
      ),
    )
  })

  it('shows a loading indicator before the first fetch resolves', () => {
    ;(fetchAPI as Mock).mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.getByText('Loading errors...')).toBeInTheDocument()
  })

  it('renders a fetched error row', async () => {
    ;(fetchAPI as Mock).mockResolvedValue(okJson(errorsPage([errorEntry()])))
    renderPage()
    await vi.waitFor(() => expect(screen.getByText('my_addon')).toBeInTheDocument())
    expect(screen.getByText('server')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('attempt to call a nil value')).toBeInTheDocument()
  })

  it('colors the realm text for the client realm', async () => {
    ;(fetchAPI as Mock).mockResolvedValue(okJson(errorsPage([errorEntry({ realm: 'client' })])))
    renderPage()
    await vi.waitFor(() => expect(screen.getByText('client')).toHaveClass('text-sky-500'))
  })

  it('colors the realm text for the server realm', async () => {
    ;(fetchAPI as Mock).mockResolvedValue(okJson(errorsPage([errorEntry({ realm: 'server' })])))
    renderPage()
    await vi.waitFor(() => expect(screen.getByText('server')).toHaveClass('text-yellow-500'))
  })

  it('throws to the app-level ErrorBoundary when the fetch response is not ok', async () => {
    ;(fetchAPI as Mock).mockResolvedValue({ ok: false, json: async () => ({}) })
    renderWithProviders(
      () => (
        <ErrorBoundary fallback={(err) => <div data-testid="boundary-error">{err.message}</div>}>
          <ServerErrors />
        </ErrorBoundary>
      ),
      {
        path: '/dashboard/guilds/:guildID/config/servers/:serverID/errors',
        history: historyAt('/dashboard/guilds/g1/config/servers/s1/errors'),
      },
    )
    await vi.waitFor(() => expect(screen.getByTestId('boundary-error')).toHaveTextContent('Failed to fetch errors'))
  })

  describe('non-premium truncation', () => {
    it('truncates the errors list and total to 50 for non-premium users when the server reports more', async () => {
      window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: false }))
      const errors = Array.from({ length: 60 }, (_, i) => errorEntry({ name: `addon${i}` }))
      ;(fetchAPI as Mock).mockResolvedValue(okJson(errorsPage(errors, 80)))
      renderPage()
      await vi.waitFor(() => expect(screen.getByText('addon0')).toBeInTheDocument())
      // total pages = ceil(50/25) = 2
      expect(screen.getByText('1 / 2')).toBeInTheDocument()
    })

    it('does not truncate for premium users even when the server reports more than 50', async () => {
      window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: true }))
      const errors = Array.from({ length: 60 }, (_, i) => errorEntry({ name: `addon${i}` }))
      ;(fetchAPI as Mock).mockResolvedValue(okJson(errorsPage(errors, 80)))
      renderPage()
      await vi.waitFor(() => expect(screen.getByText('addon0')).toBeInTheDocument())
      // total pages = ceil(80/25) = 4
      expect(screen.getByText('1 / 4')).toBeInTheDocument()
    })

    it('does not truncate for non-premium users when the total is already 50 or below', async () => {
      window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: false }))
      const errors = [errorEntry()]
      ;(fetchAPI as Mock).mockResolvedValue(okJson(errorsPage(errors, 10)))
      renderPage()
      await vi.waitFor(() => expect(screen.getByText('my_addon')).toBeInTheDocument())
      expect(screen.getByText('1 / 1')).toBeInTheDocument()
    })
  })

  describe('row expansion / details', () => {
    it('expands a row to show the JSON details on click, and collapses again on second click', async () => {
      ;(fetchAPI as Mock).mockResolvedValue(okJson(errorsPage([errorEntry()])))
      const { container } = renderPage()
      await vi.waitFor(() => expect(screen.getByText('my_addon')).toBeInTheDocument())
      expect(container.querySelector('.hljs')).not.toBeInTheDocument()

      const expandTrigger = container.querySelector('.fa-chevron-down')!.closest('.tooltip') as HTMLElement
      await fireEvent.click(expandTrigger)
      expect(container.querySelector('.hljs')).toBeInTheDocument()
      expect(container.querySelector('.fa-chevron-up')).toBeInTheDocument()

      await fireEvent.click(container.querySelector('.fa-chevron-up')!.closest('.tooltip') as HTMLElement)
      expect(container.querySelector('.hljs')).not.toBeInTheDocument()
    })

    it('collapses the previously expanded row when a different row is expanded', async () => {
      ;(fetchAPI as Mock).mockResolvedValue(
        okJson(errorsPage([errorEntry({ name: 'first' }), errorEntry({ name: 'second' })])),
      )
      const { container } = renderPage()
      await vi.waitFor(() => expect(screen.getByText('first')).toBeInTheDocument())

      // Note: ServerErrors.tsx wraps <JsonViewer> in its own `<pre class="hljs p-4">`, and
      // JsonViewer renders that same wrapper internally too, so each expanded row actually
      // contributes 2 nested `.hljs` elements, not 1 - pre-existing redundant (but harmless)
      // markup, not something breaking behavior, so asserting on the real count of 2 here.
      const triggers = container.querySelectorAll('.fa-chevron-down')
      await fireEvent.click(triggers[0].closest('.tooltip') as HTMLElement)
      expect(container.querySelectorAll('.hljs')).toHaveLength(2)
      expect(screen.getByText('first').closest('tr')?.nextElementSibling?.textContent).toContain('"first"')

      const secondTrigger = container.querySelectorAll('.fa-chevron-down')[0]
      await fireEvent.click(secondTrigger.closest('.tooltip') as HTMLElement)
      expect(container.querySelectorAll('.hljs')).toHaveLength(2)
      expect(screen.getByText('second').closest('tr')?.nextElementSibling?.textContent).toContain('"second"')
    })
  })

  describe('row actions', () => {
    it('shows the workshop link when workshopID is set and not "0"', async () => {
      ;(fetchAPI as Mock).mockResolvedValue(okJson(errorsPage([errorEntry({ workshopID: '999' })])))
      const { container } = renderPage()
      await vi.waitFor(() => expect(screen.getByText('my_addon')).toBeInTheDocument())
      const link = container.querySelector('a[href*="steamcommunity.com"]') as HTMLAnchorElement
      expect(link).toBeInTheDocument()
      expect(link.href).toContain('999')
    })

    it('hides the workshop link when workshopID is empty', async () => {
      ;(fetchAPI as Mock).mockResolvedValue(okJson(errorsPage([errorEntry({ workshopID: '' })])))
      const { container } = renderPage()
      await vi.waitFor(() => expect(screen.getByText('my_addon')).toBeInTheDocument())
      expect(container.querySelector('a[href*="steamcommunity.com"]')).not.toBeInTheDocument()
    })

    it('hides the workshop link when workshopID is "0"', async () => {
      ;(fetchAPI as Mock).mockResolvedValue(okJson(errorsPage([errorEntry({ workshopID: '0' })])))
      const { container } = renderPage()
      await vi.waitFor(() => expect(screen.getByText('my_addon')).toBeInTheDocument())
      expect(container.querySelector('a[href*="steamcommunity.com"]')).not.toBeInTheDocument()
    })

    it('falls back to an empty stack array when the stack field is an empty string', async () => {
      ;(fetchAPI as Mock).mockResolvedValue(okJson(errorsPage([errorEntry({ stack: '' })])))
      const { container } = renderPage()
      await vi.waitFor(() => expect(screen.getByText('my_addon')).toBeInTheDocument())
      const expandTrigger = container.querySelector('.fa-chevron-down')!.closest('.tooltip') as HTMLElement
      await fireEvent.click(expandTrigger)
      expect(container.querySelector('.hljs')).toBeInTheDocument()
    })

    it('renders a download link with a data URI containing the error JSON', async () => {
      ;(fetchAPI as Mock).mockResolvedValue(okJson(errorsPage([errorEntry()])))
      const { container } = renderPage()
      await vi.waitFor(() => expect(screen.getByText('my_addon')).toBeInTheDocument())
      const downloadLink = container.querySelector('a[download]') as HTMLAnchorElement
      expect(downloadLink).toBeInTheDocument()
      expect(downloadLink.getAttribute('href')).toContain('data:text/plain;charset=utf-8,')
      expect(downloadLink.getAttribute('download')).toContain('log-')
    })
  })

  describe('pagination', () => {
    it('refetches with the new offset when paginating to the next page', async () => {
      const errors = Array.from({ length: 25 }, (_, i) => errorEntry({ name: `addon${i}` }))
      ;(fetchAPI as Mock).mockResolvedValue(okJson(errorsPage(errors, 60)))
      const { container } = renderPage()
      await vi.waitFor(() => expect(screen.getByText('addon0')).toBeInTheDocument())
      const nextBtn = container.querySelector('.fa-chevron-right')!.closest('button')!
      await fireEvent.click(nextBtn)
      await vi.waitFor(() =>
        expect(fetchAPI).toHaveBeenCalledWith(
          `${ERRORS_URL_PREFIX}offset=25&limit=25&sort=createdAt&orderBy=DESC`,
          'GET',
        ),
      )
    })
  })
})
