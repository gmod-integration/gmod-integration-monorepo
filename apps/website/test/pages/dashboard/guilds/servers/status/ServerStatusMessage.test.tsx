import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@solidjs/testing-library'
import { historyAt, renderWithProviders } from '../../../../../testUtils.js'
import { okJson, errJson, stubDialogGlobal, clearDialogGlobals } from '../testHelpers.js'

vi.mock('../../../../../../src/utils/api.js', () => ({
  fetchAPI: vi.fn(() => Promise.resolve({ ok: true, json: async () => ({}) })),
  getAPIUrl: vi.fn(),
  getUrlWithActualParams: vi.fn((s: string) => s),
}))

const { fetchAPI } = await import('../../../../../../src/utils/api.js')
const { guildChannelsMutate } = await import('../../../../../../src/pages/dashboard/guilds/GuildInformations.js')
const { default: ServerStatusMessage } = await import(
  '../../../../../../src/pages/dashboard/guilds/servers/status/ServerStatusMessage.js'
)

const STATUS_URL = '/users/:discordID/guilds/:guildID/servers/:serverID/status'
const SHOW_PLAYER_LIST_URL = '/users/:discordID/guilds/:guildID/servers/:serverID/settings/show_player_list_status'
const STATUS_FORMAT_URL = '/users/:discordID/guilds/:guildID/servers/:serverID/settings/status_player_list_format'
const SHOW_STATUS_CHART_URL = '/users/:discordID/guilds/:guildID/servers/:serverID/settings/show_status_chart'

function renderPage() {
  return renderWithProviders(() => <ServerStatusMessage />, {
    path: '/dashboard/guilds/:guildID/config/servers/:serverID/status',
    history: historyAt('/dashboard/guilds/g1/config/servers/s1/status'),
  })
}

function defaultFetch(overrides: Record<string, unknown> = {}) {
  const map: Record<string, unknown> = {
    [STATUS_URL]: {},
    [SHOW_PLAYER_LIST_URL]: { value: false },
    [STATUS_FORMAT_URL]: { value: '' },
    [SHOW_STATUS_CHART_URL]: { value: false },
    '/users/:discordID/guilds/:guildID/channels': [{ id: 'c1', name: 'general', type: 0, position: 0, parentID: null }],
    ...overrides,
  }
  ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
    if (method === 'GET' && Object.prototype.hasOwnProperty.call(map, endpoint)) {
      return Promise.resolve(okJson(map[endpoint]))
    }
    return Promise.resolve(okJson({}))
  })
}

afterEach(() => {
  cleanup()
  clearDialogGlobals('select_channel_modal', 'edit_format')
})

