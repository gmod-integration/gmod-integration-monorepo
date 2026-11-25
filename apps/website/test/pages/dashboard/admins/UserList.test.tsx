import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@solidjs/testing-library'
import { renderWithProviders } from '../../../testUtils.js'
import { fetchAPI } from '../../../../src/utils/api.js'
import UserList from '../../../../src/pages/dashboard/admins/UserList.js'
import { adminIdentity, mockDirectory, response, userRow } from './accountFixtures.js'

vi.mock('../../../../src/utils/api.js', async (original) => ({ ...(await original<object>()), fetchAPI: vi.fn() }))
beforeEach(() => {
  adminIdentity()
  vi.mocked(fetchAPI).mockReset()
  mockDirectory()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
const renderPage = () =>
  renderWithProviders(
    () => (
      <div>
        <UserList />
      </div>
    ),
    { session: false },
  )
const mutations = () => vi.mocked(fetchAPI).mock.calls.filter(([, method]) => method !== 'GET')

describe('administrative user directory', () => {
  it('uses server pages and submitted search while preserving exact Discord IDs', async () => {
    mockDirectory(
      Array.from({ length: 26 }, (_, index) =>
        userRow(`1234567890123456${String(index).padStart(2, '0')}`, `Account ${index + 1}`),
      ),
    )
    renderPage()
    await screen.findByText('@Account 1')
    expect(screen.queryByText('@Account 26')).not.toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    await screen.findByText('@Account 26')
    expect(fetchAPI).toHaveBeenLastCalledWith(expect.stringContaining('offset=25'), 'GET')
    await fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'Account 2' } })
    await fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    await vi.waitFor(() =>
      expect(fetchAPI).toHaveBeenLastCalledWith(expect.stringMatching(/offset=0.*search=Account\+2/), 'GET'),
    )
    expect(mutations()).toHaveLength(0)
  })

  it('shows effective roles as read-only and protects the current account', async () => {
    mockDirectory([{ ...userRow('u1', 'Self'), rank: 'developer' }, userRow()])
    renderPage()
    const self = (await screen.findByText('@Self')).closest('tr')!
    expect(within(self).getByText('Developer')).toBeInTheDocument()
    expect(within(self).getByRole('button', { name: 'Revoke sessions' })).toBeDisabled()
    expect(within(self).queryByRole('link', { name: 'Support access' })).not.toBeInTheDocument()
    const row = (await screen.findByText('@Target')).closest('tr')!
    expect(within(row).getByText('User')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Edit role/ })).not.toBeInTheDocument()
    expect(document.getElementById('admin-user-rank')).not.toBeInTheDocument()
    expect(screen.getByText(/Developer access is managed by the platform operator/)).toBeInTheDocument()
    expect(screen.queryByText(/developers\.json/)).not.toBeInTheDocument()
    expect(mutations()).toHaveLength(0)
  })

  it('filters the directory by effective role without changing access', async () => {
    mockDirectory([userRow(), { ...userRow('other-developer', 'Developer account'), rank: 'developer' }])
    renderPage()
    await screen.findByText('@Target')
    await fireEvent.change(screen.getByRole('combobox', { name: 'Role' }), { target: { value: 'developer' } })
    await screen.findByText('@Developer account')
    await vi.waitFor(() => expect(screen.queryByText('@Target')).not.toBeInTheDocument())
    expect(fetchAPI).toHaveBeenLastCalledWith(expect.stringContaining('rank=developer'), 'GET')
    expect(mutations()).toHaveLength(0)
  })

  it('requires a reason before revocation and blocks duplicate pending commands', async () => {
    const directory = vi.mocked(fetchAPI).getMockImplementation()!
    let complete!: (value: Response) => void
    vi.mocked(fetchAPI).mockImplementation((...args) =>
      args[1] === 'POST'
        ? new Promise((resolve) => {
            complete = resolve
          })
        : directory(...args),
    )
    renderPage()
    await fireEvent.click(await screen.findByRole('button', { name: 'Revoke sessions' }))
    const dialog = screen.getByRole('dialog', { name: 'Revoke sessions for Target?' })
    const confirm = within(dialog).getByRole('button', { name: 'Revoke sessions' })
    expect(confirm).toBeDisabled()
    await fireEvent.input(within(dialog).getByRole('textbox', { name: 'Reason' }), {
      target: { value: 'Account owner requested sign-out' },
    })
    await fireEvent.click(confirm)
    expect(confirm).toBeDisabled()
    expect(within(dialog).getByRole('textbox', { name: 'Reason' })).toBeDisabled()
    await fireEvent.click(confirm)
    expect(mutations()).toHaveLength(1)
    expect(mutations()[0][2]).toEqual({ confirm: '123456789012345678', reason: 'Account owner requested sign-out' })
    complete(response({ revoked: true }))
    await vi.waitFor(() => expect(dialog).not.toHaveAttribute('open'))
  })

  it('cancels session revocation without sending a command', async () => {
    renderPage()
    await fireEvent.click(await screen.findByRole('button', { name: 'Revoke sessions' }))
    const dialog = screen.getByRole('dialog', { name: 'Revoke sessions for Target?' })
    await fireEvent.input(within(dialog).getByRole('textbox', { name: 'Reason' }), {
      target: { value: 'Account owner requested sign-out' },
    })
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(dialog).not.toHaveAttribute('open')
    expect(mutations()).toHaveLength(0)
  })

  it.each([{}, { revoked: false }, { revoked: 'true' }])(
    'keeps revocation open when a 200 response does not confirm success: %j',
    async (malformed) => {
      const directory = vi.mocked(fetchAPI).getMockImplementation()!
      let accepted = false
      vi.mocked(fetchAPI).mockImplementation(async (...args) =>
        args[1] === 'POST' ? response(accepted ? { revoked: true } : malformed) : directory(...args),
      )
      renderPage()
      await fireEvent.click(await screen.findByRole('button', { name: 'Revoke sessions' }))
      const dialog = screen.getByRole('dialog', { name: 'Revoke sessions for Target?' })
      await fireEvent.input(within(dialog).getByRole('textbox', { name: 'Reason' }), {
        target: { value: 'Account owner requested sign-out' },
      })
      await fireEvent.click(within(dialog).getByRole('button', { name: 'Revoke sessions' }))
      await vi.waitFor(() => expect(within(dialog).getByRole('alert')).toBeInTheDocument())
      expect(dialog).toHaveAttribute('open')
      expect(within(dialog).getByRole('textbox', { name: 'Reason' })).toHaveValue('Account owner requested sign-out')
      expect(vi.mocked(fetchAPI).mock.calls.filter(([, method]) => method === 'GET')).toHaveLength(1)
      accepted = true
      await fireEvent.click(within(dialog).getByRole('button', { name: 'Revoke sessions' }))
      await vi.waitFor(() => expect(dialog).not.toHaveAttribute('open'))
      expect(mutations()).toHaveLength(2)
    },
  )
})
