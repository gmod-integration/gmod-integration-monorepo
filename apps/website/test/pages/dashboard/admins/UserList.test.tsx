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

  it('keeps own actions disabled and requires an explicit role choice for an unknown legacy rank', async () => {
    mockDirectory([userRow('u1', 'Self'), { ...userRow(), rank: 'legacy-moderator' }])
    renderPage()
    const self = (await screen.findByText('@Self')).closest('tr')!
    expect(within(self).getByRole('button', { name: 'Edit role' })).toBeDisabled()
    expect(within(self).getByRole('button', { name: 'Revoke sessions' })).toBeDisabled()
    const row = (await screen.findByText('@Target')).closest('tr')!
    await fireEvent.click(within(row).getByRole('button', { name: 'Edit role' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit role for Target' })
    expect(within(dialog).getByRole('combobox', { name: 'Role' })).toHaveValue('legacy-moderator')
    await fireEvent.input(within(dialog).getByRole('textbox', { name: 'Reason' }), {
      target: { value: 'Review the access request' },
    })
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled()
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(mutations()).toHaveLength(0)
  })

  it('preserves a rejected role draft and retries only after explicit Save', async () => {
    const directory = vi.mocked(fetchAPI).getMockImplementation()!
    let reject = true
    vi.mocked(fetchAPI).mockImplementation(async (...args) =>
      args[1] === 'PUT' ? response({ changed: true, rank: 'developer' }, reject ? 403 : 200) : directory(...args),
    )
    renderPage()
    await fireEvent.click((await screen.findAllByRole('button', { name: 'Edit role' }))[0])
    const dialog = screen.getByRole('dialog', { name: 'Edit role for Target' })
    await fireEvent.change(within(dialog).getByLabelText('Role'), { target: { value: 'developer' } })
    await fireEvent.input(within(dialog).getByRole('textbox', { name: 'Reason' }), {
      target: { value: 'Grant access after review' },
    })
    expect(mutations()).toHaveLength(0)
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(within(dialog).getByRole('alert')).toBeInTheDocument())
    expect(within(dialog).getByLabelText('Role')).toHaveValue('developer')
    expect(within(dialog).getByRole('textbox', { name: 'Reason' })).toHaveValue('Grant access after review')
    reject = false
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(dialog).not.toHaveAttribute('open'))
    expect(mutations()).toHaveLength(2)
    expect(mutations()[1]).toEqual([
      '/v6/admin/users/123456789012345678/rank',
      'PUT',
      { rank: 'developer', reason: 'Grant access after review' },
    ])
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

  it.each([{}, { rank: 'user', changed: true }, { rank: 'developer', changed: 'yes' }])(
    'preserves the role draft when a 200 response does not confirm the selected role: %j',
    async (malformed) => {
      const directory = vi.mocked(fetchAPI).getMockImplementation()!
      let accepted = false
      vi.mocked(fetchAPI).mockImplementation(async (...args) =>
        args[1] === 'PUT' ? response(accepted ? { changed: false, rank: 'developer' } : malformed) : directory(...args),
      )
      renderPage()
      await fireEvent.click(await screen.findByRole('button', { name: 'Edit role' }))
      const dialog = screen.getByRole('dialog', { name: 'Edit role for Target' })
      await fireEvent.change(within(dialog).getByLabelText('Role'), { target: { value: 'developer' } })
      await fireEvent.input(within(dialog).getByRole('textbox', { name: 'Reason' }), {
        target: { value: 'Grant access after review' },
      })
      await fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
      await vi.waitFor(() => expect(within(dialog).getByRole('alert')).toBeInTheDocument())
      expect(dialog).toHaveAttribute('open')
      expect(within(dialog).getByLabelText('Role')).toHaveValue('developer')
      expect(within(dialog).getByRole('textbox', { name: 'Reason' })).toHaveValue('Grant access after review')
      expect(vi.mocked(fetchAPI).mock.calls.filter(([, method]) => method === 'GET')).toHaveLength(1)
      accepted = true
      await fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
      await vi.waitFor(() => expect(dialog).not.toHaveAttribute('open'))
      expect(mutations()).toHaveLength(2)
    },
  )

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
