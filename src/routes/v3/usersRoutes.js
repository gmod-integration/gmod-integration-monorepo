import express from 'express';
import {
  createGuildStatusServer,
  findCurrentUser,
  findGuild,
  findGuildChannels,
  findGuildServer,
  findGuildServers,
  findServerStatus,
  getProfile,
  getUserGuildsOwnOrAdmins,
} from '../../controllers/v3/usersControllers.js';
import { userAdminGuildValidator, userServerValidator, userValidator } from '../../middleware/v3/userValidator.js';

const router = express.Router();

router.get('/', getProfile);

router.use('/:discordID', userValidator);
router.get('/:discordID', findCurrentUser);
router.get('/:discordID/guilds', getUserGuildsOwnOrAdmins);

router.use('/:discordID/guilds/:guildID', userAdminGuildValidator);
router.get('/:discordID/guilds/:guildID', findGuild);
router.get('/:discordID/guilds/:guildID/channels', findGuildChannels);
router.get('/:discordID/guilds/:guildID/servers', findGuildServers);

router.use('/:discordID/guilds/:guildID/servers/:serverID', userServerValidator);
router.get('/:discordID/guilds/:guildID/servers/:serverID', findGuildServer);
router.get('/:discordID/guilds/:guildID/servers/:serverID/status', findServerStatus);
router.post('/:discordID/guilds/:guildID/servers/:serverID/status', createGuildStatusServer);

export default router;
