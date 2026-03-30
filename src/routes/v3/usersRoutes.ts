import express from 'express';
import {
  createGuildVerificationsRoles,
  createNewServer,
  createServerStatusButtons,
  createVerificationMessage,
  deleteAutoRoles,
  deleteGmodPurchase,
  deleteGmodToDiscordFilter,
  deleteGuildBotInstance,
  deleteGuildLinks,
  deleteGuildServer,
  deleteGuildVerificationsRoles,
  deleteLogsChannel,
  deleteServerLogsTrigger,
  deleteServerPseudo,
  deleteServerRoles,
  deleteServerScreenshots,
  deleteServerStatus,
  deleteServerStatusButtons,
  deleteServerSyncChat,
  deleteServerTeams,
  deleteUserSession,
  deleteVerificationMessage,
  deleteVoteChannels,
  findCurrentUser,
  findGuild,
  findGuildChannels,
  findGuildServer,
  findGuildServers,
  findServerScreenshots,
  findServerStatus,
  findServerSyncChat,
  getAdminGuilds,
  getAdminInformations,
  getAutoRoles,
  getGmodToDiscordFilter,
  getGuildAdmins,
  getGuildBotInstance,
  getGuildBotRoleSubordination,
  getGuildEmojis,
  getGuildLinks,
  getGuildRoles,
  getGuildSetting,
  getGuildSettings,
  getGuildVerificationsRoles,
  getLogsChannel,
  getProfile,
  getPublicServers,
  getScreenshotsList,
  getServerLogs,
  getServerLogsTrigger,
  getServerPlayers,
  getServerPseudo,
  getServerReportBugs,
  getServerRoles,
  getServerSetting,
  getServerSettings,
  getServerStatusButtons,
  getServerTeams,
  getServerWarns,
  getUserDataRequest,
  getUserGmodStorePurchases,
  getUserGuildsOwnOrAdmins,
  getUserNotifications,
  getUserSessions,
  getVerificationCheck,
  getVerificationMessage,
  getVoteChannels,
  logOut,
  oauthLogin,
  patchGuildBotInstance,
  patchUserNotifications,
  postAutoRoles,
  postGmodPurchase,
  postGmodToDiscordFilter,
  postGuildLinks,
  postGuildServerToken,
  postLogsChannel,
  postServerLogsTrigger,
  postServerPseudo,
  postServerRoles,
  postServerScreenshots,
  postServerStatus,
  postServerSyncChat,
  postServerTeams,
  postUserDataRequest,
  postUserStartVerification,
  postVerificationCheck,
  postVoteChannels,
  putGmodToDiscordFilter,
  putGuildBotInstance,
  putGuildLinks,
  putGuildServer,
  putGuildSetting,
  putGuildVerificationsRoles,
  putPlayerBypassMaintenance,
  putServerLogsTrigger,
  putServerPseudo,
  putServerRoles,
  putServerSetting,
  putServerStatusButtons,
  putServerTeams,
} from '../../controllers/v3/usersControllers.js';
import {
  userAdminGuildValidator,
  userAdminValidator,
  userServerValidator,
  userValidator,
} from '../../middleware/v3/userValidator.js';
import asyncHandler from '../../middleware/asyncHandler.js';
import { getAllPanelUsers } from '../../controllers/v3/usersAdminControllers.js';
import { getServerErrors } from '../../controllers/website/WebsiteErrorsControllers.js';
import { getIGSettings, postIGSettings } from '../../controllers/v3/serversControllers.js';
import { putServerStatusChannel } from '../../controllers/v3/users/ServerStatusChannelControllers.js';

const router = express.Router();

router.get('/', asyncHandler(getProfile));
router.get('/login', asyncHandler(oauthLogin));

