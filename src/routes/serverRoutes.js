const express = require('express');
const router = express.Router();
const serverController = require('../controllers/serverController');

router.get('/', serverController.getServer);
router.get('/guild', serverController.getServerGuild);
router.post('/status', serverController.postServerStatus);
router.post('/shutdown', serverController.postServerShutdown);
router.post('/changeLevel', serverController.postServerChangeLevel);
router.post('/changeGameMode', serverController.postServerChangeGameMode);

module.exports = router;