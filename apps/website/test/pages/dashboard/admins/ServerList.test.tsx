import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@solidjs/testing-library'
import { historyAt, renderWithProviders } from '../../../testUtils.js'
import ServerList from '../../../../src/pages/dashboard/admins/ServerList.js'
import { fetchAPI } from '../../../../src/utils/api.js'
import { failed, ok, pageFixture, serverFixture } from './adminFixtures.js'

vi.mock('../../../../src/utils/api.js', () => ({ fetchAPI: vi.fn() }))
beforeEach(() => {
  localStorage.clear()
  vi.mocked(fetchAPI).mockReset()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
const renderPage = (path = '/dashboard/admins/servers') =>
  renderWithProviders(
    () => (
      <div>
        <ServerList />
      </div>
    ),
    { path: '*', history: historyAt(path) },
  )
const mutations = () => vi.mocked(fetchAPI).mock.calls.filter(([, method]) => method !== 'GET')

function listRequests(server = serverFixture()) {
  vi.mocked(fetchAPI).mockImplementation(async (endpoint) => ok(pageFixture(endpoint, [server])) as Response)
}
async function editDialog() {
  await screen.findByText('Example server')
  await fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
  return screen.getByRole('dialog', { name: 'Edit game server' })
}

describe('administrative game server management', () => {
  it('combines community, verification and visibility filters and follows a changed community URL', async () => {
    listRequests(serverFixture({ verified: true }))
    const history = historyAt('/dashboard/admins/servers')
    renderWithProviders(ServerList, { path: '*', history })
    await screen.findByText('Example server')
    await fireEvent.input(screen.getByRole('textbox', { name: 'Community ID' }), { target: { value: 'target-guild' } })
    await fireEvent.submit(screen.getByRole('searchbox').closest('form')!)
    await fireEvent.change(screen.getByRole('combobox', { name: 'Verification' }), { target: { value: 'verified' } })
    await fireEvent.change(screen.getByRole('combobox', { name: 'Visibility' }), { target: { value: 'public' } })
    await vi.waitFor(() => {
      const query = new URL(vi.mocked(fetchAPI).mock.calls.at(-1)![0], 'http://test.local').searchParams
      expect(query.get('guildID')).toBe('target-guild')
      expect(query.get('verified')).toBe('verified')
      expect(query.get('visibility')).toBe('public')
    })
    history.set({ value: '/dashboard/admins/servers?guildID=other-community', replace: false })
    await vi.waitFor(() => expect(screen.getByRole('textbox', { name: 'Community ID' })).toHaveValue('other-community'))
    expect(fetchAPI).toHaveBeenLastCalledWith(expect.stringContaining('guildID=other-community'), 'GET')
    expect(mutations()).toHaveLength(0)
  })

  it('includes a changed public visibility flag in the confirmed atomic server edit', async () => {
    const server = serverFixture()
    vi.mocked(fetchAPI).mockImplementation(async (endpoint, method) =>
      method === 'PATCH'
        ? (ok({ ...server, isPublic: true }) as Response)
        : (ok(pageFixture(endpoint, [server])) as Response),
    )
    renderPage()
    const dialog = await editDialog()
    await fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Public server directory' }))
    await fireEvent.input(within(dialog).getByRole('textbox', { name: 'Reason for this action' }), {
      target: { value: 'Publish the community server' },
    })
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await screen.findByText('Server changes saved.')
    expect(mutations()[0]).toEqual([
      '/v6/admin/servers/server-1',
      'PATCH',
      { isPublic: true, reason: 'Publish the community server' },
    ])
  })

  it('keeps community filters in server pagination and displays unknown activity accurately', async () => {
    const server = serverFixture({ recentlyActive: null, addonVersion: null, lastSeenAt: null })
    vi.mocked(fetchAPI).mockImplementation(async (endpoint) => ok(pageFixture(endpoint, [server], 60)) as Response)
    renderPage('/dashboard/admins/servers?guildID=1051881514020917408')
    await screen.findByText('Example server')
    expect(screen.getByText('Unknown')).toBeInTheDocument()
    expect(screen.queryByText('No recent activity')).not.toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    await vi.waitFor(() => {
      const parameters = new URL(vi.mocked(fetchAPI).mock.calls.at(-1)![0], 'http://local.test').searchParams
      expect(parameters.get('offset')).toBe('25')
      expect(parameters.get('guildID')).toBe('1051881514020917408')
    })
  })
  it('changes only a local draft and discards the entire modal on cancel', async () => {
    listRequests()
    renderPage()
    const dialog = await editDialog()
    await fireEvent.input(within(dialog).getByRole('textbox', { name: 'Server name' }), {
      target: { value: 'Unsaved name' },
    })
    await fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Verified' }))
    expect(mutations()).toHaveLength(0)
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    const reopened = await editDialog()
    expect(within(reopened).getByRole('textbox', { name: 'Server name' })).toHaveValue('Example server')
    expect(within(reopened).getByRole('checkbox', { name: 'Verified' })).not.toBeChecked()
    expect(mutations()).toHaveLength(0)
  })
  it('preserves a failed edit, blocks pending dismissal and retries one atomic update', async () => {
    let server = serverFixture()
    let resolveFirst!: (response: Response) => void
    let changes = 0
    vi.mocked(fetchAPI).mockImplementation(async (endpoint, method, body) => {
      if (method === 'PATCH') {
        changes++
        if (changes === 1)
          return new Promise<Response>((resolve) => {
            resolveFirst = resolve
          })
        server = { ...server, name: (body as { name: string }).name }
        return ok(server) as Response
      }
      return ok(pageFixture(endpoint, [server])) as Response
    })
    renderPage()
    const dialog = await editDialog()
    const name = within(dialog).getByRole('textbox', { name: 'Server name' })
    await fireEvent.input(name, { target: { value: 'Renamed server' } })
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled()
    await fireEvent.input(within(dialog).getByRole('textbox', { name: 'Reason for this action' }), {
      target: { value: 'Correct the registered name' },
    })
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeDisabled()
    const cancel = new Event('cancel', { cancelable: true })
    dialog.dispatchEvent(cancel)
    expect(cancel.defaultPrevented).toBe(true)
    resolveFirst(failed() as Response)
    await within(dialog).findByRole('alert')
    expect(name).toHaveValue('Renamed server')
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await screen.findByText('Server changes saved.')
    expect(mutations()).toHaveLength(2)
    expect(mutations()[1]).toEqual([
      '/v6/admin/servers/server-1',
      'PATCH',
      { name: 'Renamed server', reason: 'Correct the registered name' },
    ])
    expect(dialog).not.toHaveAttribute('open')
  })
  it.each([
    ['malformed', { success: true }],
    ['another server', serverFixture({ id: 'other-server', name: 'Changed name' })],
    ['another community', serverFixture({ guildID: 'other-community', name: 'Changed name' })],
  ])('preserves the draft when a successful HTTP response acknowledges %s', async (_, acknowledgement) => {
    vi.mocked(fetchAPI).mockImplementation(async (endpoint, method) =>
      method === 'PATCH'
        ? (ok(acknowledgement) as Response)
        : (ok(pageFixture(endpoint, [serverFixture()])) as Response),
    )
    renderPage()
    const dialog = await editDialog()
    await fireEvent.input(within(dialog).getByRole('textbox', { name: 'Server name' }), {
      target: { value: 'Changed name' },
    })
    await fireEvent.input(within(dialog).getByRole('textbox', { name: 'Reason for this action' }), {
      target: { value: 'Correct server details' },
    })
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await within(dialog).findByRole('alert')
    expect(dialog).toHaveAttribute('open')
    expect(within(dialog).getByRole('textbox', { name: 'Server name' })).toHaveValue('Changed name')
    expect(within(dialog).getByRole('textbox', { name: 'Reason for this action' })).toHaveValue(
      'Correct server details',
    )
    expect(screen.queryByText('Server changes saved.')).not.toBeInTheDocument()
    expect(mutations()).toHaveLength(1)
  })
  it('requires the exact server ID and a reason before resetting a token', async () => {
    vi.mocked(fetchAPI).mockImplementation(async (endpoint, method) =>
      method === 'POST'
        ? (ok({ reset: true }) as Response)
        : (ok(pageFixture(endpoint, [serverFixture()])) as Response),
    )
    renderPage()
    await screen.findByText('Example server')
    await fireEvent.click(screen.getByRole('button', { name: 'Reset token' }))
    const dialog = screen.getByRole('dialog', { name: 'Reset the token for Example server?' })
    const confirm = within(dialog).getByRole('button', { name: 'Reset token' })
    expect(confirm).toBeDisabled()
    await fireEvent.input(within(dialog).getByRole('textbox', { name: 'Type the server ID to confirm' }), {
      target: { value: 'wrong' },
    })
    await fireEvent.input(within(dialog).getByRole('textbox', { name: 'Reason for this action' }), {
      target: { value: 'Requested credential rotation' },
    })
    expect(confirm).toBeDisabled()
    await fireEvent.input(within(dialog).getByRole('textbox', { name: 'Type the server ID to confirm' }), {
      target: { value: 'server-1' },
    })
    await fireEvent.click(confirm)
    await screen.findByText('Server token reset. Update the addon connection from the community dashboard.')
    expect(mutations()[0]).toEqual([
      '/v6/admin/servers/server-1/reset-token',
      'POST',
      { confirm: 'server-1', reason: 'Requested credential rotation' },
    ])
  })
  it.each([
    ['reset-token', { deleted: true }],
    ['delete', { reset: true }],
    ['reset-token', { reset: true, token: 'unexpected-private-token' }],
  ] as const)('keeps the %s confirmation open when its acknowledgement is invalid', async (kind, acknowledgement) => {
    vi.mocked(fetchAPI).mockImplementation(async (endpoint, method) =>
      method !== 'GET' ? (ok(acknowledgement) as Response) : (ok(pageFixture(endpoint, [serverFixture()])) as Response),
    )
    const { container } = renderPage()
    await screen.findByText('Example server')
    await fireEvent.click(screen.getByRole('button', { name: kind === 'delete' ? 'Delete' : 'Reset token' }))
    const dialog = screen.getByRole('dialog', {
      name: kind === 'delete' ? 'Delete Example server?' : 'Reset the token for Example server?',
    })
    await fireEvent.input(within(dialog).getByRole('textbox', { name: 'Type the server ID to confirm' }), {
      target: { value: 'server-1' },
    })
    await fireEvent.input(within(dialog).getByRole('textbox', { name: 'Reason for this action' }), {
      target: { value: 'Requested maintenance action' },
    })
    await fireEvent.click(
      within(dialog).getByRole('button', { name: kind === 'delete' ? 'Delete server' : 'Reset token' }),
    )
    await within(dialog).findByRole('alert')
    expect(dialog).toHaveAttribute('open')
    expect(within(dialog).getByRole('textbox', { name: 'Type the server ID to confirm' })).toHaveValue('server-1')
    expect(within(dialog).getByRole('textbox', { name: 'Reason for this action' })).toHaveValue(
      'Requested maintenance action',
    )
    expect(screen.queryByText('Server deleted.')).not.toBeInTheDocument()
    expect(
      screen.queryByText('Server token reset. Update the addon connection from the community dashboard.'),
    ).not.toBeInTheDocument()
    expect(container.innerHTML).not.toContain('unexpected-private-token')
    expect(mutations()).toHaveLength(1)
  })
  it('keeps a rejected deletion open and permits an explicit retry', async () => {
    let attempts = 0
    vi.mocked(fetchAPI).mockImplementation(async (endpoint, method) => {
      if (method === 'DELETE') return (++attempts === 1 ? failed() : ok({ deleted: true })) as Response
      return ok(pageFixture(endpoint, attempts > 1 ? [] : [serverFixture()])) as Response
    })
    renderPage()
    await screen.findByText('Example server')
    await fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete Example server?' })
    await fireEvent.input(within(dialog).getByRole('textbox', { name: 'Type the server ID to confirm' }), {
      target: { value: 'server-1' },
    })
    await fireEvent.input(within(dialog).getByRole('textbox', { name: 'Reason for this action' }), {
      target: { value: 'Retired server registration' },
    })
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Delete server' }))
    await within(dialog).findByRole('alert')
    expect(dialog).toHaveAttribute('open')
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Delete server' }))
    await screen.findByText('Server deleted.')
    expect(mutations()).toHaveLength(2)
    expect(dialog).not.toHaveAttribute('open')
  })
})
