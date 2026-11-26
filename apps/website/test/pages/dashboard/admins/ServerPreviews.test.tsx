import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@solidjs/testing-library'
import { historyAt, renderWithProviders } from '../../../testUtils.js'
import ServerPreviews from '../../../../src/pages/dashboard/admins/ServerPreviews.js'
import { fetchAPI } from '../../../../src/utils/api.js'
import { ok, failed } from './adminFixtures.js'
vi.mock('../../../../src/utils/api.js', () => ({ fetchAPI: vi.fn() }))
const status = {
  bot: { name: 'Example bot', avatarUrl: null },
  online: false,
  embeds: [
    { title: 'Example server', color: 12345, fields: [], timestamp: '2026-11-22T12:00:00.000Z', imageUrl: null },
  ],
  buttonRows: [],
}
const details = {
  server: { id: 's1', name: 'Example server', guildID: 'g1' },
  screenshots: [
    {
      id: 1,
      title: 'Example capture',
      url: 'https://api.example.test/screenshots/capture.png',
      createdAt: '2026-11-22T12:00:00.000Z',
    },
  ],
  generatedAt: '2026-11-22T12:00:00.000Z',
}
beforeEach(() => {
  localStorage.clear()
  vi.mocked(fetchAPI)
    .mockReset()
    .mockImplementation(async (endpoint) => ok(endpoint.includes('status-preview') ? status : details) as Response)
})
afterEach(cleanup)
const render = (path = '/dashboard/admins/previews?serverID=s1') =>
  renderWithProviders(ServerPreviews, { path: '*', history: historyAt(path) })
describe('read-only server previews', () => {
  it.each(['Server previews', 'Recent screenshots'])(
    'retries failed capture data from %s and preserves status independently',
    async (panelName) => {
      let fail = true
      vi.mocked(fetchAPI).mockImplementation(async (endpoint) =>
        endpoint.includes('status-preview')
          ? (ok(status) as Response)
          : fail
            ? (failed() as Response)
            : (ok({ ...details, screenshots: [] }) as Response),
      )
      render()
      const panel = screen.getByRole('region', { name: panelName })
      await within(panel).findByRole('alert')
      await screen.findByText('Example bot')
      fail = false
      await fireEvent.click(within(panel).getByRole('button', { name: 'Try again' }))
      await screen.findByText('No supported screenshots in the latest capture records.')
      const statusPanel = screen.getByRole('region', { name: 'Saved status message' })
      await fireEvent.click(within(statusPanel).getByRole('button', { name: 'Refresh' }))
      await vi.waitFor(() =>
        expect(vi.mocked(fetchAPI).mock.calls.filter(([path]) => path.includes('status-preview'))).toHaveLength(2),
      )
      expect(vi.mocked(fetchAPI).mock.calls.every(([, method]) => method === 'GET')).toBe(true)
    },
  )

  it('renders saved status, recent captures and a safe local message without any mutation', async () => {
    const { container } = render()
    await screen.findByRole('img', { name: 'Example capture' })
    expect(screen.getByText('Read-only preview. No Discord message is sent or changed.')).toBeInTheDocument()
    await fireEvent.input(screen.getByRole('textbox', { name: 'Example message' }), {
      target: { value: '**Hello** <script>untrusted</script>' },
    })
    const sandbox = screen.getByRole('region', { name: 'Example Discord message' })
    expect(within(sandbox).getByText('Hello')).toHaveProperty('tagName', 'STRONG')
    expect(sandbox).toHaveTextContent('<script>untrusted</script>')
    expect(container.querySelector('script')).toBeNull()
    expect(vi.mocked(fetchAPI).mock.calls.every(([, method]) => method === 'GET')).toBe(true)
    expect(container.textContent).not.toContain('Save to update')
  })
  it('keeps captures visible if local status data fails, then retries that preview', async () => {
    let fail = true
    vi.mocked(fetchAPI).mockImplementation(async (endpoint) =>
      endpoint.includes('status-preview') && fail
        ? (failed() as Response)
        : (ok(endpoint.includes('status-preview') ? status : details) as Response),
    )
    render()
    const panel = screen.getByRole('region', { name: 'Saved status message' })
    await within(panel).findByRole('alert')
    expect(screen.getByRole('img', { name: 'Example capture' })).toBeInTheDocument()
    fail = false
    await fireEvent.click(within(panel).getByRole('button', { name: 'Try again' }))
    await within(panel).findByText('Example bot')
    expect(vi.mocked(fetchAPI).mock.calls.filter(([path]) => path.endsWith('/previews'))).toHaveLength(1)
  })
  it('does not fetch before choosing a valid registered server ID', async () => {
    render('/dashboard/admins/previews')
    expect(fetchAPI).not.toHaveBeenCalled()
    const load = screen.getByRole('button', { name: 'Load previews' })
    expect(load).toBeDisabled()
    await fireEvent.input(screen.getByRole('textbox', { name: 'Server ID' }), { target: { value: '../s1' } })
    expect(load).toBeDisabled()
    await fireEvent.input(screen.getByRole('textbox', { name: 'Server ID' }), { target: { value: 's1' } })
    await fireEvent.click(load)
    await screen.findByRole('img', { name: 'Example capture' })
  })
})
