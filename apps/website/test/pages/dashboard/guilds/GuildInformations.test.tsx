import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { cleanup, fireEvent, screen } from '@solidjs/testing-library'
import { historyAt, renderWithProviders } from '../../../testUtils.js'
import { okJson, errJson } from './servers/testHelpers.js'

vi.mock('../../../../src/utils/api.js', () => ({
  fetchAPI: vi.fn(),
  getAPIUrl: vi.fn(),
  getUrlWithActualParams: vi.fn((s: string) => s),
}))

vi.mock('../../../../src/components/layout/Errors.js', () => ({
  Errors: vi.fn(),
}))

const { fetchAPI } = await import('../../../../src/utils/api.js')
const { Errors } = await import('../../../../src/components/layout/Errors.js')
const guildInformationsModule = await import('../../../../src/pages/dashboard/guilds/GuildInformations.js')
const GuildInformations = guildInformationsModule.default
const { guildChannels, guildChannelsRefetch } = guildInformationsModule

const ROLES_URL = '/users/:discordID/guilds/:guildID/roles'
const CHANNELS_URL = '/users/:discordID/guilds/:guildID/channels'
const ADMINS_URL = '/users/:discordID/guilds/:guildID/admins'
const BOT_URL = '/users/:discordID/guilds/:guildID/bot'
const GUILD_GMOD_STORE_URL = '/users/:discordID/guilds/:guildID/gmod-store'
const GMOD_STORE_URL = '/users/:discordID/gmod-store'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function defaultAdmins() {
  return [
    { id: 1, name: 'Admin One', avatar: 'a1' },
    { id: 2, name: 'Admin Two', avatar: 'a2' },
  ]
}

function setupFetchAPI({
  admins = defaultAdmins(),
  bot = { active: false },
  gmodStorePurchase = {},
}: { admins?: unknown; bot?: unknown; gmodStorePurchase?: unknown } = {}) {
  ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
    if (endpoint === ROLES_URL && method === 'GET') return Promise.resolve(okJson([]))
    if (endpoint === CHANNELS_URL && method === 'GET') return Promise.resolve(okJson([]))
    if (endpoint === ADMINS_URL && method === 'GET') return Promise.resolve(okJson(admins))
    if (endpoint === BOT_URL && method === 'GET') return Promise.resolve(okJson(bot))
    if (endpoint === GMOD_STORE_URL && method === 'GET') return Promise.resolve(okJson(gmodStorePurchase))
    return Promise.resolve(okJson({}))
  })
}

function renderPage(path = '/dashboard/guilds/g1/config') {
  const history = historyAt(path)
  const result = renderWithProviders(() => <GuildInformations />, {
    path: '/dashboard/guilds/:guildID/config',
    history,
  })
  return { ...result, history }
}

async function waitForAdminsLoaded() {
  await vi.waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument())
}

