import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@solidjs/testing-library'
import { renderWithProviders } from '../../../testUtils.js'
import GuildList from '../../../../src/pages/dashboard/admins/GuildList.js'
import { fetchAPI } from '../../../../src/utils/api.js'
import { failed, guildFixture, ok, pageFixture } from './adminFixtures.js'

vi.mock('../../../../src/utils/api.js', () => ({ fetchAPI: vi.fn() }))
beforeEach(() => {
  localStorage.clear()
  vi.mocked(fetchAPI).mockReset()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
const renderPage = () =>
  renderWithProviders(() => (
    <div>
      <GuildList />
    </div>
  ))

describe('administrative community directory', () => {
  it('distinguishes failure from empty data and retries the request', async () => {
    vi.mocked(fetchAPI)
      .mockResolvedValueOnce(failed() as Response)
      .mockImplementation(async (endpoint) => ok(pageFixture(endpoint, [guildFixture()])) as Response)
    renderPage()
    await screen.findByRole('alert')
    expect(screen.queryByText('No items to display.')).not.toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByText('Example community')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
  it('fetches pages from the server and resets offset on search or filters', async () => {
    const guilds = Array.from({ length: 51 }, (_, index) =>
      guildFixture({ id: `community-${index + 1}`, name: `Community ${index + 1}`, members: index + 1 }),
    ).reverse()
    vi.mocked(fetchAPI).mockImplementation(async (endpoint) => {
      const parameters = new URL(endpoint, 'http://local.test').searchParams
      const offset = Number(parameters.get('offset') || 0)
      const rows = guilds.filter((guild) =>
        guild.name.toLowerCase().includes((parameters.get('search') || '').toLowerCase()),
      )
      return ok(pageFixture(endpoint, rows.slice(offset, offset + 25), rows.length)) as Response
    })
    renderPage()
    await screen.findByText('Community 51')
    expect(screen.queryByText('Community 26')).not.toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    await screen.findByText('Community 26')
    expect(new URL(vi.mocked(fetchAPI).mock.calls.at(-1)![0], 'http://local.test').searchParams.get('offset')).toBe(
      '25',
    )
    await fireEvent.input(screen.getByRole('searchbox', { name: 'Search' }), { target: { value: 'Community 1' } })
    await fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    await screen.findByText('Community 19')
    const searched = new URL(vi.mocked(fetchAPI).mock.calls.at(-1)![0], 'http://local.test').searchParams
    expect(searched.get('offset')).toBe('0')
    expect(searched.get('search')).toBe('Community 1')
    await fireEvent.change(screen.getByRole('combobox', { name: 'Access source' }), { target: { value: 'manual' } })
    await vi.waitFor(() =>
      expect(new URL(vi.mocked(fetchAPI).mock.calls.at(-1)![0], 'http://local.test').searchParams.get('premium')).toBe(
        'manual',
      ),
    )
  })
  it('copies exact IDs and inspects unknown effective access without claiming it is disabled', async () => {
    const guild = guildFixture({ manualPremium: true })
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    vi.mocked(fetchAPI).mockImplementation(async (endpoint) => {
      if (endpoint.startsWith(`/v6/admin/guilds/${guild.id}`))
        return ok({
          guild,
          access: {
            guildID: guild.id,
            premium: false,
            customBot: false,
            state: 'unknown',
            sources: [],
            revision: 'r1',
            validUntil: '2099-01-01T00:00:00.000Z',
          },
        }) as Response
      return ok(pageFixture(endpoint, [guild])) as Response
    })
    renderPage()
    await screen.findByText('Example community')
    await fireEvent.click(screen.getByRole('button', { name: 'Copy community ID' }))
    expect(writeText).toHaveBeenCalledWith(guild.id)
    await fireEvent.click(screen.getByRole('button', { name: 'Inspect' }))
    const dialog = screen.getByRole('dialog', { name: 'Community details' })
    await within(dialog).findByText('Access verification unavailable')
    expect(within(dialog).getAllByText('Unknown')).toHaveLength(2)
    expect(within(dialog).queryByText('Disabled')).not.toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: 'View this community’s servers' })).toHaveAttribute(
      'href',
      `/dashboard/admins/servers?guildID=${guild.id}`,
    )
  })
})
