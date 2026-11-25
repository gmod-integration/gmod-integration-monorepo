import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@solidjs/testing-library'
import GuildList from '../../../../src/pages/dashboard/admins/GuildList.js'
import PremiumList from '../../../../src/pages/dashboard/admins/PremiumList.js'
import ServerList from '../../../../src/pages/dashboard/admins/ServerList.js'
import UserList from '../../../../src/pages/dashboard/admins/UserList.js'
import Impersonate from '../../../../src/pages/dashboard/admins/Impersonate.js'
import { fetchAPI } from '../../../../src/utils/api.js'
import { renderWithProviders } from '../../../testUtils.js'
import { adminIdentity, response, userRow } from './accountFixtures.js'
import { guildFixture, pageFixture, serverFixture } from './adminFixtures.js'

vi.mock('../../../../src/utils/api.js', async (original) => ({ ...(await original<object>()), fetchAPI: vi.fn() }))

beforeEach(() => {
  adminIdentity()
  vi.mocked(fetchAPI).mockReset()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const directories = [
  {
    name: 'communities',
    Page: GuildList,
    row: guildFixture({ gmodstore: true }),
    sort: 'name',
    empty: 'No communities match these filters.',
  },
  {
    name: 'Premium grants',
    Page: PremiumList,
    row: guildFixture({ gmodstore: true }),
    sort: 'name',
    empty: 'No communities match these filters.',
  },
  {
    name: 'game servers',
    Page: ServerList,
    row: serverFixture({ verified: true }),
    sort: 'name',
    empty: 'No game servers match these filters.',
  },
  {
    name: 'user accounts',
    Page: UserList,
    row: { ...userRow(), steamID64: '76561198000000001' },
    sort: 'username',
    empty: 'No accounts match these filters.',
  },
  {
    name: 'support accounts',
    Page: Impersonate,
    row: userRow(),
    sort: 'username',
    empty: 'No accounts match these filters.',
  },
]
const lastQuery = () => new URL(vi.mocked(fetchAPI).mock.calls.at(-1)![0], 'http://test.local').searchParams

describe.each(directories)('$name directory controls', ({ Page, row, sort, empty }) => {
  it('sends sorting, ordering, submitted search and refresh to the server without mutations', async () => {
    vi.mocked(fetchAPI).mockImplementation(async (endpoint) => response(pageFixture(endpoint, [row], 60)))
    renderWithProviders(Page, { session: false })
    await screen.findByRole('button', { name: 'Next page' })
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Next page' })).toBeEnabled())
    await fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    await vi.waitFor(() => expect(lastQuery().get('offset')).toBe('25'))

    await fireEvent.change(screen.getByRole('combobox', { name: 'Sort by' }), { target: { value: sort } })
    await vi.waitFor(() => {
      expect(lastQuery().get('sort')).toBe(sort)
      expect(lastQuery().get('offset')).toBe('0')
    })
    await fireEvent.change(screen.getByRole('combobox', { name: 'Order' }), { target: { value: 'ASC' } })
    await vi.waitFor(() => expect(lastQuery().get('orderBy')).toBe('ASC'))

    const beforeTyping = vi.mocked(fetchAPI).mock.calls.length
    await fireEvent.input(screen.getByRole('searchbox', { name: 'Search' }), { target: { value: '  needle  ' } })
    expect(fetchAPI).toHaveBeenCalledTimes(beforeTyping)
    await fireEvent.submit(screen.getByRole('searchbox').closest('form')!)
    await vi.waitFor(() => expect(lastQuery().get('search')).toBe('needle'))
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled())
    const beforeRefresh = vi.mocked(fetchAPI).mock.calls.length
    await fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledTimes(beforeRefresh + 1))
    expect(lastQuery().get('sort')).toBe(sort)
    expect(lastQuery().get('orderBy')).toBe('ASC')
    expect(lastQuery().get('search')).toBe('needle')
    expect(vi.mocked(fetchAPI).mock.calls.every(([, method]) => method === 'GET')).toBe(true)
  })

  it('distinguishes a rejected request from an empty result and retries explicitly', async () => {
    vi.mocked(fetchAPI)
      .mockResolvedValueOnce(response({}, 503))
      .mockImplementation(async (endpoint) => response(pageFixture(endpoint, [])))
    renderWithProviders(Page, { session: false })
    await screen.findByRole('alert')
    expect(screen.queryByText(empty)).not.toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByText(empty)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(fetchAPI).toHaveBeenCalledTimes(2)
  })
})

it('adopts a server-clamped directory offset after the last page disappears', async () => {
  let total = 26
  vi.mocked(fetchAPI).mockImplementation(async (endpoint) => {
    const page = pageFixture(endpoint, [guildFixture()], total)
    if (Number(page.query.offset) > 0) {
      total = 1
      page.total = 1
      page.query.offset = 0
    }
    return response(page)
  })
  renderWithProviders(GuildList, { session: false })
  await screen.findByText('Example community')
  await fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
  await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledTimes(3))
  expect(lastQuery().get('offset')).toBe('0')
  expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()
})

it('copies a linked Steam identity from the user directory without changing the account', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  vi.mocked(fetchAPI).mockImplementation(async (endpoint) =>
    response(pageFixture(endpoint, [{ ...userRow(), steamID64: '76561198000000001' }])),
  )
  renderWithProviders(UserList, { session: false })
  await fireEvent.click(await screen.findByRole('button', { name: 'Copy SteamID64' }))
  expect(writeText).toHaveBeenCalledWith('76561198000000001')
  expect(vi.mocked(fetchAPI).mock.calls.every(([, method]) => method === 'GET')).toBe(true)
})
