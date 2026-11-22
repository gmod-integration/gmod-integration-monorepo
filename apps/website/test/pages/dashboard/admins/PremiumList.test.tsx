import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@solidjs/testing-library'
import { renderWithProviders } from '../../../testUtils.js'
import { fetchAPI } from '../../../../src/utils/api.js'
import PremiumList from '../../../../src/pages/dashboard/admins/PremiumList.js'
import { adminIdentity, guildRow, mockDirectory, response } from './accountFixtures.js'

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
        <PremiumList />
      </div>
    ),
    { session: false },
  )
const access = (state = 'ready') => ({
  guildID: guildRow().id,
  premium: true,
  customBot: false,
  state,
  sources: ['discord'],
  revision: 'r1',
  validUntil: '2099-01-01T00:00:00.000Z',
})

describe('administrative Premium grants', () => {
  it('distinguishes recorded grants from effective provider access and keeps unknown verification visible', async () => {
    const directory = vi.mocked(fetchAPI).getMockImplementation()!
    vi.mocked(fetchAPI).mockImplementation(async (...args) =>
      args[0].endsWith(`/guilds/${guildRow().id}`)
        ? response({ guild: guildRow(), access: access('unknown') })
        : directory(...args),
    )
    renderPage()
    await screen.findByText('Example community')
    expect(screen.getByRole('option', { name: 'No active recorded grant' })).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Access details' }))
    const dialog = screen.getByRole('dialog', { name: 'Access for Example community' })
    await vi.waitFor(() => expect(within(dialog).getByText('Unknown')).toBeInTheDocument())
    expect(within(dialog).queryByText('Disabled')).not.toBeInTheDocument()
    expect(within(dialog).getByText('Discord')).toBeInTheDocument()
  })

  it('confirms a local grant with a reason and reports an accepted but pending verification', async () => {
    const directory = vi.mocked(fetchAPI).getMockImplementation()!
    vi.mocked(fetchAPI).mockImplementation(async (...args) =>
      args[1] === 'PUT'
        ? response({ guildID: guildRow().id, manualPremium: true, access: access('unknown'), pending: true })
        : directory(...args),
    )
    renderPage()
    await fireEvent.click(await screen.findByRole('button', { name: 'Add local grant' }))
    const dialog = screen.getByRole('dialog', { name: 'Grant local Premium to Example community?' })
    expect(within(dialog).getByRole('button', { name: 'Add local grant' })).toBeDisabled()
    await fireEvent.input(within(dialog).getByRole('textbox', { name: 'Reason' }), {
      target: { value: 'Community support agreement' },
    })
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Add local grant' }))
    await screen.findByText(
      'The local grant was saved. Effective access could not yet be confirmed; refresh its details to check again.',
    )
    expect(fetchAPI).toHaveBeenCalledWith(`/v6/admin/guilds/${guildRow().id}/premium`, 'PUT', {
      enabled: true,
      reason: 'Community support agreement',
    })
  })

  it('preserves failed removal for retry without cancelling external purchases', async () => {
    mockDirectory([], [guildRow(true)])
    const directory = vi.mocked(fetchAPI).getMockImplementation()!
    let fail = true
    vi.mocked(fetchAPI).mockImplementation(async (...args) =>
      args[1] === 'PUT'
        ? response(
            fail ? {} : { guildID: guildRow().id, manualPremium: false, access: access(), pending: false },
            fail ? 503 : 200,
          )
        : directory(...args),
    )
    renderPage()
    await fireEvent.click(await screen.findByRole('button', { name: 'Remove local grant' }))
    const dialog = screen.getByRole('dialog', { name: 'Remove the local grant for Example community?' })
    expect(
      within(dialog).getByText(/Valid Discord subscriptions or GmodStore purchases can keep Premium enabled/),
    ).toBeInTheDocument()
    await fireEvent.input(within(dialog).getByRole('textbox', { name: 'Reason' }), {
      target: { value: 'Local grant was temporary' },
    })
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Remove local grant' }))
    await vi.waitFor(() => expect(within(dialog).getByRole('alert')).toBeInTheDocument())
    expect(within(dialog).getByRole('textbox', { name: 'Reason' })).toHaveValue('Local grant was temporary')
    fail = false
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Remove local grant' }))
    await screen.findByText('The local grant was saved. Other verified Premium sources still apply.')
    expect(vi.mocked(fetchAPI).mock.calls.filter(([, method]) => method !== 'GET')).toHaveLength(2)
  })
})