describe('pages/dashboard/guilds/GuildInformations.tsx', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', name: 'My Guild', isPremium: false }))
    ;(fetchAPI as Mock).mockReset()
    ;(Errors as Mock).mockReset()
    setupFetchAPI()
  })

  it('renders guild name, id and the joined admin list once loaded', async () => {
    renderPage()
    await waitForAdminsLoaded()
    expect(screen.getByText('My Guild')).toBeInTheDocument()
    expect(screen.getByText('g1')).toBeInTheDocument()
    expect(screen.getByText('Admin One, Admin Two')).toBeInTheDocument()
  })

  it('shows "Loading..." for admins while the admins request is pending', () => {
    ;(fetchAPI as Mock).mockImplementation((endpoint: string) => {
      if (endpoint === ADMINS_URL) return new Promise(() => {})
      return Promise.resolve(okJson([]))
    })
    renderPage()
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('shows a check icon when the guild is premium, a times icon otherwise', async () => {
    const { container, unmount } = renderPage()
    await waitForAdminsLoaded()
    expect(container.querySelector('.fa-times')).toBeInTheDocument()
    expect(container.querySelector('.fa-check.text-success')).not.toBeInTheDocument()
    unmount()

    window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', name: 'My Guild', isPremium: true }))
    const { container: container2 } = renderPage()
    await waitForAdminsLoaded()
    expect(container2.querySelector('.fa-check.text-success')).toBeInTheDocument()
  })

  it('shows an empty (not crashed) admin list when the admins GET responds with a non-ok status', async () => {
    ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
      if (endpoint === ADMINS_URL && method === 'GET') return Promise.resolve(errJson())
      if (endpoint === BOT_URL && method === 'GET') return Promise.resolve(okJson({ active: false }))
      if (endpoint === GMOD_STORE_URL && method === 'GET') return Promise.resolve(okJson({}))
      return Promise.resolve(okJson([]))
    })
    renderPage()
    await waitForAdminsLoaded()
    expect(screen.getByText('Admins:').parentElement!.textContent).toBe('Admins:')
  })

  it('resolves the shared guildChannels resource to [] (not a crash) on a non-ok channels response', async () => {
    ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
      if (endpoint === CHANNELS_URL) return Promise.resolve(errJson())
      if (endpoint === ADMINS_URL) return Promise.resolve(okJson(defaultAdmins()))
      if (endpoint === BOT_URL) return Promise.resolve(okJson({ active: false }))
      if (endpoint === GMOD_STORE_URL) return Promise.resolve(okJson({}))
      return Promise.resolve(okJson([]))
    })
    renderPage()
    await waitForAdminsLoaded()
    await guildChannelsRefetch()
    await vi.waitFor(() => expect(guildChannels()).toEqual([]))
  })

  it('shows neither gmod-store panel when the guild has no gmod-store purchase', async () => {
    renderPage()
    await waitForAdminsLoaded()
    expect(screen.queryByText('Activate Gmod Store Premium')).not.toBeInTheDocument()
    expect(screen.queryByText('Deactivate Gmod Store Premium')).not.toBeInTheDocument()
  })

  it('does not crash and shows neither panel when the gmod-store response body is falsy/malformed', async () => {
    ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
      if (endpoint === ADMINS_URL && method === 'GET') return Promise.resolve(okJson(defaultAdmins()))
      if (endpoint === BOT_URL && method === 'GET') return Promise.resolve(okJson({ active: false }))
      // Malformed body: `res.json()` resolves to `null`, exercising the `(await res.json()) || {}`
      // fallback fixed in GuildInformations.tsx (was dead code as `res.json() || {}`).
      if (endpoint === GMOD_STORE_URL && method === 'GET') return Promise.resolve(okJson(null))
      return Promise.resolve(okJson([]))
    })
    renderPage()
    await waitForAdminsLoaded()
    expect(screen.getByText('My Guild')).toBeInTheDocument()
    expect(screen.queryByText('Activate Gmod Store Premium')).not.toBeInTheDocument()
    expect(screen.queryByText('Deactivate Gmod Store Premium')).not.toBeInTheDocument()
  })

  describe('activate gmod store premium', () => {
    function setupActivatable() {
      setupFetchAPI({ bot: { active: false }, gmodStorePurchase: { steamID64: 's1' } })
    }

    it('shows the activate panel and activates on click, navigating to /dashboard/guilds', async () => {
      setupActivatable()
      const { history } = renderPage()
      await waitForAdminsLoaded()
      const btn = await screen.findByText('Activate Gmod Store Premium')

      const activated = { active: true }
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === GUILD_GMOD_STORE_URL && method === 'POST') return Promise.resolve(okJson(activated))
        return Promise.resolve(okJson({}))
      })
      await fireEvent.click(btn)
      await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(GUILD_GMOD_STORE_URL, 'POST'))
      await vi.waitFor(() => expect(history.get()).toBe('/dashboard/guilds'))
    })

    it('reports an error and does not navigate when activation fails', async () => {
      setupActivatable()
      const { history } = renderPage()
      await waitForAdminsLoaded()
      const btn = await screen.findByText('Activate Gmod Store Premium')

      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === GUILD_GMOD_STORE_URL && method === 'POST') return Promise.resolve(errJson())
        return Promise.resolve(okJson({}))
      })
      await fireEvent.click(btn)
      await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(GUILD_GMOD_STORE_URL, 'POST'))
      expect(Errors).toHaveBeenCalledWith('An error occurred while activating the bot.')
      expect(history.get()).toBe('/dashboard/guilds/g1/config')
    })

    it('does not crash and hides the activate panel when the bot resource errors', async () => {
      // Bug fix regression test: `!bot().active` used to be read unguarded, so once the bot
      // resource settled into an error state, evaluating `bot()` re-threw and crashed the render.
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === ADMINS_URL) return Promise.resolve(okJson(defaultAdmins()))
        if (endpoint === BOT_URL) return Promise.resolve(errJson())
        if (endpoint === GMOD_STORE_URL) return Promise.resolve(okJson({ steamID64: 's1' }))
        return Promise.resolve(okJson([]))
      })
      renderPage()
      await waitForAdminsLoaded()
      expect(screen.getByText('My Guild')).toBeInTheDocument()
      expect(screen.queryByText('Activate Gmod Store Premium')).not.toBeInTheDocument()
    })
  })

  describe('deactivate gmod store premium', () => {
    it('shows the reinvite warning and Invite Main Bot when hasMainBot is false, disabling Deactivate', async () => {
      setupFetchAPI({
        bot: { active: true },
        gmodStorePurchase: { steamID64: 's1', guild: 'g1', hasMainBot: false },
      })
      renderPage()
      await waitForAdminsLoaded()
      expect(await screen.findByText(/Before removing the Gmod Store Premium/)).not.toHaveClass('hidden')
      expect(screen.getByText('Invite Main Bot')).toBeInTheDocument()
      expect(screen.getByText('Deactivate Gmod Store Premium')).toHaveClass('btn-disabled')
    })

    it('hides the reinvite warning and Invite Main Bot when hasMainBot is true, enabling Deactivate', async () => {
      setupFetchAPI({
        bot: { active: true },
        gmodStorePurchase: { steamID64: 's1', guild: 'g1', hasMainBot: true },
      })
      renderPage()
      await waitForAdminsLoaded()
      expect(await screen.findByText(/Before removing the Gmod Store Premium/)).toHaveClass('hidden')
      expect(screen.queryByText('Invite Main Bot')).not.toBeInTheDocument()
      expect(screen.getByText('Deactivate Gmod Store Premium')).not.toHaveClass('btn-disabled')
    })

    it('deactivates on click, navigating to /dashboard/guilds', async () => {
      setupFetchAPI({
        bot: { active: true },
        gmodStorePurchase: { steamID64: 's1', guild: 'g1', hasMainBot: true },
      })
      const { history } = renderPage()
      await waitForAdminsLoaded()
      const btn = await screen.findByText('Deactivate Gmod Store Premium')

      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === GUILD_GMOD_STORE_URL && method === 'DELETE') return Promise.resolve(okJson({}))
        return Promise.resolve(okJson({}))
      })
      await fireEvent.click(btn)
      await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(GUILD_GMOD_STORE_URL, 'DELETE'))
      await vi.waitFor(() => expect(history.get()).toBe('/dashboard/guilds'))
    })

    it('reports an error and does not navigate when deactivation fails', async () => {
      setupFetchAPI({
        bot: { active: true },
        gmodStorePurchase: { steamID64: 's1', guild: 'g1', hasMainBot: true },
      })
      const { history } = renderPage()
      await waitForAdminsLoaded()
      const btn = await screen.findByText('Deactivate Gmod Store Premium')

      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === GUILD_GMOD_STORE_URL && method === 'DELETE') return Promise.resolve(errJson())
        return Promise.resolve(okJson({}))
      })
      await fireEvent.click(btn)
      await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(GUILD_GMOD_STORE_URL, 'DELETE'))
      expect(Errors).toHaveBeenCalledWith('An error occurred while deactivating the bot.')
      expect(history.get()).toBe('/dashboard/guilds/g1/config')
    })

    it('does not show the deactivate panel when the purchase belongs to a different guild', async () => {
      setupFetchAPI({
        bot: { active: true },
        gmodStorePurchase: { steamID64: 's1', guild: 'other-guild', hasMainBot: true },
      })
      renderPage()
      await waitForAdminsLoaded()
      expect(screen.queryByText('Deactivate Gmod Store Premium')).not.toBeInTheDocument()
    })

    it('opens an invite window on click and refetches the purchase once the window closes', async () => {
      vi.useFakeTimers()
      setupFetchAPI({
        bot: { active: true },
        gmodStorePurchase: { steamID64: 's1', guild: 'g1', hasMainBot: false },
      })
      renderPage()
      await waitForAdminsLoaded()
      const inviteBtn = await screen.findByText('Invite Main Bot')

      const fakeWindow = { closed: false } as Window
      const openSpy = vi.spyOn(window, 'open').mockReturnValue(fakeWindow)
      const callsBefore = (fetchAPI as Mock).mock.calls.length

      await fireEvent.click(inviteBtn)
      expect(openSpy).toHaveBeenCalledWith('/invite&guild_id=g1', '_blank', 'width=600,height=900')

      fakeWindow.closed = true
      await vi.advanceTimersByTimeAsync(500)

      expect((fetchAPI as Mock).mock.calls.length).toBeGreaterThan(callsBefore)
    })
  })
})
