const express = require('express');
const router = express.Router();

// Validator
const authValidatorMiddleware = require("../../middleware/v2/authValidator");
router.use('/', authValidatorMiddleware);

// Routes
const userController = require("../../controllers/v2/userController");
router.get('/', userController.getUser);
router.get('/isLinked', userController.getUserIsLinked);
router.post('/say', userController.postUserSay);
router.post('/connect', userController.postUserConnect);
router.post('/disconnect', userController.postUserDisconnect);
router.post('/finishConnect', userController.postUserFinishConnect);
router.post('/changeName', userController.postUserChangeName);
router.post('/kick', userController.postUserKick);
router.post('/warn', userController.postUserWarn);
router.post('/unwarn', userController.postUserUnwarn);
router.post('/mute', userController.postUserMute);
router.post('/unmute', userController.postUserUnmute);
router.post('/ban', userController.postUserBan);
router.post('/unban', userController.postUserUnban);

// Export
module.exports = router;