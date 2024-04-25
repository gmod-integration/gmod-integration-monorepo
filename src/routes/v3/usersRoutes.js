import express from 'express';
import {
  findGuild,
  findGuildChannels,
  findGuildServer,
  findGuildServers,
  getProfile,
  getUserGuildsOwnOrAdmins,
} from '../../controllers/v3/usersControllers.js';
import { userAdminGuildValidator, userServerValidator, userValidator } from '../../middleware/v3/userValidator.js';

const router = express.Router();

router.get('/', getProfile);

router.use('/:discordID', userValidator);
router.get('/:discordID/guilds', getUserGuildsOwnOrAdmins);

router.use('/:discordID/guilds/:guildID', userAdminGuildValidator);
router.get('/:discordID/guilds/:guildID', findGuild);
router.get('/:discordID/guilds/:guildID/channels', findGuildChannels);
router.get('/:discordID/guilds/:guildID/servers', findGuildServers);

router.use('/:discordID/guilds/:guildID/servers/:serverID', userServerValidator);
router.get('/:discordID/guilds/:guildID/servers/:serverID', findGuildServer);
// router.get('/:discordID/guilds/:guildID/status', findGuild);
// router.post('/:discordID/guilds/:guildID/status', createGuildStatusServer);

export default router;
