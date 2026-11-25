import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@solidjs/testing-library'
import { historyAt, renderWithProviders } from '../../../../../testUtils.js'
import { errJson, okJson } from '../testHelpers.js'

vi.mock('../../../../../../src/utils/api.js', () => ({
  fetchAPI: vi.fn(),
  getAPIUrl: vi.fn(),
  getUrlWithActualParams: vi.fn((value: string) => value),
}))

const { fetchAPI } = await import('../../../../../../src/utils/api.js')
const { guildChannelsMutate } = await import('../../../../../../src/pages/dashboard/guilds/GuildInformations.js')
const { ServerErrorsParameters } =
  await import('../../../../../../src/pages/dashboard/guilds/servers/errors/ServerErrorsParameters.js')
const { default: ServerErrors } =
  await import('../../../../../../src/pages/dashboard/guilds/servers/errors/ServerErrors.js')

const endpoint = '/users/:discordID/guilds/:guildID/servers/:serverID/errors/channels'
const channels = [
  { id: '111111111111111111', name: 'lua-errors', type: 0, position: 0, parentID: null },
  { id: '222222222222222222', name: 'new-errors', type: 0, position: 1, parentID: null },
]
const selected = channels[0].id
const replacement = channels[1].id
const selector = () => document.querySelector<HTMLDialogElement>('#select-lua-errors-channel')!
const removal = () => document.querySelector<HTMLDialogElement>('#remove-lua-errors-channel')!

function setup(configuration: unknown = {}) {
  vi.mocked(fetchAPI).mockImplementation(async (path, method) => {
    if (path === endpoint && method === 'GET') return okJson(configuration) as Response
    return okJson(channels) as Response
  })
}

function renderPage(history = false) {
  return renderWithProviders(() => (history ? <ServerErrors /> : <ServerErrorsParameters />), {
    path: '/dashboard/guilds/:guildID/config/servers/:serverID/errors',
    history: historyAt('/dashboard/guilds/g1/config/servers/s1/errors'),
  })
}

async function loaded() {
  await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Select a channel' })).toBeEnabled())
}

async function choose(channelID = selected) {
  await fireEvent.click(screen.getByRole('button', { name: 'Select a channel' }))
  await vi.waitFor(() => expect(selector().querySelector('select')).toBeInTheDocument())
  await fireEvent.change(selector().querySelector('select')!, { target: { value: channelID } })
}

afterEach(cleanup)
beforeEach(() => {
  window.localStorage.clear()
  window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: true }))
  vi.mocked(fetchAPI).mockReset()
  setup()
  guildChannelsMutate(channels)
})

