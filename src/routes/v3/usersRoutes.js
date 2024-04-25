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

export default router;
