import express from 'express';
import {
  createGuildStatusServer,
  createNewServer,
  deleteGuildLinks,
  deleteGuildServer,
  findCurrentUser,
  findGuild,
  findGuildChannels,
  findGuildServer,
  findGuildServers,
  findServerStatus,
  getGuildAdmins,
  getGuildLinks,
  getProfile,
  getTodo,
  getUserGuildsOwnOrAdmins,
  oauthLogin,
  postGuildLinks,
  postGuildServerToken,
  putGuildLinks,
  putGuildServer,
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
router.get('/:discordID/guilds/:guildID/admins', getGuildAdmins);
router.get('/:discordID/guilds/:guildID/links', getGuildLinks);
router.post('/:discordID/guilds/:guildID/links', postGuildLinks);
router.put('/:discordID/guilds/:guildID/links/:linkID', putGuildLinks);
router.delete('/:discordID/guilds/:guildID/links/:linkID', deleteGuildLinks);
router.get('/:discordID/guilds/:guildID/verifications', getTodo);
router.put('/:discordID/guilds/:guildID/verifications', getTodo);
router.get('/:discordID/guilds/:guildID/verifications/roles', getTodo);
router.put('/:discordID/guilds/:guildID/verifications/roles/:roleID', getTodo);
router.post('/:discordID/guilds/:guildID/verifications/roles/:roleID', getTodo);
router.delete('/:discordID/guilds/:guildID/verifications/roles/:roleID', getTodo);
router.get('/:discordID/guilds/:guildID/channels', findGuildChannels);
router.get('/:discordID/guilds/:guildID/servers', findGuildServers);
router.post('/:discordID/guilds/:guildID/servers', createNewServer);

router.use('/:discordID/guilds/:guildID/servers/:serverID', userServerValidator);
router.get('/:discordID/guilds/:guildID/servers/:serverID', findGuildServer);
router.put('/:discordID/guilds/:guildID/servers/:serverID', putGuildServer);
router.post('/:discordID/guilds/:guildID/servers/:serverID/token', postGuildServerToken);
router.delete('/:discordID/guilds/:guildID/servers/:serverID', deleteGuildServer);
router.get('/:discordID/guilds/:guildID/servers/:serverID/status', findServerStatus);
router.post('/:discordID/guilds/:guildID/servers/:serverID/status', createGuildStatusServer);

export default router;
