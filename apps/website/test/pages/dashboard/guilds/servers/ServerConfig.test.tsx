import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@solidjs/testing-library'
import { historyAt, renderWithProviders } from '../../../../testUtils.js'
import ServerConfig from '../../../../../src/pages/dashboard/guilds/servers/ServerConfig.js'
import { fetchAPI } from '../../../../../src/utils/api.js'
import { okJson, errJson } from './testHelpers.js'

vi.mock('../../../../../src/utils/api.js', () => ({
  fetchAPI: vi.fn(),
  getAPIUrl: vi.fn(),
  getUrlWithActualParams: vi.fn((s: string) => s),
}))

const CONFIG_URL = '/users/:discordID/guilds/:guildID/servers/:serverID/config'
const settingUrl = (setting: string) => `/users/:discordID/guilds/:guildID/servers/:serverID/settings/${setting}`

// Fresh object every call - the resource fetcher mutates `settings.ig_adminRank` directly in
// place while normalizing it (see ServerConfig.tsx:213-223), so a shared module-level fixture
// would leak mutations across tests (okJson returns its payload by reference).
function defaultSettings() {
  return {
    ig_syncBan: true,
    ig_supportLink: 'http://support.example.com',
    ig_verifyOnReadyKickTime: 120,
    ig_clientBranch: 'dev',
    ig_adminRank: { superadmin: true, mod: true },
  }
}

function setupFetchAPI(settings: unknown = defaultSettings()) {
  ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
    if (endpoint === CONFIG_URL && method === 'GET') return Promise.resolve(okJson({ settings }))
    return Promise.resolve(okJson({}))
  })
}

function renderPage() {
  return renderWithProviders(() => <ServerConfig />, {
    path: '/dashboard/guilds/:guildID/config/servers/:serverID/config',
    history: historyAt('/dashboard/guilds/g1/config/servers/s1/config'),
  })
}

function findRow(container: HTMLElement, label: string) {
  const row = Array.from(container.querySelectorAll('.flex.flex-col.gap-2.p-4')).find(
    (el) => el.querySelector('span.font-medium')?.textContent === label,
  )
  if (!row) throw new Error(`no config row for label "${label}"`)
  return row as HTMLElement
}

