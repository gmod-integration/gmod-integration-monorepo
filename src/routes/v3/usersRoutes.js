import express from 'express';
import {
  createGuildVerificationsRoles,
  createNewServer,
  createServerStatusButtons,
  createVerificationMessage,
  deleteAutoRoles,
  deleteGuildBotInstance,
  deleteGuildLinks,
  deleteGuildServer,
  deleteGuildSetting,
  deleteGuildVerificationsRoles,
  deleteLogsChannel,
  deleteServerRoles,
  deleteServerScreenshots,
  deleteServerStatus,
  deleteServerStatusButtons,
  deleteServerSyncChat,
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
  getAutoRoles,
  getGuildAdmins,
  getGuildBotInstance,
  getGuildEmojis,
  getGuildLinks,
  getGuildRoles,
  getGuildSetting,
  getGuildSettings,
  getGuildVerificationsRoles,
  getLogsChannel,
  getProfile,
  getPublicServers,
  getServerErrors,
  getServerLogs,
  getServerPlayers,
  getServerRoles,
  getServerSetting,
  getServerSettings,
  getServerStatusButtons,
  getUserGmodStorePurchases,
  getUserGuildsOwnOrAdmins,
  getVerificationMessage,
  getVoteChannels,
  oauthLogin,
  patchGuildBotInstance,
  postAutoRoles,
  postGmodPurchase,
  postGuildLinks,
  postGuildServerToken,
  postGuildSetting,
  postLogsChannel,
  postServerRoles,
  postServerScreenshots,
  postServerStatus,
  postServerSyncChat,
  postUserStartVerification,
  postVoteChannels,
  putGuildBotInstance,
  putGuildLinks,
  putGuildServer,
  putGuildSetting,
  putGuildVerificationsRoles,
  putPlayerBypassMaintenance,
  putServerRoles,
  putServerSetting,
  putServerStatusButtons,
} from '../../controllers/v3/usersControllers.js';
import {
  userAdminGuildValidator,
  userAdminValidator,
  userServerValidator,
  userValidator,
} from '../../middleware/v3/userValidator.js';
import asyncHandler from '../../middleware/asyncHandler.js';

const router = express.Router();

router.get('/', asyncHandler(getProfile));
router.get('/login', asyncHandler(oauthLogin));

router.use('/:discordID', userValidator);
router.get('/:discordID', asyncHandler(findCurrentUser));
router.get('/:discordID/guilds', asyncHandler(getUserGuildsOwnOrAdmins));
router.get('/:discordID/gmod-store', asyncHandler(getUserGmodStorePurchases));
router.get('/:discordID/verifications/token', asyncHandler(postUserStartVerification));
router.get('/:discordID/servers', asyncHandler(getPublicServers));

router.use('/:discordID/admins', userAdminValidator);
router.get('/:discordID/admins/guilds', asyncHandler(getAdminGuilds));

router.use('/:discordID/guilds/:guildID', userAdminGuildValidator);
router.get('/:discordID/guilds/:guildID', asyncHandler(findGuild));
router.get('/:discordID/guilds/:guildID/bot', asyncHandler(getGuildBotInstance));
router.put('/:discordID/guilds/:guildID/bot', asyncHandler(putGuildBotInstance));
router.post('/:discordID/guilds/:guildID/bot', asyncHandler(postGmodPurchase));
router.patch('/:discordID/guilds/:guildID/bot', asyncHandler(patchGuildBotInstance));
router.delete('/:discordID/guilds/:guildID/bot', asyncHandler(deleteGuildBotInstance));
router.get('/:discordID/guilds/:guildID/channels', asyncHandler(findGuildChannels));
router.get('/:discordID/guilds/:guildID/roles', asyncHandler(getGuildRoles));
router.get('/:discordID/guilds/:guildID/admins', asyncHandler(getGuildAdmins));
router.get('/:discordID/guilds/:guildID/emojis', asyncHandler(getGuildEmojis));
// Settings
router.get('/:discordID/guilds/:guildID/settings', asyncHandler(getGuildSettings));
router.get('/:discordID/guilds/:guildID/settings/:setting', asyncHandler(getGuildSetting));
router.put('/:discordID/guilds/:guildID/settings/:setting', asyncHandler(putGuildSetting));
router.delete('/:discordID/guilds/:guildID/settings/:setting', asyncHandler(deleteGuildSetting));
router.post('/:discordID/guilds/:guildID/settings/:setting', asyncHandler(postGuildSetting));
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
// Settings
router.get('/:discordID/guilds/:guildID/servers/:serverID/settings', asyncHandler(getServerSettings));
router.get('/:discordID/guilds/:guildID/servers/:serverID/settings/:setting', asyncHandler(getServerSetting));
router.put('/:discordID/guilds/:guildID/servers/:serverID/settings/:setting', asyncHandler(putServerSetting));
// Roles
router.get('/:discordID/guilds/:guildID/servers/:serverID/roles', asyncHandler(getServerRoles));
router.post('/:discordID/guilds/:guildID/servers/:serverID/roles/:roleID', asyncHandler(postServerRoles));
router.put('/:discordID/guilds/:guildID/servers/:serverID/roles/:roleID', asyncHandler(putServerRoles));
router.delete('/:discordID/guilds/:guildID/servers/:serverID/roles/:roleID', asyncHandler(deleteServerRoles));
// Screenshots
router.get('/:discordID/guilds/:guildID/servers/:serverID/screenshots', asyncHandler(findServerScreenshots));
router.post('/:discordID/guilds/:guildID/servers/:serverID/screenshots', asyncHandler(postServerScreenshots));
router.delete('/:discordID/guilds/:guildID/servers/:serverID/screenshots', asyncHandler(deleteServerScreenshots));
// Logs
router.get('/:discordID/guilds/:guildID/servers/:serverID/logs', asyncHandler(getServerLogs));
router.get('/:discordID/guilds/:guildID/servers/:serverID/logs/channels', asyncHandler(getLogsChannel));
router.post('/:discordID/guilds/:guildID/servers/:serverID/logs/channels', asyncHandler(postLogsChannel));
router.delete('/:discordID/guilds/:guildID/servers/:serverID/logs/channels', asyncHandler(deleteLogsChannel));
// Errors
router.get('/:discordID/guilds/:guildID/servers/:serverID/errors', asyncHandler(getServerErrors));
// router.get('/:discordID/guilds/:guildID/servers/:serverID/errors/channels', asyncHandler(getServerErrorsChannel));
// router.post('/:discordID/guilds/:guildID/servers/:serverID/errors/channels', asyncHandler(postServerErrorsChannel));
// router.delete('/:discordID/guilds/:guildID/servers/:serverID/errors/channels', asyncHandler(deleteServerErrorsChannel));
// Vote
router.get('/:discordID/guilds/:guildID/servers/:serverID/votes', asyncHandler(getVoteChannels));
router.post('/:discordID/guilds/:guildID/servers/:serverID/votes', asyncHandler(postVoteChannels));
router.delete('/:discordID/guilds/:guildID/servers/:serverID/votes', asyncHandler(deleteVoteChannels));
// Sync Chat
router.get('/:discordID/guilds/:guildID/servers/:serverID/chats', asyncHandler(findServerSyncChat));
router.post('/:discordID/guilds/:guildID/servers/:serverID/chats', asyncHandler(postServerSyncChat));
router.delete('/:discordID/guilds/:guildID/servers/:serverID/chats', asyncHandler(deleteServerSyncChat));
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

export default router;
