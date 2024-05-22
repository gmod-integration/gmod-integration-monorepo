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
  findCurrentUser,
  findGuild,
  findGuildChannels,
  findGuildServer,
  findGuildServers,
  findServerScreenshots,
  findServerStatus,
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
  putGuildLinks,
  putGuildServer,
  putGuildVerificationsRoles,
  putPlayerBypassMaintenance,
  putServerStatusButtons,
} from '../../controllers/v3/usersControllers.js';
import { userAdminGuildValidator, userServerValidator, userValidator } from '../../middleware/v3/userValidator.js';

const router = express.Router();

router.get('/', getProfile);
router.get('/login', oauthLogin);

router.use('/:discordID', userValidator);
router.get('/:discordID', findCurrentUser);
router.get('/:discordID/guilds', getUserGuildsOwnOrAdmins);

router.use('/:discordID/guilds/:guildID', userAdminGuildValidator);
router.get('/:discordID/guilds/:guildID', findGuild);
router.get('/:discordID/guilds/:guildID/channels', findGuildChannels);
router.get('/:discordID/guilds/:guildID/roles', getGuildRoles);
router.get('/:discordID/guilds/:guildID/admins', getGuildAdmins);
router.get('/:discordID/guilds/:guildID/emojis', getGuildEmojis);
// Servers
router.get('/:discordID/guilds/:guildID/servers', findGuildServers);
router.post('/:discordID/guilds/:guildID/servers', createNewServer);
// Links
router.get('/:discordID/guilds/:guildID/links', getGuildLinks);
router.post('/:discordID/guilds/:guildID/links', postGuildLinks);
router.put('/:discordID/guilds/:guildID/links/:linkID', putGuildLinks);
router.delete('/:discordID/guilds/:guildID/links/:linkID', deleteGuildLinks);
// Verifications
router.get('/:discordID/guilds/:guildID/verifications', getTodo);
router.put('/:discordID/guilds/:guildID/verifications', getTodo);
router.get('/:discordID/guilds/:guildID/verifications/roles', getGuildVerificationsRoles);
router.put('/:discordID/guilds/:guildID/verifications/roles/:roleID', putGuildVerificationsRoles);
router.post('/:discordID/guilds/:guildID/verifications/roles/:roleID', createGuildVerificationsRoles);
router.delete('/:discordID/guilds/:guildID/verifications/roles/:roleID', deleteGuildVerificationsRoles);

router.use('/:discordID/guilds/:guildID/servers/:serverID', userServerValidator);
router.get('/:discordID/guilds/:guildID/servers/:serverID', findGuildServer);
router.put('/:discordID/guilds/:guildID/servers/:serverID', putGuildServer);
router.post('/:discordID/guilds/:guildID/servers/:serverID/token', postGuildServerToken);
router.get('/:discordID/guilds/:guildID/servers/:serverID/players', getServerPlayers);
router.put('/:discordID/guilds/:guildID/servers/:serverID/players/:playerID', putPlayerBypassMaintenance);
router.delete('/:discordID/guilds/:guildID/servers/:serverID', deleteGuildServer);
// Screenshots
router.get('/:discordID/guilds/:guildID/servers/:serverID/screenshots', findServerScreenshots);
router.post('/:discordID/guilds/:guildID/servers/:serverID/screenshots', postServerScreenshots);
router.delete('/:discordID/guilds/:guildID/servers/:serverID/screenshots', deleteServerScreenshots);
// Status
router.get('/:discordID/guilds/:guildID/servers/:serverID/status', findServerStatus);
router.post('/:discordID/guilds/:guildID/servers/:serverID/status', postServerStatus);
router.delete('/:discordID/guilds/:guildID/servers/:serverID/status', deleteServerStatus);
router.get('/:discordID/guilds/:guildID/servers/:serverID/status/buttons', getServerStatusButtons);
router.put('/:discordID/guilds/:guildID/servers/:serverID/status/buttons/:buttonID', putServerStatusButtons);
router.post('/:discordID/guilds/:guildID/servers/:serverID/status/buttons', createServerStatusButtons);
router.delete('/:discordID/guilds/:guildID/servers/:serverID/status/buttons/:buttonID', deleteServerStatusButtons);

export default router;
