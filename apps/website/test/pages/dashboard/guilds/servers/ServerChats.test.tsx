import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@solidjs/testing-library'
import { ErrorBoundary } from 'solid-js/web'
import { historyAt, renderWithProviders } from '../../../../testUtils.js'
import { okJson, errJson, stubDialogGlobal, clearDialogGlobals } from './testHelpers.js'

vi.mock('../../../../../src/utils/api.js', () => ({
  fetchAPI: vi.fn(() => Promise.resolve({ ok: true, json: async () => [] })),
  getAPIUrl: vi.fn(),
  getUrlWithActualParams: vi.fn((s: string) => s),
}))

const { fetchAPI } = await import('../../../../../src/utils/api.js')
const { guildChannelsMutate } = await import('../../../../../src/pages/dashboard/guilds/GuildInformations.js')
const { default: ServerChats } = await import('../../../../../src/pages/dashboard/guilds/servers/ServerChats.js')

const CHATS_URL = '/users/:discordID/guilds/:guildID/servers/:serverID/chats'
const PSEUDO_DIRECTION_URL = '/users/:discordID/guilds/:guildID/servers/:serverID/settings/syncChatDirection'
const RELAY_ALL_URL = '/users/:discordID/guilds/:guildID/servers/:serverID/settings/chat_sync_relay_all'
const PREVENT_PING_URL = '/users/:discordID/guilds/:guildID/servers/:serverID/settings/sync_chat_prevent_ping'
const FILTERS_URL = '/users/:discordID/guilds/:guildID/servers/:serverID/chats/filters'
const CHANNELS_URL = '/users/:discordID/guilds/:guildID/channels'

function filterRule(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    element: 'message',
    operator: 'contain',
    trigger: 'hello',
    action: 'relay',
    active: true,
    ...overrides,
  }
}

function defaultFetch(overrides: Record<string, unknown> = {}) {
  const map: Record<string, unknown> = {
    [CHATS_URL]: {},
    [PSEUDO_DIRECTION_URL]: { value: 'gmodToDiscord' },
    [RELAY_ALL_URL]: { value: true },
    [PREVENT_PING_URL]: { value: false },
    [FILTERS_URL]: [],
    [CHANNELS_URL]: [{ id: 'c1', name: 'general', type: 0, position: 0, parentID: null }],
    ...overrides,
  }
  ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
    if (method === 'GET' && Object.prototype.hasOwnProperty.call(map, endpoint)) {
      return Promise.resolve(okJson(map[endpoint]))
    }
    return Promise.resolve(okJson({}))
  })
}

function renderPage() {
  return renderWithProviders(() => <ServerChats />, {
    path: '/dashboard/guilds/:guildID/config/servers/:serverID/chats',
    history: historyAt('/dashboard/guilds/g1/config/servers/s1/chats'),
  })
}

async function waitForLoaded(container: HTMLElement) {
  await vi.waitFor(() => {
    const select = within(container.querySelector('.border-base-200') as HTMLElement).getAllByRole('combobox')[0]
    expect(select).not.toBeDisabled()
  })
}

afterEach(() => {
  cleanup()
  clearDialogGlobals('select_channel_modal', 'edit_rule_modal')
})

