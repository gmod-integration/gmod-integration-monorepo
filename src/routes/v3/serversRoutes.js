const express = require('express');
const router = express.Router();

// Validator
const serverValidator = require('../../middleware/v3/serverValidator');
router.use('/:serverID', serverValidator);

// Routes
const serverController = require('../../controllers/v3/serversControllers');
router.get('/:serverID', serverController.getInfo);
router.post('/:serverID/status', serverController.postStatus);
router.post('/:serverID/error', serverController.reportError);

const logController = require('../../controllers/v3/logsControllers');
router.post('/:serverID/log/:logType', serverController.postServerLog);

const errorsControllers = require('../../controllers/v3/errorsControllers');
router.post('/:serverID/errors', errorsControllers.reportError);

const playersControllers = require("../../controllers/v3/serversPlayersController");
router.get('/:serverID/players/:steamID64', playersControllers.getPlayer);
router.get('/:serverID/players/:steamID64/bans', playersControllers.getPlayerBans);
router.post('/:serverID/players/:steamID64/say', playersControllers.say);

const playersControllersOld = require("../../controllers/v2/userController");
router.post('/:serverID/players/:steamID64/connect', playersControllersOld.postUserConnect);
router.post('/:serverID/players/:steamID64/disconnect', playersControllersOld.postUserDisconnect);
router.post('/:serverID/players/:steamID64/finish-connect', playersControllersOld.postUserFinishConnect);
router.post('/:serverID/players/:steamID64/changeName', playersControllersOld.postUserChangeName);
router.post('/:serverID/players/:steamID64/kick', playersControllersOld.postUserKick);
router.post('/:serverID/players/:steamID64/mute', playersControllersOld.postUserMute);
router.post('/:serverID/players/:steamID64/unmute', playersControllersOld.postUserUnmute);
router.post('/:serverID/players/:steamID64/ban', playersControllersOld.postUserBan);
router.post('/:serverID/players/:steamID64/unban', playersControllersOld.postUserUnban);

// Export
module.exports = router;