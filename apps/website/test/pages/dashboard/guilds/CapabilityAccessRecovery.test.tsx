import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@solidjs/testing-library'
import { MemoryRouter, Route } from '@solidjs/router'
import { Show, type Component } from 'solid-js'
import { AccessProvider } from '../../../../src/components/AccessProvider.js'
import { I18nProvider } from '../../../../src/i18n.js'
import { acceptAuthSession, authSession, resetAuthentication } from '../../../../src/utils/authClient.js'
import { refreshAccess } from '../../../../src/utils/accessEvents.js'
import { historyAt } from '../../../testUtils.js'
import { sessionFixture } from '../../../authFixture.js'
import GuildLinks from '../../../../src/pages/dashboard/guilds/GuildLinks.js'

vi.mock('../../../../src/components/popup/MissingRolePermission.js', () => ({
  default: () => null,
  setRolesToCheck: vi.fn(),
}))

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
const roles = [{ id: '333333333333333333', name: 'Member', color: 0, colorHex: '#000000', position: 1 }]
const snapshot = (server = false) => ({
  guildID: 'g1',
  ...(server ? { serverID: 's1' } : {}),
  premium: false,
  customBot: false,
  state: 'ready',
  sources: [],
  revision: 'access-recovered',
  validUntil: '2099-01-01T00:00:00.000Z',
  usages: {},
})

function renderPage(path: string, pattern: string, Page: Component) {
  return render(() => (
    <MemoryRouter
      history={historyAt(path)}
      root={(props) => (
        <I18nProvider>
          <AccessProvider>{props.children}</AccessProvider>
        </I18nProvider>
      )}
    >
      <Route
        path={pattern}
        component={() => (
          <Show when={authSession()}>
            <Page />
          </Show>
        )}
      />
    </MemoryRouter>
  ))
}

beforeEach(() => {
  localStorage.clear()
  resetAuthentication()
  localStorage.setItem('guilds', JSON.stringify({ id: 'g1', name: 'Community' }))
  localStorage.setItem('server', JSON.stringify({ id: 's1', guild: 'g1' }))
})
afterEach(() => {
  cleanup()
  resetAuthentication()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('capability recovery beyond status', () => {
  it('waits for the restored actor before the shared role metadata read and enables a direct server mapping page', async () => {
    const path = '/dashboard/guilds/g1/config/servers/s1/roles'
    window.history.replaceState({}, '', path)
    localStorage.setItem('discordID', 'stale-user')
    let finishSession!: (response: Response) => void
    const session = new Promise<Response>((resolve) => {
      finishSession = resolve
    })
    const metadataReads: string[] = []
    const network = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/v6/auth/session')) return session
      if (url.endsWith('/access')) return authSession() ? json(snapshot(true)) : json({}, 401)
      if (url.endsWith('/v3/users/u1/guilds/g1/roles')) {
        metadataReads.push(url)
        return json(roles)
      }
      if (url.endsWith('/v3/users/u1/guilds/g1/channels')) {
        metadataReads.push(url)
        return json([])
      }
      if (url.endsWith('/servers/s1/roles')) return json([])
      if (url.endsWith('/settings/sync_role_direction')) return json({ value: 'gmod-to-discord' })
      throw new Error(`Unexpected test request ${init?.method || 'GET'} ${url}`)
    })
    vi.stubGlobal('fetch', network)
    // This module starts shared role/channel resources before a protected page can mount.
    await import('../../../../src/pages/dashboard/guilds/GuildInformations.js')
    await vi.waitFor(() =>
      expect(network.mock.calls.some(([url]) => String(url).endsWith('/v6/auth/session'))).toBe(true),
    )
    expect(metadataReads).toHaveLength(0)
    const { default: ServerRoles } = await import('../../../../src/pages/dashboard/guilds/servers/ServerRoles.js')
    renderPage(path, '/dashboard/guilds/:guildID/config/servers/:serverID/roles', ServerRoles)
    finishSession(json(sessionFixture()))
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Add role mapping' })).toBeEnabled())
    expect(metadataReads).toHaveLength(2)
    expect(network.mock.calls.every(([url]) => !String(url).includes('/users/stale-user/'))).toBe(true)
    expect(network.mock.calls.every(([, init]) => ['GET', 'HEAD'].includes(init?.method || 'GET'))).toBe(true)
    expect(screen.getByText('0 / 4 used')).toBeInTheDocument()
  })

  it('keeps a community link creation draft while access fails and recovers from the nearby retry', async () => {
    const path = '/dashboard/guilds/g1/config/links'
    window.history.replaceState({}, '', path)
    acceptAuthSession(sessionFixture())
    let failed = false
    const network = vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/access')) return failed ? json({}, 503) : json(snapshot())
      if (url.endsWith('/v3/users/u1/guilds/g1/links')) return json([])
      throw new Error(`Unexpected test request ${url}`)
    })
    vi.stubGlobal('fetch', network)
    renderPage(path, '/dashboard/guilds/:guildID/config/links', GuildLinks)
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Add Link' })).toBeEnabled())
    await fireEvent.click(screen.getByRole('button', { name: 'Add Link' }))
    const dialog = document.getElementById('edit_select_link') as HTMLDialogElement
    const modal = within(dialog)
    await fireEvent.input(modal.getByLabelText(/^Alias/), { target: { value: 'Keep this shortcut' } })
    await fireEvent.input(modal.getByLabelText(/^URL/), { target: { value: 'https://example.com/help' } })
    expect(modal.getByRole('button', { name: 'Create' })).toBeEnabled()
    failed = true
    refreshAccess()
    await vi.waitFor(() => expect(modal.getByRole('button', { name: 'Create' })).toBeDisabled())
    await vi.waitFor(() => expect(modal.getByRole('status')).toHaveTextContent('Access could not be verified'))
    expect(dialog.open).toBe(true)
    expect(modal.getByLabelText(/^Alias/)).toHaveValue('Keep this shortcut')
    expect(modal.getByLabelText(/^URL/)).toHaveValue('https://example.com/help')
    failed = false
    await fireEvent.click(modal.getByRole('button', { name: 'Try again' }))
    await vi.waitFor(() => expect(modal.getByRole('button', { name: 'Create' })).toBeEnabled())
    expect(dialog.open).toBe(true)
    expect(modal.getByLabelText(/^Alias/)).toHaveValue('Keep this shortcut')
    expect(modal.getByLabelText(/^URL/)).toHaveValue('https://example.com/help')
    expect(network.mock.calls.filter(([url]) => String(url).endsWith('/access'))).toHaveLength(3)
    expect(network.mock.calls.every(([, init]) => ['GET', 'HEAD'].includes(init?.method || 'GET'))).toBe(true)
  })
})