describe('pages/dashboard/guilds/servers/status/ServerStatusMessage.tsx', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: true }))
    guildChannelsMutate([{ id: 'c1', name: 'general', type: 0, position: 0, parentID: null }])
    ;(fetchAPI as Mock).mockReset()
    defaultFetch()
  })

  it('renders the panel title and description', async () => {
    renderPage()
    expect(screen.getByText('Server Status')).toBeInTheDocument()
    expect(screen.getByText('Here you can manage your server status message and buttons.')).toBeInTheDocument()
  })

  it('falls back to an empty object for status/showPlayerList/format/chart when their GET fails', async () => {
    ;(fetchAPI as Mock).mockResolvedValue(errJson())
    const { container } = renderPage()
    await vi.waitFor(() => {
      const checkboxes = container.querySelectorAll('input[type=checkbox]')
      expect(checkboxes[0]).not.toBeDisabled()
      expect(checkboxes[1]).not.toBeDisabled()
    })
    expect(screen.getByText('No status message')).toBeInTheDocument()
    const checkboxes = container.querySelectorAll('input[type=checkbox]')
    // showPlayerList()/show_status_chart() resolve to `{}` on a failed GET, so `.value` on them is
    // `undefined` (not `false`) - happy-dom stores that raw value on `.checked` instead of
    // coercing it like a real browser would, hence the falsy check rather than `toBe(false)`.
    expect((checkboxes[0] as HTMLInputElement).checked).toBeFalsy()
    expect((checkboxes[1] as HTMLInputElement).checked).toBeFalsy()
  })

  describe('status message', () => {
    it('shows "No status message" and a disabled add button while loading', () => {
      defaultFetch({ [STATUS_FORMAT_URL]: new Promise(() => {}) })
      const { container } = renderPage()
      expect(screen.getByText('No status message')).toBeInTheDocument()
      expect(container.querySelector('.fa-plus')).toBeDisabled()
    })

    it('renders the discord message once a status channel/message is configured', async () => {
      defaultFetch({ [STATUS_URL]: { channel: 'c1', message: 'm1' } })
      renderPage()
      await vi.waitFor(() => expect(screen.getByText('#general >', { exact: false })).toBeInTheDocument())
      expect(screen.queryByText('No status message')).not.toBeInTheDocument()
    })

    it('opens the channel selector modal and refetches guild channels on the add button click', async () => {
      const { container } = renderPage()
      await vi.waitFor(() => expect(container.querySelector('.fa-plus')).not.toBeDisabled())
      stubDialogGlobal(container, 'select_channel_modal')
      await fireEvent.click(container.querySelector('.fa-plus') as HTMLElement)
      expect(container.querySelector('#select_channel_modal')?.hasAttribute('open')).toBe(true)
    })

    it('sends the selected channel and mutates the status on success', async () => {
      const { container } = renderPage()
      await vi.waitFor(() => expect(container.querySelector('.fa-plus')).not.toBeDisabled())
      const select = container.querySelector('#select_channel_modal select.select') as HTMLSelectElement
      defaultFetch({ [STATUS_URL]: { channel: 'c1', message: 'm2' } })
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === STATUS_URL && method === 'POST') return Promise.resolve(okJson({ channel: 'c1', message: 'm2' }))
        if (endpoint === STATUS_URL && method === 'GET') return Promise.resolve(okJson({}))
        const map: Record<string, unknown> = {
          [SHOW_PLAYER_LIST_URL]: { value: false },
          [STATUS_FORMAT_URL]: { value: '' },
          [SHOW_STATUS_CHART_URL]: { value: false },
          '/users/:discordID/guilds/:guildID/channels': [{ id: 'c1', name: 'general', type: 0, position: 0, parentID: null }],
        }
        if (method === 'GET' && Object.prototype.hasOwnProperty.call(map, endpoint)) return Promise.resolve(okJson(map[endpoint]))
        return Promise.resolve(okJson({}))
      })
      await fireEvent.change(select, { target: { value: 'c1' } })
      await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(STATUS_URL, 'POST', { channelID: 'c1' }))
      await vi.waitFor(() => expect(screen.getByText('#general >', { exact: false })).toBeInTheDocument())
    })

    it('does not mutate the status when sending fails', async () => {
      const { container } = renderPage()
      await vi.waitFor(() => expect(container.querySelector('.fa-plus')).not.toBeDisabled())
      const select = container.querySelector('#select_channel_modal select.select') as HTMLSelectElement
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === STATUS_URL && method === 'POST') return Promise.resolve(errJson())
        return Promise.resolve(okJson({}))
      })
      await fireEvent.change(select, { target: { value: 'c1' } })
      await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(STATUS_URL, 'POST', { channelID: 'c1' }))
      expect(screen.getByText('No status message')).toBeInTheDocument()
    })

    it('removes the status and reverts to "No status message" on success', async () => {
      defaultFetch({ [STATUS_URL]: { channel: 'c1', message: 'm1' } })
      const { container } = renderPage()
      await vi.waitFor(() => expect(screen.getByText('#general >', { exact: false })).toBeInTheDocument())
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === STATUS_URL && method === 'DELETE') return Promise.resolve(okJson({}))
        return Promise.resolve(okJson({}))
      })
      await fireEvent.click(container.querySelector('.fa-xmark') as HTMLElement)
      await vi.waitFor(() => expect(screen.getByText('No status message')).toBeInTheDocument())
    })

    it('does not mutate the status when removal fails', async () => {
      defaultFetch({ [STATUS_URL]: { channel: 'c1', message: 'm1' } })
      const { container } = renderPage()
      await vi.waitFor(() => expect(screen.getByText('#general >', { exact: false })).toBeInTheDocument())
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === STATUS_URL && method === 'DELETE') return Promise.resolve(errJson())
        return Promise.resolve(okJson({}))
      })
      await fireEvent.click(container.querySelector('.fa-xmark') as HTMLElement)
      await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(STATUS_URL, 'DELETE'))
      expect(screen.getByText('#general >', { exact: false })).toBeInTheDocument()
    })
  })

  describe('show player list toggle', () => {
    it('reflects the fetched value and is disabled while loading', () => {
      defaultFetch({ [SHOW_PLAYER_LIST_URL]: new Promise(() => {}) })
      const { container } = renderPage()
      const checkbox = container.querySelectorAll('input[type=checkbox]')[0] as HTMLInputElement
      expect(checkbox).toBeDisabled()
      expect(checkbox.checked).toBe(false)
    })

    it('sends the new value on toggle and mutates the store', async () => {
      const { container } = renderPage()
      await vi.waitFor(() =>
        expect((container.querySelectorAll('input[type=checkbox]')[0] as HTMLInputElement).disabled).toBe(false),
      )
      const checkbox = container.querySelectorAll('input[type=checkbox]')[0] as HTMLInputElement
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === SHOW_PLAYER_LIST_URL && method === 'PUT') return Promise.resolve(okJson({ value: true }))
        return Promise.resolve(okJson({}))
      })
      await fireEvent.click(checkbox)
      await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(SHOW_PLAYER_LIST_URL, 'PUT', { value: true }))
      await vi.waitFor(() => expect(checkbox.checked).toBe(true))
    })

    it('logs the error and does not throw when the PUT fails', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { container } = renderPage()
      await vi.waitFor(() =>
        expect((container.querySelectorAll('input[type=checkbox]')[0] as HTMLInputElement).disabled).toBe(false),
      )
      const checkbox = container.querySelectorAll('input[type=checkbox]')[0] as HTMLInputElement
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === SHOW_PLAYER_LIST_URL && method === 'PUT') return Promise.resolve(errJson())
        return Promise.resolve(okJson({}))
      })
      await fireEvent.click(checkbox)
      await vi.waitFor(() => expect(errorSpy).toHaveBeenCalled())
      errorSpy.mockRestore()
    })
  })

  describe('player list format preview and edit modal', () => {
    it('computes the preview by substituting every placeholder', async () => {
      defaultFetch({
        [STATUS_FORMAT_URL]: {
          value:
            '{name}-{steamID64}-{team}-{userGroup}-{connectTime}-{kills}-{deaths}-{position}-{angle}-{fps}-{ping}-{adjustedTime}-{branch}-{custom}',
        },
      })
      const { container } = renderPage()
      await vi.waitFor(() => {
        const previewInputs = container.querySelectorAll('input[readonly]')
        expect((previewInputs[0] as HTMLInputElement).value).toContain('John Doe')
      })
      const preview = container.querySelectorAll('input[readonly]')[0] as HTMLInputElement
      expect(preview.value).toBe(
        'John Doe-76500000000000000-Citizen-user-00:00:00-0-0-0 0 0-0 0 0-0-0-0-main-:icon:',
      )
    })

    it('disables the format input and edit button while loading', () => {
      defaultFetch({ [STATUS_FORMAT_URL]: new Promise(() => {}) })
      const { container } = renderPage()
      expect(container.querySelector('input[readonly]')).toBeDisabled()
      expect(container.querySelector('.fa-edit')).toBeDisabled()
    })

    it('opens the edit modal, updates the format and preview live, and saves on click', async () => {
      defaultFetch({ [STATUS_FORMAT_URL]: { value: '{name}' } })
      const { container } = renderPage()
      await vi.waitFor(() => expect(container.querySelector('.fa-edit')).not.toBeDisabled())
      stubDialogGlobal(container, 'edit_format')
      await fireEvent.click(container.querySelector('.fa-edit') as HTMLElement)

      const modal = container.querySelector('#edit_format') as HTMLElement
      expect(modal.hasAttribute('open')).toBe(true)
      const formatInput = within(modal).getByDisplayValue('{name}') as HTMLInputElement
      await fireEvent.input(formatInput, { target: { value: '{team}' } })
      await vi.waitFor(() => expect(within(modal).getByDisplayValue('Citizen')).toBeInTheDocument())

      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === STATUS_FORMAT_URL && method === 'PUT') return Promise.resolve(okJson({ value: '{team}' }))
        return Promise.resolve(okJson({}))
      })
      await fireEvent.click(within(modal).getByText('Save'))
      await vi.waitFor(() =>
        expect(fetchAPI).toHaveBeenCalledWith(STATUS_FORMAT_URL, 'PUT', { value: '{team}' }),
      )
    })

    it('logs the error and does not throw when saving the format fails', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      defaultFetch({ [STATUS_FORMAT_URL]: { value: '{name}' } })
      const { container } = renderPage()
      await vi.waitFor(() => expect(container.querySelector('.fa-edit')).not.toBeDisabled())
      stubDialogGlobal(container, 'edit_format')
      await fireEvent.click(container.querySelector('.fa-edit') as HTMLElement)
      const modal = container.querySelector('#edit_format') as HTMLElement
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === STATUS_FORMAT_URL && method === 'PUT') return Promise.resolve(errJson())
        return Promise.resolve(okJson({}))
      })
      await fireEvent.click(within(modal).getByText('Save'))
      await vi.waitFor(() => expect(errorSpy).toHaveBeenCalled())
      errorSpy.mockRestore()
    })
  })

  describe('show player chart toggle', () => {
    it('is disabled while not premium, regardless of loading state', async () => {
      window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: false }))
      const { container } = renderPage()
      await vi.waitFor(() => {
        const checkboxes = container.querySelectorAll('input[type=checkbox]')
        expect(checkboxes[1]).toBeDisabled()
      })
    })

    it('reflects the fetched value and sends updates when premium', async () => {
      defaultFetch({ [SHOW_STATUS_CHART_URL]: { value: false } })
      const { container } = renderPage()
      await vi.waitFor(() => {
        const chartCheckbox = container.querySelectorAll('input[type=checkbox]')[1] as HTMLInputElement
        expect(chartCheckbox.disabled).toBe(false)
      })
      const chartCheckbox = container.querySelectorAll('input[type=checkbox]')[1] as HTMLInputElement
      expect(chartCheckbox.checked).toBe(false)
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === SHOW_STATUS_CHART_URL && method === 'PUT') return Promise.resolve(okJson({ value: true }))
        return Promise.resolve(okJson({}))
      })
      await fireEvent.click(chartCheckbox)
      await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(SHOW_STATUS_CHART_URL, 'PUT', { value: true }))
      await vi.waitFor(() => expect(chartCheckbox.checked).toBe(true))
    })

    it('logs the error and does not throw when the PUT fails', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { container } = renderPage()
      await vi.waitFor(() => {
        const chartCheckbox = container.querySelectorAll('input[type=checkbox]')[1] as HTMLInputElement
        expect(chartCheckbox.disabled).toBe(false)
      })
      const chartCheckbox = container.querySelectorAll('input[type=checkbox]')[1] as HTMLInputElement
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === SHOW_STATUS_CHART_URL && method === 'PUT') return Promise.resolve(errJson())
        return Promise.resolve(okJson({}))
      })
      await fireEvent.click(chartCheckbox)
      await vi.waitFor(() => expect(errorSpy).toHaveBeenCalled())
      errorSpy.mockRestore()
    })
  })
})
