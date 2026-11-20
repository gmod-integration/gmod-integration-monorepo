import { getSingleParam } from '@/utils/requestParams.js'
import { type Request, type Response } from 'express'
import { getServerErrorsPayloadSafe } from '@gmod/core/models/gmod/gmodErrorsModels.js'

export async function getServerErrors(req: Request, res: Response) {
  const serverID = getSingleParam(req.params.serverID)
  const result = await getServerErrorsPayloadSafe(req.query, serverID)
  return res.status(result.status).json(result.body)
}