router.use('/:discordID', userValidator);
router.get('/:discordID', asyncHandler(findCurrentUser));
router.post('/:discordID/logout', asyncHandler(logOut));
router.get('/:discordID/sessions', asyncHandler(getUserSessions));
router.delete('/:discordID/sessions/:sessionID', asyncHandler(deleteUserSession));
router.get('/:discordID/guilds', asyncHandler(getUserGuildsOwnOrAdmins));
router.get('/:discordID/gmod-store', asyncHandler(getUserGmodStorePurchases));
router.get('/:discordID/verifications/token', asyncHandler(postUserStartVerification));
router.get('/:discordID/servers', asyncHandler(getPublicServers));
router.get('/:discordID/notifications', asyncHandler(getUserNotifications));
router.patch('/:discordID/notifications/:notificationID', asyncHandler(patchUserNotifications));
router.get('/:discordID/data-requests', asyncHandler(getUserDataRequest));
router.post('/:discordID/data-requests', asyncHandler(postUserDataRequest));

router.use('/:discordID/admins', userAdminValidator);
router.get('/:discordID/admins/guilds', asyncHandler(getAdminGuilds));
router.get('/:discordID/admins/informations', asyncHandler(getAdminInformations));
router.get('/:discordID/admins/panel-users', asyncHandler(getAllPanelUsers));

router.use('/:discordID/guilds/:guildID', userAdminGuildValidator);
router.get('/:discordID/guilds/:guildID', asyncHandler(findGuild));
router.get('/:discordID/guilds/:guildID/bot', asyncHandler(getGuildBotInstance));
router.put('/:discordID/guilds/:guildID/bot', asyncHandler(putGuildBotInstance));
router.get('/:discordID/guilds/:guildID/bot/roles/subordination', asyncHandler(getGuildBotRoleSubordination));
router.patch('/:discordID/guilds/:guildID/bot', asyncHandler(patchGuildBotInstance));
router.delete('/:discordID/guilds/:guildID/bot', asyncHandler(deleteGuildBotInstance));
router.post('/:discordID/guilds/:guildID/gmod-store', asyncHandler(postGmodPurchase));
router.delete('/:discordID/guilds/:guildID/gmod-store', asyncHandler(deleteGmodPurchase));
router.get('/:discordID/guilds/:guildID/channels', asyncHandler(findGuildChannels));
router.get('/:discordID/guilds/:guildID/roles', asyncHandler(getGuildRoles));
router.get('/:discordID/guilds/:guildID/admins', asyncHandler(getGuildAdmins));
router.get('/:discordID/guilds/:guildID/emojis', asyncHandler(getGuildEmojis));

// Settings
router.get('/:discordID/guilds/:guildID/settings', asyncHandler(getGuildSettings));
router.get('/:discordID/guilds/:guildID/settings/:setting', asyncHandler(getGuildSetting));
router.put('/:discordID/guilds/:guildID/settings/:setting', asyncHandler(putGuildSetting));

// Servers
router.get('/:discordID/guilds/:guildID/servers', asyncHandler(findGuildServers));
router.post('/:discordID/guilds/:guildID/servers', asyncHandler(createNewServer));

// Links
router.get('/:discordID/guilds/:guildID/links', asyncHandler(getGuildLinks));
router.post('/:discordID/guilds/:guildID/links', asyncHandler(postGuildLinks));
router.put('/:discordID/guilds/:guildID/links/:linkID', asyncHandler(putGuildLinks));
router.delete('/:discordID/guilds/:guildID/links/:linkID', asyncHandler(deleteGuildLinks));

// Links
router.get('/:discordID/guilds/:guildID/auto-roles', asyncHandler(getAutoRoles));
router.post('/:discordID/guilds/:guildID/auto-roles/:roleID', asyncHandler(postAutoRoles));
router.delete('/:discordID/guilds/:guildID/auto-roles/:roleID', asyncHandler(deleteAutoRoles));

// Verifications
router.get('/:discordID/guilds/:guildID/verifications', asyncHandler(getVerificationMessage));
router.delete('/:discordID/guilds/:guildID/verifications', asyncHandler(deleteVerificationMessage));
router.post('/:discordID/guilds/:guildID/verifications', asyncHandler(createVerificationMessage));
router.get('/:discordID/guilds/:guildID/verifications/check', asyncHandler(getVerificationCheck));
router.post('/:discordID/guilds/:guildID/verifications/check', asyncHandler(postVerificationCheck));
router.get('/:discordID/guilds/:guildID/verifications/roles', asyncHandler(getGuildVerificationsRoles));
router.put('/:discordID/guilds/:guildID/verifications/roles/:roleID', asyncHandler(putGuildVerificationsRoles));
router.post('/:discordID/guilds/:guildID/verifications/roles/:roleID', asyncHandler(createGuildVerificationsRoles));
router.delete('/:discordID/guilds/:guildID/verifications/roles/:roleID', asyncHandler(deleteGuildVerificationsRoles));

