/* @refresh reload */
import { render } from "solid-js/web";

import "./index.css";
import "./sentry";
import { Route, Router } from "@solidjs/router";
import NotFound from "./pages/NotFound";
import Premium from "./pages/Premium";
import Terms from "./pages/legal/Terms";
import Login from "./pages/Login";
import Logout from "./pages/Logout";
import Privacy from "./pages/legal/Privacy";
import Home from "./pages/Home";
import GuildsSelector from "./pages/dashboard/guilds/GuildsSelector";
import GuildInformations from "./pages/dashboard/guilds/GuildInformations";
import ServerList from "./pages/dashboard/guilds/servers/ServersSelector";
import GuildLinks from "./pages/dashboard/guilds/GuildLinks";
import GuildVerification from "./pages/dashboard/guilds/GuildVerifications";
import ServerInformations from "./pages/dashboard/guilds/servers/ServerInformations";
import ServerStatus from "./pages/dashboard/guilds/servers/status/ServerStatus";
import ServerPlayer from "./pages/dashboard/guilds/servers/ServerPlayers";
import ServerRoles from "./pages/dashboard/guilds/servers/ServerRoles";
import ServerChats from "./pages/dashboard/guilds/servers/ServerChats";
import ServerPseudo from "./pages/dashboard/guilds/servers/ServerPseudo";
import ServerScreenshots from "./pages/dashboard/guilds/servers/screenshots/ServerScreenshots";
import Account from "./pages/Account";
import GuildAutoRole from "./pages/dashboard/guilds/GuildAutoRoles";
import Servers from "./pages/Servers";
import ServerVote from "./pages/dashboard/guilds/servers/ServerVote";
import ServerLogs from "./pages/dashboard/guilds/servers/logs/ServerLogs";
import ServerErrors from "./pages/dashboard/guilds/servers/errors/ServerErrors";
import GuildList from "./pages/dashboard/admins/GuildList";
import GuildBot from "./pages/dashboard/guilds/GuildBot";
import Notifications from "./pages/Notifications";
import ServerBugs from "./pages/dashboard/guilds/servers/ServerBugs";
import AdminInformations from "./pages/dashboard/admins/AdminInformations";
import ServerTeam from "./pages/dashboard/guilds/servers/ServerTeam";
import "highlight.js/styles/tokyo-night-dark.css";
import Impersonate from "./pages/dashboard/admins/Impersonate";
import ServerWarns from "./pages/dashboard/guilds/servers/ServerWarns";
import { AppAdminDashboard } from "./app/AppAdminDashboard";
import { AppDashboard } from "./app/AppDashboard";
import { App } from "./app/App";
import ServerConfig from "./pages/dashboard/guilds/servers/ServerConfig";

const root = document.getElementById("root");

if (import.meta.env.DEV && !(root instanceof HTMLElement)) {
  throw new Error(
    "Root element not found. Did you forget to add it to your index.html? Or maybe the id attribute got misspelled?",
  );
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
        <Route path="/informations" component={AdminInformations} />
        <Route path="/guilds" component={GuildList} />
        <Route path="/impersonate" component={Impersonate} />
        <Route path="/stop-impersonate" component={Impersonate} />
        <Route path="*" component={NotFound} />
      </Route>
      <Route path="/dashboard/guilds" component={GuildsSelector} />
      <Route path="/dashboard/guilds/:guildID" component={AppDashboard}>
        <Route path="/config" component={GuildInformations} />
        <Route path="/config/bot" component={GuildBot} />
        <Route path="/config/links" component={GuildLinks} />
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
);
