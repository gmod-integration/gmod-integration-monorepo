import express from 'express';
import serverValidator from '../../middleware/v3/serverValidator.js';
import {
  getInfo,
  getPublicToken,
  postCHATMDepositMoney,
  postCHATMReceiveMoney,
  postCHATMSendMoney,
  postCHATMTakeMoney,
  postCHATMWithdrawMoney,
  postDarkRPDropMoney,
  postDarkRPPickedUpCheque,
  postDarkRPPickedUpMoney,
  postMultiLog,
  postStatus,
  serverImportWarns,
  serverStart,
  serverStop,
} from '../../controllers/v3/serversControllers.js';
import { reportError } from '../../controllers/v3/errorsControllers.js';
import {
  getPlayer,
  playerBan,
  playerChangeGroup,
  playerChangeName,
  playerChangeTeam,
  playerConnect,
  playerDeath,
  playerDisconnect,
  playerGive,
  playerHurt,
  playerInitialSpawn,
  playerReady,
  playerSay,
  playerSpawn,
  playerSpawnObject,
  playerWarn,
} from '../../controllers/v3/serversPlayersController.js';
import asyncHandler from '../../middleware/asyncHandler.js';

const router = express.Router();

router.use('/:serverID', serverValidator);

router.get('/:serverID', asyncHandler(getInfo));
router.post('/:serverID/status', asyncHandler(postStatus));
router.get('/:serverID/public-token', asyncHandler(getPublicToken));
router.post('/:serverID/errors', asyncHandler(reportError));
router.post('/:serverID/start', asyncHandler(serverStart));
router.post('/:serverID/stop', asyncHandler(serverStop));
router.post('/:serverID/warns', asyncHandler(serverImportWarns));
router.post('/:serverID/logs', asyncHandler(postMultiLog));
router.get('/:serverID/players/:steamID64', asyncHandler(getPlayer));
router.post('/:serverID/players/:steamID64/say', asyncHandler(playerSay));
router.post('/:serverID/players/:steamID64/warns', asyncHandler(playerWarn));
router.post('/:serverID/players/:steamID64/bans', asyncHandler(playerBan));
router.post('/:serverID/players/:steamID64/death', asyncHandler(playerDeath));
router.post('/:serverID/players/:steamID64/initial-spawn', asyncHandler(playerInitialSpawn));
router.post('/:serverID/players/:steamID64/hurt', asyncHandler(playerHurt));
router.post('/:serverID/players/:steamID64/give', asyncHandler(playerGive));
router.post('/:serverID/players/:steamID64/spawn/:object', asyncHandler(playerSpawnObject));
router.post('/:serverID/players/:steamID64/connect', asyncHandler(playerConnect));
router.post('/:serverID/players/:steamID64/disconnect', asyncHandler(playerDisconnect));
router.post('/:serverID/players/:steamID64/ready', asyncHandler(playerReady));
router.post('/:serverID/players/:steamID64/spawn', asyncHandler(playerSpawn));
router.post('/:serverID/players/:steamID64/name', asyncHandler(playerChangeName));
router.post('/:serverID/players/:steamID64/group', asyncHandler(playerChangeGroup));
router.post('/:serverID/players/:steamID64/team', asyncHandler(playerChangeTeam));

// Dark RP
router.post('/:serverID/players/:steamID64/dark-rp/drop-money', asyncHandler(postDarkRPDropMoney));
router.post('/:serverID/players/:steamID64/dark-rp/picked-up-money', asyncHandler(postDarkRPPickedUpMoney));
router.post('/:serverID/players/:steamID64/dark-rp/picked-up-cheque', asyncHandler(postDarkRPPickedUpCheque));
// CH ATM
router.post('/:serverID/players/:steamID64/ch-atm/send-money', asyncHandler(postCHATMSendMoney));
router.post('/:serverID/players/:steamID64/ch-atm/take-money', asyncHandler(postCHATMTakeMoney));
router.post('/:serverID/players/:steamID64/ch-atm/receive-money', asyncHandler(postCHATMReceiveMoney));
router.post('/:serverID/players/:steamID64/ch-atm/withdraw-money', asyncHandler(postCHATMWithdrawMoney));
router.post('/:serverID/players/:steamID64/ch-atm/deposit-money', asyncHandler(postCHATMDepositMoney));

export default router;