router.use('/:discordID/guilds/:guildID/servers/:serverID', userServerValidator);
router.get('/:discordID/guilds/:guildID/servers/:serverID', asyncHandler(findGuildServer));
router.put('/:discordID/guilds/:guildID/servers/:serverID', asyncHandler(putGuildServer));
router.post('/:discordID/guilds/:guildID/servers/:serverID/token', asyncHandler(postGuildServerToken));
router.get('/:discordID/guilds/:guildID/servers/:serverID/players', asyncHandler(getServerPlayers));
router.put('/:discordID/guilds/:guildID/servers/:serverID/players/:playerID', asyncHandler(putPlayerBypassMaintenance));
router.delete('/:discordID/guilds/:guildID/servers/:serverID', asyncHandler(deleteGuildServer));

// Config
router.post('/:discordID/guilds/:guildID/servers/:serverID/config', asyncHandler(postIGSettings));
router.get('/:discordID/guilds/:guildID/servers/:serverID/config', asyncHandler(getIGSettings));

// Settings
router.get('/:discordID/guilds/:guildID/servers/:serverID/settings', asyncHandler(getServerSettings));
router.get('/:discordID/guilds/:guildID/servers/:serverID/settings/:setting', asyncHandler(getServerSetting));
router.put('/:discordID/guilds/:guildID/servers/:serverID/settings/:setting', asyncHandler(putServerSetting));

// Roles
router.get('/:discordID/guilds/:guildID/servers/:serverID/roles', asyncHandler(getServerRoles));
router.post('/:discordID/guilds/:guildID/servers/:serverID/roles/:roleID', asyncHandler(postServerRoles));
router.put('/:discordID/guilds/:guildID/servers/:serverID/roles/:roleID', asyncHandler(putServerRoles));
router.delete('/:discordID/guilds/:guildID/servers/:serverID/roles/:roleID', asyncHandler(deleteServerRoles));

// Team Roles
router.get('/:discordID/guilds/:guildID/servers/:serverID/teams', asyncHandler(getServerTeams));
router.post('/:discordID/guilds/:guildID/servers/:serverID/teams/:roleID', asyncHandler(postServerTeams));
router.put('/:discordID/guilds/:guildID/servers/:serverID/teams/:id', asyncHandler(putServerTeams));
router.delete('/:discordID/guilds/:guildID/servers/:serverID/teams/:id', asyncHandler(deleteServerTeams));

// Screenshots
router.get('/:discordID/guilds/:guildID/servers/:serverID/screenshots/channel', asyncHandler(findServerScreenshots));
router.post('/:discordID/guilds/:guildID/servers/:serverID/screenshots/channel', asyncHandler(postServerScreenshots));
router.delete(
  '/:discordID/guilds/:guildID/servers/:serverID/screenshots/channel',
  asyncHandler(deleteServerScreenshots),
);
router.get('/:discordID/guilds/:guildID/servers/:serverID/screenshots', asyncHandler(getScreenshotsList));

// Logs
router.get('/:discordID/guilds/:guildID/servers/:serverID/logs', asyncHandler(getServerLogs));
router.get('/:discordID/guilds/:guildID/servers/:serverID/logs/channels', asyncHandler(getLogsChannel));
router.post('/:discordID/guilds/:guildID/servers/:serverID/logs/channels', asyncHandler(postLogsChannel));
router.delete('/:discordID/guilds/:guildID/servers/:serverID/logs/channels', asyncHandler(deleteLogsChannel));
router.get('/:discordID/guilds/:guildID/servers/:serverID/logs/triggers', asyncHandler(getServerLogsTrigger));
router.post('/:discordID/guilds/:guildID/servers/:serverID/logs/triggers', asyncHandler(postServerLogsTrigger));
router.put(
  '/:discordID/guilds/:guildID/servers/:serverID/logs/triggers/:triggerID',
  asyncHandler(putServerLogsTrigger),
);
router.delete(
  '/:discordID/guilds/:guildID/servers/:serverID/logs/triggers/:triggerID',
  asyncHandler(deleteServerLogsTrigger),
);

