const express = require('express');
const router = express.Router();
const serverController = require('../controllers/serverController');
const userController = require('../controllers/userController');

router.get('/', serverController.getServer);

router.get('/guild', serverController.getServer);
router.post('/status', serverController.postServerStatus);

router.post('/log/:type', serverController.postServerLog);

router.get('/user', userController.getUser);
router.get('/user/isLinked', userController.getUserIsLinked);
router.post('/user/say', userController.postUserSay);
router.post('/user/connect', userController.postUserConnect);
router.post('/user/disconnect', userController.postUserDisconnect);
router.post('/user/finishConnect', userController.postUserFinishConnect);
router.post('/user/changeName', userController.postUserChangeName);
router.post('/user/kick', userController.postUserKick);
router.post('/user/warn', userController.postUserWarn);
router.post('/user/unwarn', userController.postUserUnwarn);
router.post('/user/mute', userController.postUserMute);
router.post('/user/unmute', userController.postUserUnmute);
router.post('/user/ban', userController.postUserBan);
router.post('/user/unban', userController.postUserUnban);

module.exports = router;