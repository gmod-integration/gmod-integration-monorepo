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

function partnerDirectory(partner = false) {
  const guild = guildFixture({ partner })
  const update = vi.fn(async (enabled: boolean) => {
    guild.partner = enabled
    return ok({ guildID: guild.id, partner: enabled }) as Response
  })
  vi.mocked(fetchAPI).mockImplementation(async (endpoint, method, body) => {
    if (method === 'PATCH') return update((body as { enabled: boolean }).enabled)
    if (endpoint === `/v6/admin/guilds/${guild.id}`)
      return ok({
        guild,
        access: {
          guildID: guild.id,
          premium: false,
          customBot: false,
          state: 'ready',
          sources: [],
          revision: 'r1',
          validUntil: '2099-01-01T00:00:00.000Z',
        },
      }) as Response
    return ok(pageFixture(endpoint, [guild])) as Response
  })
  return { guild, update }
}

async function partnerDialog(remove = false) {
  await fireEvent.click(await screen.findByRole('button', { name: remove ? 'Remove partner' : 'Add partner' }))
  return screen.getByRole('dialog', {
    name: remove ? 'Remove partner status from Example community?' : 'Mark Example community as a partner?',
  })
}

describe('administrative community directory', () => {
  it('confirms a named partnership with a valid reason and refreshes its status independently from Premium', async () => {
    const { guild, update } = partnerDirectory()
    renderPage()
    const dialog = await partnerDialog()
    expect(within(dialog).getByText(/Premium access is unchanged/)).toBeInTheDocument()
    const reason = within(dialog).getByRole('textbox', { name: 'Reason' })
    const confirm = within(dialog).getByRole('button', { name: 'Add partner' })
    expect(confirm).toBeDisabled()
    await fireEvent.input(reason, { target: { value: ' ab ' } })
    expect(confirm).toBeDisabled()
    await fireEvent.input(reason, { target: { value: 'x'.repeat(501) } })
    expect(confirm).toBeDisabled()
    await fireEvent.input(reason, { target: { value: '  Agreed community partnership  ' } })
    await fireEvent.click(confirm)

    await screen.findByText('Partner status was updated.')
    await vi.waitFor(() => expect(dialog).not.toHaveAttribute('open'))
    expect(update).toHaveBeenCalledExactlyOnceWith(true)
    expect(fetchAPI).toHaveBeenCalledWith(`/v6/admin/guilds/${guild.id}/partner`, 'PATCH', {
      enabled: true,
      reason: 'Agreed community partnership',
    })
    await screen.findByRole('button', { name: 'Remove partner' })
    const row = screen.getByText('Example community').closest('tr')!
    expect(within(row).getByText('Partner')).toBeInTheDocument()
    expect(within(row).getByText('No active recorded grant')).toBeInTheDocument()
  })

  it('removes partnership while retaining recorded Premium sources', async () => {
    const { guild, update } = partnerDirectory(true)
    guild.manualPremium = true
    guild.gmodstore = true
    renderPage()
    const dialog = await partnerDialog(true)
    await fireEvent.input(within(dialog).getByRole('textbox', { name: 'Reason' }), {
      target: { value: 'Partnership agreement ended' },
    })
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Remove partner' }))

    await screen.findByRole('button', { name: 'Add partner' })
    expect(update).toHaveBeenCalledExactlyOnceWith(false)
    const row = screen.getByText('Example community').closest('tr')!
    expect(within(row).getByText('Not a partner')).toBeInTheDocument()
    expect(within(row).getByText('Manual grant')).toBeInTheDocument()
    expect(within(row).getByText('GmodStore')).toBeInTheDocument()
  })

  it('keeps a failed partnership reason, blocks duplicate submissions and prevents dismissal while pending', async () => {
    const { update } = partnerDirectory()
    let complete!: (value: Response) => void
    update.mockImplementationOnce(() => new Promise<Response>((resolve) => (complete = resolve)))
    renderPage()
    const dialog = await partnerDialog()
    const reason = within(dialog).getByRole('textbox', { name: 'Reason' })
    await fireEvent.input(reason, { target: { value: 'Reviewed partner application' } })
    const confirm = within(dialog).getByRole('button', { name: 'Add partner' })
    await fireEvent.click(confirm)
    await fireEvent.click(confirm)
    expect(update).toHaveBeenCalledOnce()
    expect(reason).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeDisabled()
    const cancel = new Event('cancel', { cancelable: true })
    dialog.dispatchEvent(cancel)
    expect(cancel.defaultPrevented).toBe(true)

    complete(failed() as Response)
    await within(dialog).findByRole('alert')
    expect(dialog).toHaveAttribute('open')
    expect(reason).toHaveValue('Reviewed partner application')
    expect(reason).toBeEnabled()
    await fireEvent.click(confirm)
    await screen.findByText('Partner status was updated.')
    expect(update).toHaveBeenCalledTimes(2)
  })

  it('cancels an unsubmitted partnership change and starts a new draft when reopened', async () => {
    const { update } = partnerDirectory()
    renderPage()
    let dialog = await partnerDialog()
    await fireEvent.input(within(dialog).getByRole('textbox', { name: 'Reason' }), {
      target: { value: 'A draft decision' },
    })
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(dialog).not.toHaveAttribute('open')
    expect(update).not.toHaveBeenCalled()
    dialog = await partnerDialog()
    expect(within(dialog).getByRole('textbox', { name: 'Reason' })).toHaveValue('')
  })

  it.each(['guild', 'state'] as const)(
    'rejects a successful HTTP response with the wrong %s acknowledgement',
    async (wrong) => {
      const { guild, update } = partnerDirectory()
      update.mockResolvedValueOnce(
        ok({ guildID: wrong === 'guild' ? 'another-community' : guild.id, partner: wrong !== 'state' }) as Response,
      )
      renderPage()
      const dialog = await partnerDialog()
      await fireEvent.input(within(dialog).getByRole('textbox', { name: 'Reason' }), {
        target: { value: 'Reviewed partner application' },
      })
      await fireEvent.click(within(dialog).getByRole('button', { name: 'Add partner' }))
      await within(dialog).findByRole('alert')
      expect(dialog).toHaveAttribute('open')
      expect(within(dialog).getByRole('textbox', { name: 'Reason' })).toHaveValue('Reviewed partner application')
      expect(screen.queryByText('Partner status was updated.')).not.toBeInTheDocument()
    },
  )

  it('reports an accepted partner change separately when refreshing the directory fails', async () => {
    const { update } = partnerDirectory()
    const directory = vi.mocked(fetchAPI).getMockImplementation()!
    vi.mocked(fetchAPI).mockImplementation(async (...args) =>
      args[1] === 'GET' && update.mock.calls.length > 0 ? (failed() as Response) : directory(...args),
    )
    renderPage()
    const dialog = await partnerDialog()
    await fireEvent.input(within(dialog).getByRole('textbox', { name: 'Reason' }), {
      target: { value: 'Reviewed partner application' },
    })
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Add partner' }))
    await screen.findByText('Partner status was updated.')
    await screen.findByRole('alert')
    await vi.waitFor(() => expect(dialog).not.toHaveAttribute('open'))
    expect(update).toHaveBeenCalledOnce()
    expect(screen.getByRole('alert')).toHaveTextContent('The communities could not be loaded. Try again.')
  })

  it('refreshes an inspected community after changing its partnership', async () => {
    const { guild } = partnerDirectory()
    renderPage()
    await fireEvent.click(await screen.findByRole('button', { name: 'Inspect' }))
    const detail = screen.getByRole('dialog', { name: 'Community details' })
    await within(detail).findByText('Not a partner')
    const dialog = await partnerDialog()
    await fireEvent.input(within(dialog).getByRole('textbox', { name: 'Reason' }), {
      target: { value: 'Reviewed partner application' },
    })
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Add partner' }))
    await screen.findByText('Partner status was updated.')
    await vi.waitFor(() =>
      expect(
        vi.mocked(fetchAPI).mock.calls.filter(([endpoint]) => endpoint === `/v6/admin/guilds/${guild.id}`),
      ).toHaveLength(2),
    )
    await vi.waitFor(() => expect(within(detail).getAllByText('Partner')).toHaveLength(2))
    expect(within(detail).queryByText('Not a partner')).not.toBeInTheDocument()
  })

  it('retries details separately and displays every verified source before closing the inspection', async () => {
    const guild = guildFixture({ gmodstore: true })
    let attempts = 0
    vi.mocked(fetchAPI).mockImplementation(async (endpoint) => {
      if (endpoint.startsWith(`/v6/admin/guilds/${guild.id}`)) {
        attempts++
        return (
          attempts === 1
            ? failed()
            : ok({
                guild,
                access: {
                  guildID: guild.id,
                  premium: true,
                  customBot: true,
                  state: 'ready',
                  sources: ['legacy', 'gmodstore', 'discord'],
                  revision: 'verified',
                  validUntil: '2099-01-01T00:00:00.000Z',
                },
              })
        ) as Response
      }
      return ok(pageFixture(endpoint, [guild])) as Response
    })
    renderPage()
    await fireEvent.click(await screen.findByRole('button', { name: 'Inspect' }))
    let dialog = screen.getByRole('dialog', { name: 'Community details' })
    await within(dialog).findByRole('alert')
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Try again' }))
    await within(dialog).findByText('Manual grant')
    expect(within(dialog).getByText('GmodStore')).toBeInTheDocument()
    expect(within(dialog).getByText('Discord')).toBeInTheDocument()
    expect(within(dialog).getAllByText('Enabled')).toHaveLength(2)
    await fireEvent.click(within(dialog).getAllByRole('button', { name: 'Close' }).at(-1)!)
    expect(dialog).not.toHaveAttribute('open')
    await fireEvent.click(screen.getByRole('button', { name: 'Inspect' }))
    dialog = screen.getByRole('dialog', { name: 'Community details' })
    await fireEvent.click(within(dialog).getAllByRole('button', { name: 'Close' })[0])
    expect(dialog).not.toHaveAttribute('open')
  })

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
