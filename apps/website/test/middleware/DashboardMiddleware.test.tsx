import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup } from '@solidjs/testing-library'
import { historyAt, renderWithProviders } from '../testUtils.js'
import { setIsLogged } from '../../src/utils/event.js'
import DashboardMiddleware from '../../src/middleware/DashboardMiddleware.js'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function renderAt(path: string, beforeMount?: () => void) {
  const history = historyAt(path)
  renderWithProviders(
    () => {
      beforeMount?.()
      return <DashboardMiddleware />
    },
    { path: '*', history },
  )
  return history
}

describe('middleware/DashboardMiddleware.tsx', () => {
  beforeEach(() => {
    window.localStorage.clear()
    setIsLogged(true)
  })

  it('redirects to /dashboard/guilds when the path contains a double slash', async () => {
    const history = renderAt('/dashboard/guilds//servers')
    await vi.waitFor(() => expect(history.get()).toBe('/dashboard/guilds'))
  })

  it('redirects to /login with a redirect query when the user is not logged in', async () => {
    setIsLogged(false)
    const history = renderAt('/dashboard/guilds/g1/config')
    await vi.waitFor(() => expect(history.get()).toBe('/login?redirect=%2Fdashboard%2Fguilds%2Fg1%2Fconfig'))
  })

  it('redirects to the rule-specific target when a placeholder has no backing localStorage value', async () => {
    const history = renderAt('/dashboard/guilds/:guildID/config')
    await vi.waitFor(() => expect(history.get()).toBe('/dashboard/guilds'))
  })

  it('redirects to /login when :discordID has no backing localStorage value', async () => {
    const history = renderAt('/login/:discordID/callback')
    await vi.waitFor(() => expect(history.get()).toBe('/login'))
  })

  it('substitutes every placeholder present with its localStorage-backed id and navigates once', async () => {
    window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1' }))
    window.localStorage.setItem('server', JSON.stringify({ id: 's1' }))
    const history = renderAt('/dashboard/guilds/:guildID/config/servers/:serverID')
    await vi.waitFor(() => expect(history.get()).toBe('/dashboard/guilds/g1/config/servers/s1'))
  })

  it('preserves a resolved community route only when its stored context matches', () => {
    localStorage.setItem('guilds', JSON.stringify({ id: 'g1' }))
    const history = renderAt('/dashboard/guilds/g1/config')
    expect(history.get()).toBe('/dashboard/guilds/g1/config')
  })

  it.each([undefined, '{invalid', 'null', '[]', '{}', '{"id":42}', '{"id":"another-guild"}'])(
    'returns a resolved deep link to community selection when its cached community is missing or invalid: %s',
    async (value) => {
      localStorage.setItem('server', JSON.stringify({ id: 's1' }))
      const history = renderAt('/dashboard/guilds/g1/config/servers/s1/informations', () => {
        if (value !== undefined) localStorage.setItem('guilds', value)
      })
      await vi.waitFor(() => expect(history.get()).toBe('/dashboard/guilds'))
    },
  )

  it.each([
    undefined,
    '{invalid',
    'null',
    '[]',
    '{}',
    '{"id":42}',
    '{"id":"other-server"}',
    '{"id":"s1","guild":"other-guild"}',
  ])('returns to the selected community’s server list when a resolved server context is invalid: %s', async (value) => {
    localStorage.setItem('guilds', JSON.stringify({ id: 'g1' }))
    if (value !== undefined) localStorage.setItem('server', value)
    const history = renderAt('/dashboard/guilds/g1/config/servers/s1/informations')
    await vi.waitFor(() => expect(history.get()).toBe('/dashboard/guilds/g1/config/servers'))
  })

  it('preserves a matching resolved server context and does not require its optional legacy guild field', () => {
    localStorage.setItem('guilds', JSON.stringify({ id: 'g1' }))
    localStorage.setItem('server', JSON.stringify({ id: 's1' }))
    const history = renderAt('/dashboard/guilds/g1/config/servers/s1/roles')
    expect(history.get()).toBe('/dashboard/guilds/g1/config/servers/s1/roles')
  })

  it('resolves a missing server placeholder to a concrete server selector, without leaving placeholders in the URL', async () => {
    localStorage.setItem('guilds', JSON.stringify({ id: 'g1' }))
    const history = renderAt('/dashboard/guilds/:guildID/config/servers/:serverID')
    await vi.waitFor(() => expect(history.get()).toBe('/dashboard/guilds/g1/config/servers'))
  })

  it('keeps global selection and administration routes independent of stored community/server objects', () => {
    const history = renderAt('/dashboard/guilds')
    expect(history.get()).toBe('/dashboard/guilds')
    cleanup()
    const admin = renderAt('/dashboard/admins/informations')
    expect(admin.get()).toBe('/dashboard/admins/informations')
  })

  it('handles storage failures by returning to selection without throwing', async () => {
    const history = historyAt('/dashboard/guilds/g1/config')
    // Install the failure after the providers have read their fixture snapshots.
    renderWithProviders(
      () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
          throw new Error('Storage blocked')
        })
        return <DashboardMiddleware />
      },
      { path: '*', history },
    )
    await vi.waitFor(() => expect(history.get()).toBe('/dashboard/guilds'))
  })
})