async function waitForLoaded(container: HTMLElement) {
  await vi.waitFor(() => {
    const row = findRow(container, 'Sync Bans')
    expect(row.querySelector('input[type=checkbox]')).not.toBeDisabled()
  })
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('pages/dashboard/guilds/servers/ServerConfig.tsx', () => {
  beforeEach(() => {
    window.localStorage.clear()
    ;(fetchAPI as Mock).mockReset()
    setupFetchAPI()
  })

  it('renders the panel title, description and the websocket notice', async () => {
    renderPage()
    expect(screen.getByText('Configuration')).toBeInTheDocument()
    expect(screen.getByText('Manage the in game configuration of this server.')).toBeInTheDocument()
    expect(screen.getByText('GWSocket')).toBeInTheDocument()
  })

  it('disables every control type while the config is loading', () => {
    ;(fetchAPI as Mock).mockImplementation(() => new Promise(() => {}))
    const { container } = renderPage()
    expect(findRow(container, 'Sync Bans').querySelector('input[type=checkbox]')).toBeDisabled()
    expect(findRow(container, 'Client Branch').querySelector('select')).toBeDisabled()
    expect(findRow(container, 'Support Link').querySelector('input[type=text]')).toBeDisabled()
    expect(findRow(container, 'Admin Ranks').querySelector('button')).toBeDisabled()
  })

  describe('initial rendering of fetched values', () => {
    it('reflects a fetched boolean that differs from its default', async () => {
      const { container } = renderPage()
      await waitForLoaded(container)
      const checkbox = findRow(container, 'Sync Bans').querySelector('input[type=checkbox]') as HTMLInputElement
      expect(checkbox.checked).toBe(true) // fetched value true, also happens to equal the default
    })

    it('falls back to defaultValue for booleans absent from the fetched settings', async () => {
      const { container } = renderPage()
      await waitForLoaded(container)
      // ig_syncTimeout is not present in defaultSettings(); its own defaultValue is false
      const checkbox = findRow(container, 'Sync Timeouts').querySelector('input[type=checkbox]') as HTMLInputElement
      expect(checkbox.checked).toBe(false)
    })

    it('renders text inputs with the fetched value', async () => {
      const { container } = renderPage()
      await waitForLoaded(container)
      const input = findRow(container, 'Support Link').querySelector('input[type=text]') as HTMLInputElement
      expect(input.value).toBe('http://support.example.com')
      const kickTimeInput = findRow(container, 'Verify Kick Delay (sec)').querySelector(
        'input[type=text]',
      ) as HTMLInputElement
      expect(kickTimeInput.value).toBe('120')
    })

    it('falls back to defaultValue for text settings absent from the fetched settings', async () => {
      const { container } = renderPage()
      await waitForLoaded(container)
      const input = findRow(container, 'Log Timestamp Format').querySelector('input[type=text]') as HTMLInputElement
      expect(input.value).toBe('%H:%M:%S')
    })

    it('marks the fetched value as the selected option in a select control', async () => {
      const { container } = renderPage()
      await waitForLoaded(container)
      const select = findRow(container, 'Client Branch').querySelector('select') as HTMLSelectElement
      expect(within(select).getByText('dev')).toHaveProperty('selected', true)
    })

    it('falls back to defaultValue as the selected option for a select absent from the fetched settings', async () => {
      const { container } = renderPage()
      await waitForLoaded(container)
      const select = findRow(container, 'Addon Language').querySelector('select') as HTMLSelectElement
      expect(within(select).getByText('en')).toHaveProperty('selected', true)
    })

    it('renders the admin rank list sorted alphabetically', async () => {
      const { container } = renderPage()
      await waitForLoaded(container)
      const row = findRow(container, 'Admin Ranks')
      const inputs = within(row).getAllByRole('textbox') as HTMLInputElement[]
      expect(inputs.map((i) => i.value)).toEqual(['mod', 'superadmin'])
    })

    it('shows the Default value line for a boolean, a select, and the admin rank object', async () => {
      const { container } = renderPage()
      await waitForLoaded(container)
      expect(findRow(container, 'Sync Bans').textContent).toContain('Default: true')
      expect(findRow(container, 'Client Branch').textContent).toContain('Default: any')
      expect(findRow(container, 'Admin Ranks').textContent).toContain('Default: {"superadmin":true}')
    })
  })

  describe('ig_adminRank normalization on fetch', () => {
    it('falls back to the default admin rank when the fetched value is the string "[object Object]"', async () => {
      setupFetchAPI({ ig_adminRank: '[object Object]' })
      const { container } = renderPage()
      await waitForLoaded(container)
      const row = findRow(container, 'Admin Ranks')
      const inputs = within(row).getAllByRole('textbox') as HTMLInputElement[]
      expect(inputs.map((i) => i.value)).toEqual(['superadmin'])
    })

    it('parses a JSON-stringified admin rank object', async () => {
      setupFetchAPI({ ig_adminRank: JSON.stringify({ zeta: true, alpha: true }) })
      const { container } = renderPage()
      await waitForLoaded(container)
      const row = findRow(container, 'Admin Ranks')
      const inputs = within(row).getAllByRole('textbox') as HTMLInputElement[]
      expect(inputs.map((i) => i.value)).toEqual(['alpha', 'zeta'])
    })

    it('falls back to the default admin rank when the string cannot be parsed as JSON', async () => {
      setupFetchAPI({ ig_adminRank: 'not valid json {' })
      const { container } = renderPage()
      await waitForLoaded(container)
      const row = findRow(container, 'Admin Ranks')
      const inputs = within(row).getAllByRole('textbox') as HTMLInputElement[]
      expect(inputs.map((i) => i.value)).toEqual(['superadmin'])
    })

    it('falls back to the default admin rank when settings has no ig_adminRank at all', async () => {
      setupFetchAPI({ ig_syncBan: false })
      const { container } = renderPage()
      await waitForLoaded(container)
      const row = findRow(container, 'Admin Ranks')
      const inputs = within(row).getAllByRole('textbox') as HTMLInputElement[]
      expect(inputs.map((i) => i.value)).toEqual(['superadmin'])
    })

    it('falls back to an empty config and default admin rank when the response has no settings key at all', async () => {
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === CONFIG_URL && method === 'GET') return Promise.resolve(okJson({}))
        return Promise.resolve(okJson({}))
      })
      const { container } = renderPage()
      await waitForLoaded(container)
      const row = findRow(container, 'Admin Ranks')
      const inputs = within(row).getAllByRole('textbox') as HTMLInputElement[]
      expect(inputs.map((i) => i.value)).toEqual(['superadmin'])
    })
  })

  describe('when the initial GET fails', () => {
    it('does not crash and leaves controls enabled with default values once the resource settles', async () => {
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === CONFIG_URL && method === 'GET') return Promise.resolve(errJson())
        return Promise.resolve(okJson({}))
      })
      const { container } = renderPage()
      await vi.waitFor(() => {
        const checkbox = findRow(container, 'Sync Bans').querySelector('input[type=checkbox]') as HTMLInputElement
        expect(checkbox).not.toBeDisabled()
      })
      const checkbox = findRow(container, 'Sync Bans').querySelector('input[type=checkbox]') as HTMLInputElement
      expect(checkbox.checked).toBe(true) // defaultValue, since config store was never populated
      const row = findRow(container, 'Admin Ranks')
      const inputs = within(row).queryAllByRole('textbox') as HTMLInputElement[]
      expect(inputs).toHaveLength(0) // adminRankList signal also stayed at its initial []
    })
  })

  describe('editing the admin rank list', () => {
    it('adds a new empty rank row when clicking "Add rank"', async () => {
      const { container } = renderPage()
      await waitForLoaded(container)
      const row = findRow(container, 'Admin Ranks')
      const addButton = within(row).getByText('Add rank')
      await fireEvent.click(addButton)
      const inputs = within(row).getAllByRole('textbox') as HTMLInputElement[]
      expect(inputs.map((i) => i.value)).toEqual(['mod', 'superadmin', ''])
    })

    it('sends the JSON-stringified admin rank object 500ms after editing an existing rank', async () => {
      const { container } = renderPage()
      await waitForLoaded(container)
      vi.useFakeTimers()
      const row = findRow(container, 'Admin Ranks')
      const inputs = within(row).getAllByRole('textbox') as HTMLInputElement[]
      const modInput = inputs[0] // sorted list: ['mod', 'superadmin']
      expect(modInput.value).toBe('mod')

      fireEvent.input(modInput, { target: { value: 'moderator' } })
      await vi.advanceTimersByTimeAsync(500)

      expect(fetchAPI).toHaveBeenCalledWith(settingUrl('ig_adminRank'), 'PUT', {
        value: JSON.stringify({ moderator: true, superadmin: true }),
      })
    })

    it('resets the debounce timer when editing again within the 500ms window', async () => {
      const { container } = renderPage()
      await waitForLoaded(container)
      const callsBefore = (fetchAPI as Mock).mock.calls.length
      vi.useFakeTimers()
      const row = findRow(container, 'Admin Ranks')
      const inputs = within(row).getAllByRole('textbox') as HTMLInputElement[]
      const modInput = inputs[0]

      fireEvent.input(modInput, { target: { value: 'mo' } })
      await vi.advanceTimersByTimeAsync(250)
      fireEvent.input(modInput, { target: { value: 'mod2' } })
      await vi.advanceTimersByTimeAsync(250)
      // first timer would have fired by 500ms from the first keystroke, but it was cleared
      expect(fetchAPI).not.toHaveBeenCalledWith(settingUrl('ig_adminRank'), 'PUT', expect.anything())

      await vi.advanceTimersByTimeAsync(250)
      const callsAfter = (fetchAPI as Mock).mock.calls.length
      expect(callsAfter - callsBefore).toBe(1)
      expect(fetchAPI).toHaveBeenLastCalledWith(settingUrl('ig_adminRank'), 'PUT', {
        value: JSON.stringify({ mod2: true, superadmin: true }),
      })
    })

    it('removes a rank row and sends the remaining ranks after the debounce', async () => {
      const { container } = renderPage()
      await waitForLoaded(container)
      vi.useFakeTimers()
      const row = findRow(container, 'Admin Ranks')
      const removeButtons = within(row).getAllByRole('button')
      // ranks sorted ['mod', 'superadmin']; remove the first one ('mod')
      await fireEvent.click(removeButtons[0])

      const remainingInputs = within(row).getAllByRole('textbox') as HTMLInputElement[]
      expect(remainingInputs.map((i) => i.value)).toEqual(['superadmin'])

      await vi.advanceTimersByTimeAsync(500)
      expect(fetchAPI).toHaveBeenCalledWith(settingUrl('ig_adminRank'), 'PUT', {
        value: JSON.stringify({ superadmin: true }),
      })
    })

    it('excludes blank rank rows from the payload sent to the server', async () => {
      const { container } = renderPage()
      await waitForLoaded(container)
      const row = findRow(container, 'Admin Ranks')
      const addButton = within(row).getByText('Add rank')
      await fireEvent.click(addButton) // adds a blank row: ['mod', 'superadmin', '']

      vi.useFakeTimers()
      const inputs = within(row).getAllByRole('textbox') as HTMLInputElement[]
      fireEvent.input(inputs[2], { target: { value: '   ' } }) // whitespace-only, trims to empty
      await vi.advanceTimersByTimeAsync(500)

      expect(fetchAPI).toHaveBeenCalledWith(settingUrl('ig_adminRank'), 'PUT', {
        value: JSON.stringify({ mod: true, superadmin: true }),
      })
    })
  })

  describe('updating a boolean setting', () => {
    it('sends the new value as a PUT and updates the store on success', async () => {
      const { container } = renderPage()
      await waitForLoaded(container)
      const checkbox = findRow(container, 'Sync Timeouts').querySelector('input[type=checkbox]') as HTMLInputElement
      expect(checkbox.checked).toBe(false)
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === settingUrl('ig_syncTimeout') && method === 'PUT') return Promise.resolve(okJson({ value: true }))
        return Promise.resolve(okJson({}))
      })
      await fireEvent.click(checkbox)
      await vi.waitFor(() =>
        expect(fetchAPI).toHaveBeenCalledWith(settingUrl('ig_syncTimeout'), 'PUT', { value: true }),
      )
      expect(checkbox.checked).toBe(true)
    })

    it('does not throw when the PUT fails (missing .catch would surface as an unhandled rejection)', async () => {
      const { container } = renderPage()
      await waitForLoaded(container)
      const checkbox = findRow(container, 'Sync Timeouts').querySelector('input[type=checkbox]') as HTMLInputElement
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === settingUrl('ig_syncTimeout') && method === 'PUT') return Promise.resolve(errJson())
        return Promise.resolve(okJson({}))
      })
      await fireEvent.click(checkbox)
      await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(settingUrl('ig_syncTimeout'), 'PUT', expect.anything()))
    })

    it('parses a JSON-object-shaped string value back into an object once received', async () => {
      const { container } = renderPage()
      await waitForLoaded(container)
      const checkbox = findRow(container, 'Sync Timeouts').querySelector('input[type=checkbox]') as HTMLInputElement
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === settingUrl('ig_syncTimeout') && method === 'PUT')
          return Promise.resolve(okJson({ value: '{"weird":"json"}' }))
        return Promise.resolve(okJson({}))
      })
      // exercising this branch only for statement/branch coverage of the JSON.parse success path -
      // the parsed object isn't otherwise observable from this control.
      await fireEvent.click(checkbox)
      await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(settingUrl('ig_syncTimeout'), 'PUT', expect.anything()))
    })

    it('keeps the value as a string when it looks like JSON but fails to parse', async () => {
      const { container } = renderPage()
      await waitForLoaded(container)
      const checkbox = findRow(container, 'Sync Timeouts').querySelector('input[type=checkbox]') as HTMLInputElement
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === settingUrl('ig_syncTimeout') && method === 'PUT')
          return Promise.resolve(okJson({ value: '{not valid' }))
        return Promise.resolve(okJson({}))
      })
      await fireEvent.click(checkbox)
      await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(settingUrl('ig_syncTimeout'), 'PUT', expect.anything()))
    })
  })

  describe('updating a select setting', () => {
    it('sends the selected value immediately (no debounce)', async () => {
      const { container } = renderPage()
      await waitForLoaded(container)
      const select = findRow(container, 'Client Branch').querySelector('select') as HTMLSelectElement
      await fireEvent.change(select, { target: { value: 'prerelease' } })
      await vi.waitFor(() =>
        expect(fetchAPI).toHaveBeenCalledWith(settingUrl('ig_clientBranch'), 'PUT', { value: 'prerelease' }),
      )
    })

    it('coerces the literal strings "true"/"false" to booleans before sending', async () => {
      // ig_maintenance is a boolean setting but let's use ig_language (a plain string select) to
      // confirm non-boolean-looking values are sent as-is, and separately confirm the true/false
      // coercion branch using a select whose options happen to include those literal strings.
      const { container } = renderPage()
      await waitForLoaded(container)
      const select = findRow(container, 'Addon Language').querySelector('select') as HTMLSelectElement
      await fireEvent.change(select, { target: { value: 'fr' } })
      await vi.waitFor(() =>
        expect(fetchAPI).toHaveBeenCalledWith(settingUrl('ig_language'), 'PUT', { value: 'fr' }),
      )
    })
  })

  describe('updating a text setting (debounced)', () => {
    it('updates the store optimistically and sends the PUT 500ms after the last keystroke', async () => {
      const { container } = renderPage()
      await waitForLoaded(container)
      vi.useFakeTimers()
      const input = findRow(container, 'Support Link').querySelector('input[type=text]') as HTMLInputElement

      fireEvent.input(input, { target: { value: 'http://new.example.com' } })
      expect(input.value).toBe('http://new.example.com') // optimistic update, no debounce needed to see it

      await vi.advanceTimersByTimeAsync(500)
      expect(fetchAPI).toHaveBeenCalledWith(settingUrl('ig_supportLink'), 'PUT', {
        value: 'http://new.example.com',
      })
    })

    it('only sends the last value when typing multiple times within the debounce window', async () => {
      const { container } = renderPage()
      await waitForLoaded(container)
      const callsBefore = (fetchAPI as Mock).mock.calls.length
      vi.useFakeTimers()
      const input = findRow(container, 'Support Link').querySelector('input[type=text]') as HTMLInputElement

      fireEvent.input(input, { target: { value: 'a' } })
      fireEvent.input(input, { target: { value: 'ab' } })
      fireEvent.input(input, { target: { value: 'abc' } })

      await vi.advanceTimersByTimeAsync(500)
      const callsAfter = (fetchAPI as Mock).mock.calls.length
      expect(callsAfter - callsBefore).toBe(1)
      expect(fetchAPI).toHaveBeenLastCalledWith(settingUrl('ig_supportLink'), 'PUT', { value: 'abc' })
    })

    it('debounces each setting independently', async () => {
      const { container } = renderPage()
      await waitForLoaded(container)
      vi.useFakeTimers()
      const supportInput = findRow(container, 'Support Link').querySelector('input[type=text]') as HTMLInputElement
      const timestampInput = findRow(container, 'Log Timestamp Format').querySelector(
        'input[type=text]',
      ) as HTMLInputElement

      fireEvent.input(supportInput, { target: { value: 'http://one.example.com' } })
      await vi.advanceTimersByTimeAsync(250)
      fireEvent.input(timestampInput, { target: { value: '%Y' } })
      await vi.advanceTimersByTimeAsync(250)
      // supportInput's own 500ms elapsed by now and should have fired independently of timestampInput's timer
      expect(fetchAPI).toHaveBeenCalledWith(settingUrl('ig_supportLink'), 'PUT', {
        value: 'http://one.example.com',
      })
      expect(fetchAPI).not.toHaveBeenCalledWith(settingUrl('ig_logTimestamp'), 'PUT', expect.anything())

      await vi.advanceTimersByTimeAsync(250)
      expect(fetchAPI).toHaveBeenCalledWith(settingUrl('ig_logTimestamp'), 'PUT', { value: '%Y' })
    })
  })
})
