import { type Request, type Response } from 'express'
import { reportGmodErrorPayloadSafe } from '@gmod/core/models/gmod/gmodErrorsModels.js'

export async function reportError(req: Request, res: Response) {
  const serverID = Array.isArray(req.params.serverID) ? req.params.serverID[0] : req.params.serverID
  const steamID64 = Array.isArray(req.params.steamID64) ? req.params.steamID64[0] : req.params.steamID64
  const result = await reportGmodErrorPayloadSafe(req.body, { serverID, steamID64 })
  return res.status(result.status).json(result.body)
}
