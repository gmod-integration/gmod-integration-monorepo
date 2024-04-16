import express from 'express';
import serverValidator from '../../middleware/v3/serverValidator.js';
import { getInfo, getPublicToken, postStatus } from '../../controllers/v3/serversControllers.js';
import { reportError } from '../../controllers/v3/errorsControllers.js';
import {
  getPlayer,
  playerChangeGroup,
  playerChangeName,
  playerConnect,
  playerDisconnect,
  playerReady,
  playerSay,
  playerSpawn,
} from '../../controllers/v3/serversPlayersController.js';

const router = express.Router();

router.use('/:serverID', serverValidator);

router.get('/:serverID', getInfo);
router.post('/:serverID/status', postStatus);
router.get('/:serverID/public-token', getPublicToken);
router.post('/:serverID/errors', reportError);
router.get('/:serverID/players/:steamID64', getPlayer);
router.post('/:serverID/players/:steamID64/say', playerSay);
router.post('/:serverID/players/:steamID64/connect', playerConnect);
router.post('/:serverID/players/:steamID64/disconnect', playerDisconnect);
router.post('/:serverID/players/:steamID64/ready', playerReady);
router.post('/:serverID/players/:steamID64/spawn', playerSpawn);
router.post('/:serverID/players/:steamID64/name', playerChangeName);
router.post('/:serverID/players/:steamID64/group', playerChangeGroup);

export default router;
