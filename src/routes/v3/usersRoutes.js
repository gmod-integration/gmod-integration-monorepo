import express from 'express';
import { getProfile, getUserGuildsOwnOrAdmins } from '../../controllers/v3/usersControllers.js';
import userValidator from '../../middleware/v3/userValidator.js';

const router = express.Router();

router.get('/', getProfile);

router.use('/:discordID', userValidator);
router.get('/:discordID/guilds', getUserGuildsOwnOrAdmins);

export default router;
