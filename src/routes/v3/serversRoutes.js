const express = require('express');
const router = express.Router();

// Validator
const serverValidator = require('../../middleware/v3/serverValidator');
router.use('/:serverID', serverValidator);

// Routes
const serverController = require('../../controllers/v3/serversControllers');
router.get('/:serverID', serverController.getInfo);
router.post('/:serverID/status', serverController.postStatus);
router.get('/:serverID/public-token', serverController.getPublicToken);

const errorsControllers = require('../../controllers/v3/errorsControllers');
router.post('/:serverID/errors', errorsControllers.reportError);

const playersControllers = require("../../controllers/v3/serversPlayersController");
router.get('/:serverID/players/:steamID64', playersControllers.getPlayer);
router.post('/:serverID/players/:steamID64/say', playersControllers.playerSay);
router.post('/:serverID/players/:steamID64/connect', playersControllers.playerConnect);
router.post('/:serverID/players/:steamID64/disconnect', playersControllers.playerDisconnect);
router.post('/:serverID/players/:steamID64/ready', playersControllers.playerReady);
router.post('/:serverID/players/:steamID64/spawn', playersControllers.playerSpawn);
router.post('/:serverID/players/:steamID64/name', playersControllers.playerChangeName)
router.post('/:serverID/players/:steamID64/group', playersControllers.playerChangeGroup)

// Export
module.exports = router;