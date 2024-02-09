const express = require('express');
const router = express.Router();

// Validator
const serverValidator = require('../../middleware/v3/serverValidator');
router.use('/:serverID', serverValidator);

// Routes
const serverController = require('../../controllers/v3/serversControllers');
router.get('/:serverID', serverController.getInfo);
router.post('/:serverID/status', serverController.postStatus);

const logController = require('../../controllers/v3/logsControllers');
// router.post('/:serverID/log/:logType', serverController.postServerLog);

const playersControllers = require("../../controllers/v3/serversPlayersController");
router.get('/:serverID/players/:steamID64', playersControllers.getPlayer);
router.get('/:serverID/players/:steamID64/bans', playersControllers.getPlayerBans);
// router.get('/:serverID/players/:steamID64/isLinked', playersControllers.getUserIsLinked);
// router.post('/:serverID/players/:steamID64/say', playersControllers.postUserSay);
// router.post('/:serverID/players/:steamID64/connect', playersControllers.postUserConnect);
// router.post('/:serverID/players/:steamID64/disconnect', playersControllers.postUserDisconnect);
// router.post('/:serverID/players/:steamID64/finishConnect', playersControllers.postUserFinishConnect);
// router.post('/:serverID/players/:steamID64/changeName', playersControllers.postUserChangeName);
// router.post('/:serverID/players/:steamID64/kick', playersControllers.postUserKick);
// router.post('/:serverID/players/:steamID64/mute', playersControllers.postUserMute);
// router.post('/:serverID/players/:steamID64/unmute', playersControllers.postUserUnmute);
// router.post('/:serverID/players/:steamID64/ban', playersControllers.postUserBan);
// router.post('/:serverID/players/:steamID64/unban', playersControllers.postUserUnban);

// Export
module.exports = router;