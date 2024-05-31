import express from 'express';
import {
  createGuildVerificationsRoles,
  createNewServer,
  createServerStatusButtons,
  deleteGuildLinks,
  deleteGuildServer,
  deleteGuildVerificationsRoles,
  deleteServerScreenshots,
  deleteServerStatus,
  deleteServerStatusButtons,
  deleteServerSyncChat,
  findCurrentUser,
  findGuild,
  findGuildChannels,
  findGuildServer,
  findGuildServers,
  findServerScreenshots,
  findServerStatus,
  findServerSyncChat,
  getGuildAdmins,
  getGuildEmojis,
  getGuildLinks,
  getGuildRoles,
  getGuildVerificationsRoles,
  getProfile,
  getServerPlayers,
  getServerStatusButtons,
  getTodo,
  getUserGuildsOwnOrAdmins,
  oauthLogin,
  postGuildLinks,
  postGuildServerToken,
  postServerScreenshots,
  postServerStatus,
  postServerSyncChat,
  postUserStartVerification,
  putGuildLinks,
  putGuildServer,
  putGuildVerificationsRoles,
  putPlayerBypassMaintenance,
  putServerStatusButtons,
} from '../../controllers/v3/usersControllers.js';
import { userAdminGuildValidator, userServerValidator, userValidator } from '../../middleware/v3/userValidator.js';
import asyncHandler from '../../middleware/asyncHandler.js';

const router = express.Router();

router.get('/', asyncHandler(getProfile));
router.get('/login', asyncHandler(oauthLogin));

router.use('/:discordID', userValidator);
router.get('/:discordID', asyncHandler(findCurrentUser));
router.get('/:discordID/guilds', asyncHandler(getUserGuildsOwnOrAdmins));
router.get('/:discordID/verifications/token', asyncHandler(postUserStartVerification));

router.use('/:discordID/guilds/:guildID', userAdminGuildValidator);
router.get('/:discordID/guilds/:guildID', asyncHandler(findGuild));
router.get('/:discordID/guilds/:guildID/channels', asyncHandler(findGuildChannels));
router.get('/:discordID/guilds/:guildID/roles', asyncHandler(getGuildRoles));
router.get('/:discordID/guilds/:guildID/admins', asyncHandler(getGuildAdmins));
router.get('/:discordID/guilds/:guildID/emojis', asyncHandler(getGuildEmojis));
// Servers
router.get('/:discordID/guilds/:guildID/servers', asyncHandler(findGuildServers));
router.post('/:discordID/guilds/:guildID/servers', asyncHandler(createNewServer));
// Links
router.get('/:discordID/guilds/:guildID/links', asyncHandler(getGuildLinks));
router.post('/:discordID/guilds/:guildID/links', asyncHandler(postGuildLinks));
router.put('/:discordID/guilds/:guildID/links/:linkID', asyncHandler(putGuildLinks));
router.delete('/:discordID/guilds/:guildID/links/:linkID', asyncHandler(deleteGuildLinks));
// Verifications
router.get('/:discordID/guilds/:guildID/verifications', asyncHandler(getTodo));
router.put('/:discordID/guilds/:guildID/verifications', asyncHandler(getTodo));
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
// Screenshots
router.get('/:discordID/guilds/:guildID/servers/:serverID/screenshots', asyncHandler(findServerScreenshots));
router.post('/:discordID/guilds/:guildID/servers/:serverID/screenshots', asyncHandler(postServerScreenshots));
router.delete('/:discordID/guilds/:guildID/servers/:serverID/screenshots', asyncHandler(deleteServerScreenshots));
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
