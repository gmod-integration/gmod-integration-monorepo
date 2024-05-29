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
import asyncHandler from '../../middleware/asyncHandler.js';

const router = express.Router();

router.use('/:serverID', serverValidator);

router.get('/:serverID', asyncHandler(getInfo));
router.post('/:serverID/status', asyncHandler(postStatus));
router.get('/:serverID/public-token', asyncHandler(getPublicToken));
router.post('/:serverID/errors', asyncHandler(reportError));
router.get('/:serverID/players/:steamID64', asyncHandler(getPlayer));
router.post('/:serverID/players/:steamID64/say', asyncHandler(playerSay));
router.post('/:serverID/players/:steamID64/connect', asyncHandler(playerConnect));
router.post('/:serverID/players/:steamID64/disconnect', asyncHandler(playerDisconnect));
router.post('/:serverID/players/:steamID64/ready', asyncHandler(playerReady));
router.post('/:serverID/players/:steamID64/spawn', asyncHandler(playerSpawn));
router.post('/:serverID/players/:steamID64/name', asyncHandler(playerChangeName));
router.post('/:serverID/players/:steamID64/group', asyncHandler(playerChangeGroup));

export default router;
