import { logServer } from '@gmod/core/utils/logger.js'
import { type Request, type Response } from 'express'
import { timeRequestStep } from '../../utils/requestTiming.js'
import {
  processCHATMDepositMoney,
  processCHATMReceiveMoney,
  processCHATMSendMoney,
  processCHATMTakeMoney,
  processCHATMWithdrawMoney,
  processDarkRPDropMoney,
  processDarkRPPickedUpCheque,
  processDarkRPPickedUpMoney,
  processMultiLog,
  processPostIGSettings,
  processPostStatus,
  processServerImportWarns,
} from '@gmod/core/models/v3/serversControllerModels.js'

export async function postIGSettings(req: Request, res: Response) {
  const server = req.server!
  const result = await processPostIGSettings(server, req.body)
  return res.status(result.status).json(result.body)
}

export async function getIGSettings(req: Request, res: Response) {
  const server = req.server!
  const settings = await timeRequestStep(res, 'config', () => server.getAllIGSettings())
  return res.status(200).json({
    settings: {
      ...settings,
      ...(req.panelUser ? { maintenance_whitelist_role: await server.getSetting('maintenance_whitelist_role') } : {}),
    },
  })
}

export async function postStatus(req: Request, res: Response) {
  const server = req.server!
  const result = await processPostStatus(server, req.body)
  return res.status(result.status).json(result.body)
}

export async function serverImportWarns(req: Request, res: Response) {
  const server = req.server!
  const result = await processServerImportWarns(server, req.body.warns)
  return res.status(result.status).json(result.body)
}

export async function serverStart(req: Request, res: Response) {
  const server = req.server!
  await logServer(server, 'server_start')
  return res.status(200).json({ success: true })
}

export async function serverStop(req: Request, res: Response) {
  const server = req.server!
  await logServer(server, 'server_stop')
  return res.status(200).json({ success: true })
}

export async function getInfo(req: Request, res: Response) {
  const server = req.server!
  return res.status(200).json({ id: server.id, name: server.name, guild: server.guild })
}

export async function getPublicToken(req: Request, res: Response) {
  const server = req.server!
  await server.regeneratePublicTempToken()
  return res.status(200).json({ publicTempToken: server.getPublicToken() })
}

export async function postDarkRPDropMoney(req: Request, res: Response) {
  const server = req.server!
  const result = await processDarkRPDropMoney(server, req.body)
  return res.status(result.status).json(result.body)
}

export async function postDarkRPPickedUpMoney(req: Request, res: Response) {
  const server = req.server!
  const result = await processDarkRPPickedUpMoney(server, req.body)
  return res.status(result.status).json(result.body)
}

export async function postDarkRPPickedUpCheque(req: Request, res: Response) {
  const server = req.server!
  const result = await processDarkRPPickedUpCheque(server, req.body)
  return res.status(result.status).json(result.body)
}

export async function postCHATMTakeMoney(req: Request, res: Response) {
  const server = req.server!
  const result = await processCHATMTakeMoney(server, req.body)
  return res.status(result.status).json(result.body)
}

export async function postCHATMReceiveMoney(req: Request, res: Response) {
  const server = req.server!
  const result = await processCHATMReceiveMoney(server, req.body)
  return res.status(result.status).json(result.body)
}

export async function postCHATMSendMoney(req: Request, res: Response) {
  const server = req.server!
  const result = await processCHATMSendMoney(server, req.body)
  return res.status(result.status).json(result.body)
}

export async function postCHATMWithdrawMoney(req: Request, res: Response) {
  const server = req.server!
  const result = await processCHATMWithdrawMoney(server, req.body)
  return res.status(result.status).json(result.body)
}

export async function postCHATMDepositMoney(req: Request, res: Response) {
  const server = req.server!
  const result = await processCHATMDepositMoney(server, req.body)
  return res.status(result.status).json(result.body)
}

export async function postMultiLog(req: Request, res: Response) {
  const logs = Array.isArray(req.body) ? req.body : []
  const server = req.server!
  const result = await processMultiLog(server, logs)
  return res.status(result.status).json(result.body)
}
