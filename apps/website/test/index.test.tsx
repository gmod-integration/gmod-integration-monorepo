import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { screen } from '@solidjs/testing-library'
import { Suspense, type ParentComponent } from 'solid-js'
import { useParams } from '@solidjs/router'
import type * as SolidWeb from 'solid-js/web'

const mount = vi.hoisted(() => ({ dispose: undefined as (() => void) | undefined }))
vi.mock('solid-js/web', async (importOriginal) => {
  const actual = await importOriginal<typeof SolidWeb>()
  return {
    ...actual,
    render: (...args: Parameters<typeof SolidWeb.render>) => {
      mount.dispose = actual.render(...args)
      return mount.dispose
    },
  }
})

vi.mock('../src/app/App.js', () => ({
  App: ((props) => (
    <main>
      <Suspense fallback={<p role="status">Loading route</p>}>{props.children}</Suspense>
    </main>
  )) satisfies ParentComponent,
}))
vi.mock('../src/app/AppDashboard.js', () => ({
  AppDashboard: ((props) => <section data-testid="guild-shell">{props.children}</section>) satisfies ParentComponent,
}))
vi.mock('../src/app/AppAdminDashboard.js', () => ({
  AppAdminDashboard: ((props) => (
    <section data-testid="admin-shell">{props.children}</section>
  )) satisfies ParentComponent,
}))

// Exercise the entrypoint's real BrowserRouter and lazy imports. Lightweight destination
// components keep these tests about URL matching, route parameters and layout nesting;
// each page's API calls and authentication are covered in its own component tests.
const publicRoutes = [
  ['/', 'pages/Home'],
  ['/premium', 'pages/Premium'],
  ['/account', 'pages/Account'],
  ['/profile', 'pages/PlayerProfile'],
  ['/players/76561198000000001', 'pages/PlayerProfile'],
  ['/players/333650866747867137', 'pages/PlayerProfile'],
  ['/players/discord/333650866747867137', 'pages/PlayerProfile'],
  ['/players/steam/76561198000000001', 'pages/PlayerProfile'],
  ['/legal/privacy', 'pages/legal/Privacy'],
  ['/legal/terms', 'pages/legal/Terms'],
  ['/login', 'pages/Login'],
  ['/logout', 'pages/Logout'],
  ['/servers', 'pages/Servers'],
  ['/notifications', 'pages/Notifications'],
  ['/dashboard/guilds', 'pages/dashboard/guilds/GuildsSelector'],
] as const

const guildRoutes = [
  ['/config', 'pages/dashboard/guilds/GuildInformations'],
  ['/config/bot', 'pages/dashboard/guilds/GuildBot'],
  ['/config/links', 'pages/dashboard/guilds/GuildLinks'],
  ['/config/bans', 'pages/dashboard/guilds/GuildBans'],
  ['/config/verification', 'pages/dashboard/guilds/GuildVerifications'],
  ['/config/auto-role', 'pages/dashboard/guilds/GuildAutoRoles'],
  ['/config/servers', 'pages/dashboard/guilds/servers/ServersSelector'],
] as const

const serverRoutes = [
  ['', 'pages/dashboard/guilds/servers/ServerInformations'],
  ['/config', 'pages/dashboard/guilds/servers/ServerConfig'],
  ['/status', 'pages/dashboard/guilds/servers/status/ServerStatus'],
  ['/map', 'pages/dashboard/guilds/servers/ServerMap'],
  ['/players', 'pages/dashboard/guilds/servers/ServerPlayers'],
  ['/votes', 'pages/dashboard/guilds/servers/ServerVote'],
  ['/roles', 'pages/dashboard/guilds/servers/ServerRoles'],
  ['/teams', 'pages/dashboard/guilds/servers/ServerTeam'],
  ['/chats', 'pages/dashboard/guilds/servers/ServerChats'],
  ['/logs', 'pages/dashboard/guilds/servers/logs/ServerLogs'],
  ['/errors', 'pages/dashboard/guilds/servers/errors/ServerErrors'],
  ['/warns', 'pages/dashboard/guilds/servers/ServerWarns'],
  ['/pseudo', 'pages/dashboard/guilds/servers/ServerPseudo'],
  ['/screenshots', 'pages/dashboard/guilds/servers/screenshots/ServerScreenshots'],
  ['/bugs', 'pages/dashboard/guilds/servers/ServerBugs'],
] as const