describe('pages/dashboard/guilds/servers/ServerChats.tsx', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: true }))
    guildChannelsMutate([{ id: 'c1', name: 'general', type: 0, position: 0, parentID: null }])
    ;(fetchAPI as Mock).mockReset()
    defaultFetch()
  })

  it('renders the websocket notice and both panel titles', () => {
    renderPage()
    expect(screen.getByText('GWSocket')).toBeInTheDocument()
    expect(screen.getByText('Chats')).toBeInTheDocument()
    expect(screen.getByText('Gmod to Discord Filter')).toBeInTheDocument()
  })

  describe('sync chats channel', () => {
    it('shows "No Sync Chats" when there is no configured channel', async () => {
      renderPage()
      await vi.waitFor(() => expect(screen.getByText('No Sync Chats')).toBeInTheDocument())
    })

    it('falls back to an empty object (still shows "No Sync Chats") when the chats GET fails', async () => {
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === CHATS_URL && method === 'GET') return Promise.resolve(errJson())
        if (endpoint === CHANNELS_URL && method === 'GET') return Promise.resolve(okJson([]))
        if (method === 'GET') return Promise.resolve(okJson({}))
        return Promise.resolve(okJson({}))
      })
      renderPage()
      await vi.waitFor(() => expect(screen.getByText('No Sync Chats')).toBeInTheDocument())
    })

    it('renders the discord channel once a chat channel is configured', async () => {
      defaultFetch({ [CHATS_URL]: { channel: 'c1' } })
      renderPage()
      await vi.waitFor(() => expect(screen.getByText('#general')).toBeInTheDocument())
      expect(screen.queryByText('No Sync Chats')).not.toBeInTheDocument()
    })

    it('shows the Remove Channel button only when a channel is configured', async () => {
      defaultFetch({ [CHATS_URL]: { channel: 'c1' } })
      renderPage()
      await vi.waitFor(() => expect(screen.getByText('Remove Channel')).toBeInTheDocument())
    })

    it('does not show the Remove Channel button when there is no channel', async () => {
      renderPage()
      await vi.waitFor(() => expect(screen.getByText('No Sync Chats')).toBeInTheDocument())
      expect(screen.queryByText('Remove Channel')).not.toBeInTheDocument()
    })

    it('removes the channel on click and reverts to "No Sync Chats"', async () => {
      defaultFetch({ [CHATS_URL]: { channel: 'c1' } })
      renderPage()
      await vi.waitFor(() => expect(screen.getByText('Remove Channel')).toBeInTheDocument())
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === CHATS_URL && method === 'DELETE') return Promise.resolve(okJson({}))
        return Promise.resolve(okJson({}))
      })
      await fireEvent.click(screen.getByText('Remove Channel'))
      await vi.waitFor(() => expect(screen.getByText('No Sync Chats')).toBeInTheDocument())
    })

    it('does not remove the channel when the DELETE fails', async () => {
      defaultFetch({ [CHATS_URL]: { channel: 'c1' } })
      renderPage()
      await vi.waitFor(() => expect(screen.getByText('Remove Channel')).toBeInTheDocument())
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === CHATS_URL && method === 'DELETE') return Promise.resolve(errJson())
        return Promise.resolve(okJson({}))
      })
      await fireEvent.click(screen.getByText('Remove Channel'))
      await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(CHATS_URL, 'DELETE'))
      expect(screen.getByText('Remove Channel')).toBeInTheDocument()
    })

    it('opens the select channel modal and refetches guild channels', async () => {
      const { container } = renderPage()
      await vi.waitFor(() => expect(screen.getByText('No Sync Chats')).toBeInTheDocument())
      stubDialogGlobal(container, 'select_channel_modal')
      await fireEvent.click(screen.getByText('Select Channel'))
      expect(container.querySelector('#select_channel_modal')?.hasAttribute('open')).toBe(true)
    })

    it('sends the selected channel and mutates on success', async () => {
      const { container } = renderPage()
      await vi.waitFor(() => expect(screen.getByText('No Sync Chats')).toBeInTheDocument())
      const select = container.querySelector('#select_channel_modal select.select') as HTMLSelectElement
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === CHATS_URL && method === 'POST') return Promise.resolve(okJson({ channel: 'c1' }))
        return Promise.resolve(okJson({}))
      })
      await fireEvent.change(select, { target: { value: 'c1' } })
      await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(CHATS_URL, 'POST', { channelID: 'c1' }))
      await vi.waitFor(() => expect(screen.getByText('#general')).toBeInTheDocument())
    })

    it('does not mutate when sending the selected channel fails', async () => {
      const { container } = renderPage()
      await vi.waitFor(() => expect(screen.getByText('No Sync Chats')).toBeInTheDocument())
      const select = container.querySelector('#select_channel_modal select.select') as HTMLSelectElement
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === CHATS_URL && method === 'POST') return Promise.resolve(errJson())
        return Promise.resolve(okJson({}))
      })
      await fireEvent.change(select, { target: { value: 'c1' } })
      await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(CHATS_URL, 'POST', { channelID: 'c1' }))
      expect(screen.getByText('No Sync Chats')).toBeInTheDocument()
    })
  })

  describe('sync direction selector', () => {
    it('marks the selected option based on the fetched direction', async () => {
      defaultFetch({ [PSEUDO_DIRECTION_URL]: { value: 'both' } })
      const { container } = renderPage()
      await vi.waitFor(() => {
        const select = within(container.querySelector('.border-base-200') as HTMLElement).getAllByRole('combobox')[0] as HTMLSelectElement
        expect(within(select).getByText('Both Ways', { exact: false })).toHaveProperty('selected', true)
      })
    })

    it('disables discordToGmod and both options for non-premium guilds', async () => {
      window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: false }))
      const { container } = renderPage()
      await waitForLoaded(container)
      const select = within(container.querySelector('.border-base-200') as HTMLElement).getAllByRole('combobox')[0] as HTMLSelectElement
      const options = within(select).getAllByRole('option') as HTMLOptionElement[]
      expect(options.find((o) => o.value === 'discordToGmod')).toBeDisabled()
      expect(options.find((o) => o.value === 'both')).toBeDisabled()
      expect(options.find((o) => o.value === 'gmodToDiscord')).not.toBeDisabled()
    })

    it('sends the new direction on change and mutates on success', async () => {
      const { container } = renderPage()
      await waitForLoaded(container)
      const select = within(container.querySelector('.border-base-200') as HTMLElement).getAllByRole('combobox')[0] as HTMLSelectElement
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === PSEUDO_DIRECTION_URL && method === 'PUT') return Promise.resolve(okJson({ value: 'both' }))
        return Promise.resolve(okJson({}))
      })
      await fireEvent.change(select, { target: { value: 'both' } })
      await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(PSEUDO_DIRECTION_URL, 'PUT', { value: 'both' }))
    })

    it('logs and does not throw when updating the direction fails', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { container } = renderPage()
      await waitForLoaded(container)
      const select = within(container.querySelector('.border-base-200') as HTMLElement).getAllByRole('combobox')[0] as HTMLSelectElement
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === PSEUDO_DIRECTION_URL && method === 'PUT') return Promise.resolve(errJson())
        return Promise.resolve(okJson({}))
      })
      await fireEvent.change(select, { target: { value: 'gmodToDiscord' } })
      await vi.waitFor(() => expect(errorSpy).toHaveBeenCalled())
      errorSpy.mockRestore()
    })
  })

  describe('prevent chat ping toggle', () => {
    it('reflects the fetched value and is disabled while loading', () => {
      defaultFetch({ [PREVENT_PING_URL]: new Promise(() => {}) })
      const { container } = renderPage()
      const checkbox = container.querySelectorAll('input[type=checkbox]')[0] as HTMLInputElement
      expect(checkbox).toBeDisabled()
    })

    it('sends the new value on toggle and mutates on success', async () => {
      const { container } = renderPage()
      await vi.waitFor(() =>
        expect(container.querySelectorAll('input[type=checkbox]')[0]).not.toBeDisabled(),
      )
      const checkbox = container.querySelectorAll('input[type=checkbox]')[0] as HTMLInputElement
      expect(checkbox.checked).toBe(false)
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === PREVENT_PING_URL && method === 'PUT') return Promise.resolve(okJson({ value: true }))
        return Promise.resolve(okJson({}))
      })
      await fireEvent.click(checkbox)
      await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(PREVENT_PING_URL, 'PUT', { value: true }))
      await vi.waitFor(() => expect(checkbox.checked).toBe(true))
    })

    it('logs and does not throw when updating fails', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { container } = renderPage()
      await vi.waitFor(() =>
        expect(container.querySelectorAll('input[type=checkbox]')[0]).not.toBeDisabled(),
      )
      const checkbox = container.querySelectorAll('input[type=checkbox]')[0] as HTMLInputElement
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === PREVENT_PING_URL && method === 'PUT') return Promise.resolve(errJson())
        return Promise.resolve(okJson({}))
      })
      await fireEvent.click(checkbox)
      await vi.waitFor(() => expect(errorSpy).toHaveBeenCalled())
      errorSpy.mockRestore()
    })
  })

  describe('gmod to discord filter default behavior', () => {
    it('shows a loading message while relayAll is loading', () => {
      defaultFetch({ [RELAY_ALL_URL]: new Promise(() => {}) })
      renderPage()
      expect(screen.getByText('Loading...')).toBeInTheDocument()
    })

    it('marks the relay-all option selected when true', async () => {
      defaultFetch({ [RELAY_ALL_URL]: { value: true } })
      renderPage()
      await vi.waitFor(() => expect(screen.getByText('Relay All Messages')).toBeInTheDocument())
      expect(within(screen.getByText('Relay All Messages') as HTMLOptionElement).getByText).toBeDefined()
      expect((screen.getByText('Relay All Messages') as HTMLOptionElement).selected).toBe(true)
    })

    it('marks the block-all option selected when false', async () => {
      defaultFetch({ [RELAY_ALL_URL]: { value: false } })
      renderPage()
      await vi.waitFor(() => expect(screen.getByText('Block All Messages')).toBeInTheDocument())
      expect((screen.getByText('Block All Messages') as HTMLOptionElement).selected).toBe(true)
    })

    it('disables the select for non-premium guilds', async () => {
      window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: false }))
      renderPage()
      await vi.waitFor(() => expect(screen.getByText('Relay All Messages')).toBeInTheDocument())
      const select = screen.getByText('Relay All Messages').closest('select') as HTMLSelectElement
      expect(select).toBeDisabled()
    })

    it('sends the new value on change and mutates on success', async () => {
      renderPage()
      await vi.waitFor(() => expect(screen.getByText('Relay All Messages')).toBeInTheDocument())
      const select = screen.getByText('Relay All Messages').closest('select') as HTMLSelectElement
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === RELAY_ALL_URL && method === 'PUT') return Promise.resolve(okJson({ value: false }))
        return Promise.resolve(okJson({}))
      })
      await fireEvent.change(select, { target: { value: 'false' } })
      await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(RELAY_ALL_URL, 'PUT', { value: false }))
    })

    it('logs and does not throw when updating fails', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      renderPage()
      await vi.waitFor(() => expect(screen.getByText('Relay All Messages')).toBeInTheDocument())
      const select = screen.getByText('Relay All Messages').closest('select') as HTMLSelectElement
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === RELAY_ALL_URL && method === 'PUT') return Promise.resolve(errJson())
        return Promise.resolve(okJson({}))
      })
      await fireEvent.change(select, { target: { value: 'false' } })
      await vi.waitFor(() => expect(errorSpy).toHaveBeenCalled())
      errorSpy.mockRestore()
    })
  })

  describe('filter rules table', () => {
    it('shows a loading spinner while filters are loading', () => {
      defaultFetch({ [FILTERS_URL]: new Promise(() => {}) })
      const { container } = renderPage()
      expect(container.querySelector('.loading-spinner')).toBeInTheDocument()
    })

    it('renders a fetched rule row with active marker', async () => {
      defaultFetch({ [FILTERS_URL]: [filterRule()] })
      const { container } = renderPage()
      await vi.waitFor(() => expect(screen.getByText('hello')).toBeInTheDocument())
      expect(screen.getByText('message')).toBeInTheDocument()
      expect(screen.getByText('contain')).toBeInTheDocument()
      expect(screen.getByText('relay')).toBeInTheDocument()
      expect(container.querySelector('tbody .fa-check')).toBeInTheDocument()
    })

    it('shows an inactive marker for a disabled rule', async () => {
      defaultFetch({ [FILTERS_URL]: [filterRule({ active: false })] })
      const { container } = renderPage()
      await vi.waitFor(() => expect(screen.getByText('hello')).toBeInTheDocument())
      expect(container.querySelector('tbody .fa-times')).toBeInTheDocument()
    })

    it('adds a rule and appends it to the list on success', async () => {
      renderPage()
      await vi.waitFor(() => expect(screen.getByText('Add Rule')).not.toBeDisabled())
      const newRule = filterRule({ id: 2, trigger: 'new-trigger' })
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === FILTERS_URL && method === 'POST') return Promise.resolve(okJson(newRule))
        return Promise.resolve(okJson({}))
      })
      await fireEvent.click(screen.getByText('Add Rule'))
      await vi.waitFor(() => expect(screen.getByText('new-trigger')).toBeInTheDocument())
    })

    it('logs and does not throw, and does not add a row, when adding a rule fails', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      renderPage()
      await vi.waitFor(() => expect(screen.getByText('Add Rule')).not.toBeDisabled())
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === FILTERS_URL && method === 'POST') return Promise.resolve(errJson())
        return Promise.resolve(okJson({}))
      })
      await fireEvent.click(screen.getByText('Add Rule'))
      await vi.waitFor(() => expect(errorSpy).toHaveBeenCalled())
      expect(screen.queryAllByRole('row')).toHaveLength(1) // header row only
      errorSpy.mockRestore()
    })

    it('deletes a rule and removes it from the list on success', async () => {
      defaultFetch({ [FILTERS_URL]: [filterRule()] })
      const { container } = renderPage()
      await vi.waitFor(() => expect(screen.getByText('hello')).toBeInTheDocument())
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === `${FILTERS_URL}/1` && method === 'DELETE') return Promise.resolve(okJson({ id: 1 }))
        return Promise.resolve(okJson({}))
      })
      await fireEvent.click(container.querySelector('tbody .fa-trash') as HTMLElement)
      await vi.waitFor(() => expect(screen.queryByText('hello')).not.toBeInTheDocument())
    })

    it('logs and does not throw, and does not remove the row, when deleting fails', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      defaultFetch({ [FILTERS_URL]: [filterRule()] })
      const { container } = renderPage()
      await vi.waitFor(() => expect(screen.getByText('hello')).toBeInTheDocument())
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === `${FILTERS_URL}/1` && method === 'DELETE') return Promise.resolve(errJson())
        return Promise.resolve(okJson({}))
      })
      await fireEvent.click(container.querySelector('tbody .fa-trash') as HTMLElement)
      await vi.waitFor(() => expect(errorSpy).toHaveBeenCalled())
      expect(screen.getByText('hello')).toBeInTheDocument()
      errorSpy.mockRestore()
    })

    describe('premium gating for Add Rule', () => {
      it('enables Add Rule when premium', async () => {
        renderPage()
        await vi.waitFor(() => expect(screen.getByText('Add Rule')).not.toBeDisabled())
      })

      it('disables Add Rule when not premium', async () => {
        window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: false }))
        renderPage()
        await vi.waitFor(() => expect(screen.getByText('Add Rule')).toBeDisabled())
      })
    })

    describe('edit rule modal', () => {
      function renderWithRule() {
        defaultFetch({ [FILTERS_URL]: [filterRule()] })
        return renderPage()
      }

      it('prefills the modal fields from the selected rule and saves the edit, leaving other rows untouched', async () => {
        defaultFetch({ [FILTERS_URL]: [filterRule(), filterRule({ id: 99, trigger: 'untouched' })] })
        const { container } = renderPage()
        await vi.waitFor(() => expect(screen.getByText('hello')).toBeInTheDocument())
        expect(screen.getByText('untouched')).toBeInTheDocument()
        stubDialogGlobal(container, 'edit_rule_modal')
        await fireEvent.click(container.querySelector('tbody .fa-edit') as HTMLElement)

        const modal = container.querySelector('#edit_rule_modal') as HTMLElement
        expect(modal.hasAttribute('open')).toBe(true)
        const triggerInput = within(modal).getByDisplayValue('hello') as HTMLInputElement
        expect(triggerInput).toBeInTheDocument()

        const selects = within(modal).getAllByRole('combobox') as HTMLSelectElement[]
        const [elementSelect, operatorSelect, actionSelect, activeSelect] = selects
        expect(elementSelect.value).toBe('message')
        expect(operatorSelect.value).toBe('contain')
        expect(actionSelect.value).toBe('relay')
        expect(activeSelect.value).toBe('true')

        await fireEvent.change(elementSelect, { target: { value: 'steamID64' } })
        await fireEvent.change(operatorSelect, { target: { value: 'equal' } })
        await fireEvent.input(triggerInput, { target: { value: 'updated-trigger' } })
        await fireEvent.change(actionSelect, { target: { value: 'block' } })
        await fireEvent.change(activeSelect, { target: { value: 'false' } })

        const updated = filterRule({
          element: 'steamID64',
          operator: 'equal',
          trigger: 'updated-trigger',
          action: 'block',
          active: false,
        })
        ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
          if (endpoint === `${FILTERS_URL}/1` && method === 'PUT') return Promise.resolve(okJson(updated))
          return Promise.resolve(okJson({}))
        })
        await fireEvent.click(within(modal).getByText('Save'))
        await vi.waitFor(() =>
          expect(fetchAPI).toHaveBeenCalledWith(`${FILTERS_URL}/1`, 'PUT', {
            id: 1,
            element: 'steamID64',
            operator: 'equal',
            trigger: 'updated-trigger',
            action: 'block',
            active: false,
          }),
        )
        await vi.waitFor(() => expect(screen.getByText('updated-trigger')).toBeInTheDocument())
        expect(screen.getByText('untouched')).toBeInTheDocument()
      })

      it('logs and does not throw, and does not change the row, when saving the edit fails', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        const { container } = renderWithRule()
        await vi.waitFor(() => expect(screen.getByText('hello')).toBeInTheDocument())
        stubDialogGlobal(container, 'edit_rule_modal')
        await fireEvent.click(container.querySelector('tbody .fa-edit') as HTMLElement)
        const modal = container.querySelector('#edit_rule_modal') as HTMLElement
        ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
          if (endpoint === `${FILTERS_URL}/1` && method === 'PUT') return Promise.resolve(errJson())
          return Promise.resolve(okJson({}))
        })
        await fireEvent.click(within(modal).getByText('Save'))
        await vi.waitFor(() => expect(errorSpy).toHaveBeenCalled())
        expect(screen.getByText('hello')).toBeInTheDocument()
        errorSpy.mockRestore()
      })

      it('disables the modal fields while filters are loading', () => {
        defaultFetch({ [FILTERS_URL]: new Promise(() => {}) })
        const { container } = renderPage()
        const modal = container.querySelector('#edit_rule_modal') as HTMLElement
        const selects = within(modal).getAllByRole('combobox', { hidden: true })
        selects.forEach((s) => expect(s).toBeDisabled())
        expect(within(modal).getByRole('textbox', { hidden: true })).toBeDisabled()
        expect(within(modal).getByText('Save')).toBeDisabled()
      })
    })
  })

  describe('falsy JSON body fallback', () => {
    it('falls back to an empty object for pseudoDirection/relayAll/preventChatPing/filters when the response body is null', async () => {
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (
          method === 'GET' &&
          [PSEUDO_DIRECTION_URL, RELAY_ALL_URL, PREVENT_PING_URL, FILTERS_URL].includes(endpoint)
        ) {
          return Promise.resolve({ ok: true, json: async () => null })
        }
        if (endpoint === CHANNELS_URL && method === 'GET') return Promise.resolve(okJson([]))
        return Promise.resolve(okJson({}))
      })
      const { container } = renderPage()
      // gmToDscFilters() falling back to {} (not an array) doesn't crash the <For> (see
      // ServerStatusButtons.tsx's docs for why v8/Solid tolerate a non-array `each`), so the table
      // just renders no rows instead of throwing.
      await vi.waitFor(() => expect(container.querySelector('.loading-spinner')).not.toBeInTheDocument())
      expect(screen.queryAllByRole('row')).toHaveLength(1) // header row only
    })
  })

  describe('resource fetch failures', () => {
    it('throws to the app-level ErrorBoundary when a settings/filters GET fails', async () => {
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === CHATS_URL && method === 'GET') return Promise.resolve(okJson({}))
        if (endpoint === CHANNELS_URL && method === 'GET') return Promise.resolve(okJson([]))
        return Promise.resolve(errJson())
      })
      renderWithProviders(
        () => (
          <ErrorBoundary fallback={(err) => <div data-testid="boundary-error">{err.message}</div>}>
            <ServerChats />
          </ErrorBoundary>
        ),
        {
          path: '/dashboard/guilds/:guildID/config/servers/:serverID/chats',
          history: historyAt('/dashboard/guilds/g1/config/servers/s1/chats'),
        },
      )
      await vi.waitFor(() => expect(screen.getByTestId('boundary-error')).toBeInTheDocument())
    })
  })
})
