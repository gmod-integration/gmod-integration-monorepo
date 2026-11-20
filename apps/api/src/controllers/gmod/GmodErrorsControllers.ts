import { getSingleParam } from '@/utils/requestParams.js'
import { type Request, type Response } from 'express'
import { reportGmodErrorPayloadSafe } from '@gmod/core/models/gmod/gmodErrorsModels.js'

export async function reportError(req: Request, res: Response) {
  const serverID = getSingleParam(req.params.serverID)
  const steamID64 = getSingleParam(req.params.steamID64)
  const result = await reportGmodErrorPayloadSafe(req.body, { serverID, steamID64 })
  return res.status(result.status).json(result.body)
}