const adminRoutes = [
  ['/informations', 'pages/dashboard/admins/AdminInformations'],
  ['/guilds', 'pages/dashboard/admins/GuildList'],
  ['/impersonate', 'pages/dashboard/admins/Impersonate'],
  ['/stop-impersonate', 'pages/dashboard/admins/Impersonate'],
] as const

let root: HTMLDivElement
beforeAll(async () => {
  const modules = new Set([
    ...publicRoutes.map(([, module]) => module),
    ...guildRoutes.map(([, module]) => module),
    ...serverRoutes.map(([, module]) => module),
    ...adminRoutes.map(([, module]) => module),
    'pages/NotFound',
  ])
  for (const module of modules) {
    vi.doMock(`../src/${module}.js`, () => ({
      default: () => {
        const params = useParams()
        return (
          <>
            <h1>{module}</h1>
            <output aria-label="Community identifier">{params.guildID || ''}</output>
            <output aria-label="Server identifier">{params.serverID || ''}</output>
          </>
        )
      },
    }))
  }
  window.history.replaceState(null, '', '/')
  root = document.createElement('div')
  root.id = 'root'
  document.body.append(root)
  await import('../src/index.js')
})

afterAll(() => {
  mount.dispose?.()
  root.remove()
  window.history.replaceState(null, '', '/')
})

async function visit(path: string, destination: string) {
  window.history.pushState(null, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
  await vi.waitFor(() => expect(screen.getByRole('heading', { name: destination })).toBeInTheDocument())
  expect(window.location.pathname).toBe(path)
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
}

describe('website entrypoint routing', () => {
  it.each(publicRoutes)('opens the public route %s without a dashboard layout', async (path, destination) => {
    await visit(path, destination)
    expect(screen.queryByTestId('guild-shell')).not.toBeInTheDocument()
    expect(screen.queryByTestId('admin-shell')).not.toBeInTheDocument()
  })

  it.each(guildRoutes)('opens community route %s inside the guild dashboard', async (suffix, destination) => {
    await visit(`/dashboard/guilds/community-42${suffix}`, destination)
    expect(screen.getByTestId('guild-shell')).toContainElement(screen.getByRole('heading', { name: destination }))
    expect(screen.queryByTestId('admin-shell')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Community identifier')).toHaveTextContent('community-42')
    expect(screen.getByLabelText('Server identifier')).toBeEmptyDOMElement()
  })

  it.each(serverRoutes)(
    'opens server route %s with both community and server parameters',
    async (suffix, destination) => {
      await visit(`/dashboard/guilds/community-42/config/servers/server-7${suffix}`, destination)
      expect(screen.getByTestId('guild-shell')).toContainElement(screen.getByRole('heading', { name: destination }))
      expect(screen.queryByTestId('admin-shell')).not.toBeInTheDocument()
      expect(screen.getByLabelText('Community identifier')).toHaveTextContent('community-42')
      expect(screen.getByLabelText('Server identifier')).toHaveTextContent('server-7')
    },
  )

  it.each(adminRoutes)('opens administration route %s inside the admin dashboard', async (suffix, destination) => {
    await visit(`/dashboard/admins${suffix}`, destination)
    expect(screen.getByTestId('admin-shell')).toContainElement(screen.getByRole('heading', { name: destination }))
    expect(screen.queryByTestId('guild-shell')).not.toBeInTheDocument()
  })

  it.each([
    ['/map', undefined],
    ['/missing-public-page', undefined],
    ['/dashboard/guilds/community-42/missing-page', 'guild-shell'],
    ['/dashboard/admins/missing-page', 'admin-shell'],
  ] as const)('shows the not-found page for %s in its matching layout', async (path, shell) => {
    await visit(path, 'pages/NotFound')
    for (const candidate of ['guild-shell', 'admin-shell']) {
      if (candidate === shell) expect(screen.getByTestId(candidate)).toBeInTheDocument()
      else expect(screen.queryByTestId(candidate)).not.toBeInTheDocument()
    }
  })
})
