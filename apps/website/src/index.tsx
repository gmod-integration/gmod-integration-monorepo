/* @refresh reload */
import { render } from 'solid-js/web'
import { lazy } from 'solid-js'

import './index.css'
import { Navigate, Route, Router } from '@solidjs/router'
import NotFound from './pages/NotFound.js'
import Login from './pages/Login.js'
import Logout from './pages/Logout.js'
import Home from './pages/Home.js'
import 'highlight.js/styles/tokyo-night-dark.css'
import { AppAdminDashboard } from './app/AppAdminDashboard.js'
import { AppDashboard } from './app/AppDashboard.js'
import { App } from './app/App.js'

const Premium = lazy(() => import('./pages/Premium.js'))
const Terms = lazy(() => import('./pages/legal/Terms.js'))
const Privacy = lazy(() => import('./pages/legal/Privacy.js'))
const Account = lazy(() => import('./pages/Account.js'))
const Servers = lazy(() => import('./pages/Servers.js'))
const Notifications = lazy(() => import('./pages/Notifications.js'))
const GuildsSelector = lazy(() => import('./pages/dashboard/guilds/GuildsSelector.js'))
const GuildInformations = lazy(() => import('./pages/dashboard/guilds/GuildInformations.js'))
const GuildLinks = lazy(() => import('./pages/dashboard/guilds/GuildLinks.js'))
const GuildBans = lazy(() => import('./pages/dashboard/guilds/GuildBans.js'))
const GuildVerification = lazy(() => import('./pages/dashboard/guilds/GuildVerifications.js'))
const GuildAutoRole = lazy(() => import('./pages/dashboard/guilds/GuildAutoRoles.js'))
const GuildBot = lazy(() => import('./pages/dashboard/guilds/GuildBot.js'))
const ServerList = lazy(() => import('./pages/dashboard/guilds/servers/ServersSelector.js'))
const ServerInformations = lazy(() => import('./pages/dashboard/guilds/servers/ServerInformations.js'))
const ServerConfig = lazy(() => import('./pages/dashboard/guilds/servers/ServerConfig.js'))
const ServerStatus = lazy(() => import('./pages/dashboard/guilds/servers/status/ServerStatus.js'))
const ServerPlayer = lazy(() => import('./pages/dashboard/guilds/servers/ServerPlayers.js'))
const ServerRoles = lazy(() => import('./pages/dashboard/guilds/servers/ServerRoles.js'))
const ServerChats = lazy(() => import('./pages/dashboard/guilds/servers/ServerChats.js'))
const ServerPseudo = lazy(() => import('./pages/dashboard/guilds/servers/ServerPseudo.js'))
const ServerScreenshots = lazy(() => import('./pages/dashboard/guilds/servers/screenshots/ServerScreenshots.js'))
const ServerVote = lazy(() => import('./pages/dashboard/guilds/servers/ServerVote.js'))
const ServerLogs = lazy(() => import('./pages/dashboard/guilds/servers/logs/ServerLogs.js'))
const ServerErrors = lazy(() => import('./pages/dashboard/guilds/servers/errors/ServerErrors.js'))
const ServerBugs = lazy(() => import('./pages/dashboard/guilds/servers/ServerBugs.js'))
const ServerTeam = lazy(() => import('./pages/dashboard/guilds/servers/ServerTeam.js'))
const ServerWarns = lazy(() => import('./pages/dashboard/guilds/servers/ServerWarns.js'))
const GuildList = lazy(() => import('./pages/dashboard/admins/GuildList.js'))
const AdminInformations = lazy(() => import('./pages/dashboard/admins/AdminInformations.js'))
const Impersonate = lazy(() => import('./pages/dashboard/admins/Impersonate.js'))
const AdminServerList = lazy(() => import('./pages/dashboard/admins/ServerList.js'))
const AdminUserList = lazy(() => import('./pages/dashboard/admins/UserList.js'))
const AdminPremiumList = lazy(() => import('./pages/dashboard/admins/PremiumList.js'))

const root = document.getElementById('root')

if (import.meta.env.DEV && !(root instanceof HTMLElement)) {
  throw new Error(
    'Root element not found. Did you forget to add it to your index.html? Or maybe the id attribute got misspelled?',
  )
}

render(
  () => (
    <Router root={App}>
      <Route path="/" component={Home} />
      <Route path="/premium" component={Premium} />
      <Route path="/account" component={Account} />
      <Route path="/legal/privacy" component={Privacy} />
      <Route path="/legal/terms" component={Terms} />
      <Route path="/login" component={Login} />
      <Route path="/logout" component={Logout} />
      <Route path="/servers" component={Servers} />
      <Route path="/notifications" component={Notifications} />
      <Route path="/dashboard/admins" component={AppAdminDashboard}>
        <Route path="/" component={() => <Navigate href="/dashboard/admins/informations" />} />
        <Route path="/informations" component={AdminInformations} />
        <Route path="/guilds" component={GuildList} />
        <Route path="/servers" component={AdminServerList} />
        <Route path="/users" component={AdminUserList} />
        <Route path="/premium" component={AdminPremiumList} />
        <Route path="/impersonate" component={Impersonate} />
        <Route path="/stop-impersonate" component={Impersonate} />
        <Route path="*" component={NotFound} />
      </Route>
      <Route path="/dashboard/guilds" component={GuildsSelector} />
      <Route path="/dashboard/guilds/:guildID" component={AppDashboard}>
        <Route path="/config" component={GuildInformations} />
        <Route path="/config/bot" component={GuildBot} />
        <Route path="/config/links" component={GuildLinks} />
        <Route path="/config/bans" component={GuildBans} />
        <Route path="/config/verification" component={GuildVerification} />
        <Route path="/config/auto-role" component={GuildAutoRole} />
        <Route path="/config/servers" component={ServerList} />
        <Route path="/config/servers/:serverID" component={ServerInformations} />
        <Route path="/config/servers/:serverID/config" component={ServerConfig} />
        <Route path="/config/servers/:serverID/status" component={ServerStatus} />
        <Route path="/config/servers/:serverID/players" component={ServerPlayer} />
        <Route path="/config/servers/:serverID/votes" component={ServerVote} />
        <Route path="/config/servers/:serverID/roles" component={ServerRoles} />
        <Route path="/config/servers/:serverID/teams" component={ServerTeam} />
        <Route path="/config/servers/:serverID/chats" component={ServerChats} />
        <Route path="/config/servers/:serverID/logs" component={ServerLogs} />
        <Route path="/config/servers/:serverID/errors" component={ServerErrors} />
        <Route path="/config/servers/:serverID/warns" component={ServerWarns} />
        <Route path="/config/servers/:serverID/pseudo" component={ServerPseudo} />
        <Route path="/config/servers/:serverID/screenshots" component={ServerScreenshots} />
        <Route path="/config/servers/:serverID/bugs" component={ServerBugs} />
        <Route path="*" component={NotFound} />
      </Route>
      <Route path="*" component={NotFound} />
    </Router>
  ),
  root!,
)