// Errors
router.get('/:discordID/guilds/:guildID/servers/:serverID/errors', asyncHandler(getServerErrors));
// router.get('/:discordID/guilds/:guildID/servers/:serverID/errors/channels', asyncHandler(getServerErrorsChannel));
// router.post('/:discordID/guilds/:guildID/servers/:serverID/errors/channels', asyncHandler(postServerErrorsChannel));
// router.delete('/:discordID/guilds/:guildID/servers/:serverID/errors/channels', asyncHandler(deleteServerErrorsChannel));

// Vote
router.get('/:discordID/guilds/:guildID/servers/:serverID/votes', asyncHandler(getVoteChannels));
router.post('/:discordID/guilds/:guildID/servers/:serverID/votes', asyncHandler(postVoteChannels));
router.delete('/:discordID/guilds/:guildID/servers/:serverID/votes', asyncHandler(deleteVoteChannels));

// Pseudo
router.get('/:discordID/guilds/:guildID/servers/:serverID/pseudo', asyncHandler(getServerPseudo));
router.post('/:discordID/guilds/:guildID/servers/:serverID/pseudo', asyncHandler(postServerPseudo));
router.put('/:discordID/guilds/:guildID/servers/:serverID/pseudo/:roleID', asyncHandler(putServerPseudo));
router.delete('/:discordID/guilds/:guildID/servers/:serverID/pseudo/:roleID', asyncHandler(deleteServerPseudo));

// Sync Chat
router.get('/:discordID/guilds/:guildID/servers/:serverID/chats', asyncHandler(findServerSyncChat));
router.post('/:discordID/guilds/:guildID/servers/:serverID/chats', asyncHandler(postServerSyncChat));
router.delete('/:discordID/guilds/:guildID/servers/:serverID/chats', asyncHandler(deleteServerSyncChat));
router.get('/:discordID/guilds/:guildID/servers/:serverID/chats/filters', asyncHandler(getGmodToDiscordFilter));
router.post('/:discordID/guilds/:guildID/servers/:serverID/chats/filters', asyncHandler(postGmodToDiscordFilter));
router.put(
  '/:discordID/guilds/:guildID/servers/:serverID/chats/filters/:filterID',
  asyncHandler(putGmodToDiscordFilter),
);
router.delete(
  '/:discordID/guilds/:guildID/servers/:serverID/chats/filters/:filterID',
  asyncHandler(deleteGmodToDiscordFilter),
);

// Report Bug
router.get('/:discordID/guilds/:guildID/servers/:serverID/bugs', asyncHandler(getServerReportBugs));

// Warn
router.get('/:discordID/guilds/:guildID/servers/:serverID/warns', asyncHandler(getServerWarns));

// Status
router.get('/:discordID/guilds/:guildID/servers/:serverID/status', asyncHandler(findServerStatus));
router.post('/:discordID/guilds/:guildID/servers/:serverID/status', asyncHandler(postServerStatus));
router.delete('/:discordID/guilds/:guildID/servers/:serverID/status', asyncHandler(deleteServerStatus));
router.get('/:discordID/guilds/:guildID/servers/:serverID/status/buttons', asyncHandler(getServerStatusButtons));
router.put(
  '/:discordID/guilds/:guildID/servers/:serverID/status/buttons/:buttonID',
  asyncHandler(putServerStatusButtons),
);
router.post('/:discordID/guilds/:guildID/servers/:serverID/status/buttons', asyncHandler(createServerStatusButtons));
router.delete(
  '/:discordID/guilds/:guildID/servers/:serverID/status/buttons/:buttonID',
  asyncHandler(deleteServerStatusButtons),
);
router.put('/:discordID/guilds/:guildID/servers/:serverID/status/channel', asyncHandler(putServerStatusChannel));

export default router;
