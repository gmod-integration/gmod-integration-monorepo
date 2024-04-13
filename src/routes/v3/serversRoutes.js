import express from 'express';
import serverValidator from '../../middleware/v3/serverValidator.js';
import serverController from '../../controllers/v3/serversControllers.js';
import {reportError} from '../../controllers/v3/errorsControllers.js';
import playersControllers from '../../controllers/v3/serversPlayersController.js';

const router = express.Router();

router.use('/:serverID', serverValidator);

router.get('/:serverID', serverController.getInfo);
router.post('/:serverID/status', serverController.postStatus);
router.get('/:serverID/public-token', serverController.getPublicToken);
router.post('/:serverID/errors', reportError);
router.get('/:serverID/players/:steamID64', playersControllers.getPlayer);
router.post('/:serverID/players/:steamID64/say', playersControllers.playerSay);
router.post('/:serverID/players/:steamID64/connect', playersControllers.playerConnect);
router.post('/:serverID/players/:steamID64/disconnect', playersControllers.playerDisconnect);
router.post('/:serverID/players/:steamID64/ready', playersControllers.playerReady);
router.post('/:serverID/players/:steamID64/spawn', playersControllers.playerSpawn);
router.post('/:serverID/players/:steamID64/name', playersControllers.playerChangeName)
router.post('/:serverID/players/:steamID64/group', playersControllers.playerChangeGroup)

export default router;