describe('Lua error Discord destination', () => {
  it('loads independently with no destination and does not write before a channel is confirmed', async () => {
    renderPage()
    await loaded()
    expect(screen.getByText('Lua errors on Discord')).toBeInTheDocument()
    expect(screen.getByText('No destination channel')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove destination' })).not.toBeInTheDocument()
    expect(fetchAPI).toHaveBeenCalledWith(endpoint, 'GET')
    await choose()
    expect(selector().open).toBe(true)
    expect(vi.mocked(fetchAPI).mock.calls.every(([, method]) => method === 'GET')).toBe(true)
    await fireEvent.click(within(selector()).getByRole('button', { name: 'Cancel' }))
    expect(selector().open).toBe(false)
    expect(screen.getByText('No destination channel')).toBeInTheDocument()
  })

  it('keeps the destination loading state distinct from an empty configuration', async () => {
    vi.mocked(fetchAPI).mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.getByRole('status')).toHaveTextContent('Loading…')
    expect(screen.queryByText('No destination channel')).not.toBeInTheDocument()
  })

  it.each(['http', 'malformed'])(
    'shows a retryable %s loading failure without a false empty destination',
    async (failure) => {
      vi.mocked(fetchAPI).mockImplementation(
        async (path) =>
          (path === endpoint
            ? failure === 'http'
              ? errJson()
              : okJson({ channelID: 12 })
            : okJson(channels)) as Response,
      )
      renderPage()
      await vi.waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent('Unable to load the Lua error destination.'),
      )
      expect(screen.queryByText('No destination channel')).not.toBeInTheDocument()
      setup({ channelID: selected })
      await fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
      await vi.waitFor(() => expect(screen.getByText('#lua-errors')).toBeInTheDocument())
    },
  )

  it('keeps an unavailable saved channel identifiable and removable', async () => {
    setup({ channelID: '333333333333333333' })
    renderPage()
    await loaded()
    expect(screen.getByText('#333333333333333333')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove destination' })).toBeEnabled()
  })

  it('changes the destination only after a successful acknowledgement and blocks duplicate saves', async () => {
    setup({ channelID: selected })
    renderPage()
    await loaded()
    let finish!: (response: Response) => void
    vi.mocked(fetchAPI).mockImplementation(async (path, method) => {
      if (path === endpoint && method === 'POST')
        return new Promise<Response>((resolve) => {
          finish = resolve
        })
      return okJson(channels) as Response
    })
    await choose(replacement)
    const save = within(selector()).getByRole('button', { name: 'Save' })
    await fireEvent.click(save)
    await fireEvent.click(save)
    expect(save).toBeDisabled()
    expect(selector().querySelector('select')).toBeDisabled()
    expect(screen.getByText('#lua-errors')).toBeInTheDocument()
    expect(vi.mocked(fetchAPI).mock.calls.filter(([, method]) => method === 'POST')).toHaveLength(1)
    finish(okJson({ channelID: replacement }) as Response)
    await vi.waitFor(() => expect(screen.getByText('#new-errors')).toBeInTheDocument())
    expect(fetchAPI).toHaveBeenCalledWith(endpoint, 'POST', { channelID: replacement })
    expect(selector().open).toBe(false)
  })

  it.each(['http', 'empty', 'mismatched', 'malformed'])(
    'retains the selected channel and saved destination after a failed %s save, then permits retry',
    async (failure) => {
      setup({ channelID: selected })
      renderPage()
      await loaded()
      let failed = true
      vi.mocked(fetchAPI).mockImplementation(async (path, method) => {
        if (path !== endpoint || method !== 'POST') return okJson(channels) as Response
        if (!failed) return okJson({ channelID: replacement }) as Response
        const responses = {
          http: errJson(),
          empty: okJson({}),
          mismatched: okJson({ channelID: selected }),
          malformed: okJson({ channelID: 12 }),
        }
        return responses[failure as keyof typeof responses] as Response
      })
      await choose(replacement)
      await fireEvent.click(within(selector()).getByRole('button', { name: 'Save' }))
      await vi.waitFor(() => expect(within(selector()).getByRole('alert')).toHaveTextContent('Unable to save'))
      expect(selector().open).toBe(true)
      expect(selector().querySelector('select')).toHaveValue(replacement)
      expect(screen.getByText('#lua-errors')).toBeInTheDocument()
      failed = false
      await fireEvent.click(within(selector()).getByRole('button', { name: 'Save' }))
      await vi.waitFor(() => expect(screen.getByText('#new-errors')).toBeInTheDocument())
      expect(selector().open).toBe(false)
    },
  )

  it('confirms destination removal, blocks duplicates and clears only after success', async () => {
    setup({ channelID: selected })
    renderPage()
    await loaded()
    let finish!: (response: Response) => void
    vi.mocked(fetchAPI).mockImplementation(async (path, method) => {
      if (path === endpoint && method === 'DELETE')
        return new Promise<Response>((resolve) => {
          finish = resolve
        })
      return okJson(channels) as Response
    })
    await fireEvent.click(screen.getByRole('button', { name: 'Remove destination' }))
    expect(vi.mocked(fetchAPI).mock.calls.some(([, method]) => method === 'DELETE')).toBe(false)
    const confirm = within(removal()).getByRole('button', { name: 'Remove destination' })
    await fireEvent.click(confirm)
    await fireEvent.click(confirm)
    expect(confirm).toBeDisabled()
    expect(screen.getByText('#lua-errors')).toBeInTheDocument()
    expect(vi.mocked(fetchAPI).mock.calls.filter(([, method]) => method === 'DELETE')).toHaveLength(1)
    finish(okJson({}) as Response)
    await vi.waitFor(() => expect(screen.getByText('No destination channel')).toBeInTheDocument())
    expect(removal().open).toBe(false)
  })

  it.each(['http', 'unconfirmed'])(
    'keeps the channel after a failed %s removal and retries inside the confirmation dialog',
    async (failure) => {
      setup({ channelID: selected })
      renderPage()
      await loaded()
      let failed = true
      vi.mocked(fetchAPI).mockImplementation(async (path, method) => {
        if (path !== endpoint || method !== 'DELETE') return okJson(channels) as Response
        return (failed ? (failure === 'http' ? errJson() : okJson({ channelID: selected })) : okJson({})) as Response
      })
      await fireEvent.click(screen.getByRole('button', { name: 'Remove destination' }))
      await fireEvent.click(within(removal()).getByRole('button', { name: 'Remove destination' }))
      await vi.waitFor(() => expect(within(removal()).getByRole('alert')).toHaveTextContent('The action failed'))
      expect(removal().open).toBe(true)
      expect(screen.getByText('#lua-errors')).toBeInTheDocument()
      failed = false
      await fireEvent.click(within(removal()).getByRole('button', { name: 'Remove destination' }))
      await vi.waitFor(() => expect(screen.getByText('No destination channel')).toBeInTheDocument())
    },
  )

  it('keeps error history available when only the Discord destination fails to load', async () => {
    vi.mocked(fetchAPI).mockImplementation(async (path) => {
      if (path === endpoint) return errJson() as Response
      if (path.startsWith('/users/:discordID/guilds/:guildID/servers/:serverID/errors?'))
        return okJson({
          errors: [
            {
              serverID: 's1',
              count: 1,
              realm: 'server',
              error: 'attempt to call a nil value',
              stack: '[]',
              name: 'my_addon',
              steamID64: '',
              workshopID: '',
              uptime: 1,
              createdAt: '2026-01-01T00:00:00Z',
              updatedAt: '2026-01-01T00:00:00Z',
            },
          ],
          query: { limit: 25, offset: 0, sort: 'createdAt', orderBy: 'DESC', total: 1 },
        }) as Response
      return okJson(channels) as Response
    })
    renderPage(true)
    await vi.waitFor(() => expect(screen.getByText('my_addon')).toBeInTheDocument())
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to load the Lua error destination.')
    expect(screen.getByText('attempt to call a nil value')).toBeInTheDocument()
  })
})
