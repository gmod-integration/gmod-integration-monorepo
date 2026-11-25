import { getSingleParam } from '@/utils/requestParams.js'
import { type Request, type Response } from 'express'
import { getServerErrorsPayloadSafe } from '@gmod/core/models/gmod/gmodErrorsModels.js'
import {
  getLuaErrorChannel,
  setLuaErrorChannel,
  removeLuaErrorChannel,
  LuaErrorChannelError,
} from '@gmod/core/models/gmod/luaErrorChannels.js'

export async function getServerErrors(req: Request, res: Response) {
  const serverID = getSingleParam(req.params.serverID)
  const result = await getServerErrorsPayloadSafe(req.query, serverID, req.server!.guild)
  return res.status(result.status).json(result.body)
}

export async function getServerErrorsChannel(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store')
  return res.json(await getLuaErrorChannel(req.server!.id))
}

export async function postServerErrorsChannel(req: Request, res: Response) {
  try {
    return res.json(await setLuaErrorChannel(req.server!.id, req.body))
  } catch (error) {
    if (error instanceof LuaErrorChannelError) return res.status(error.status).json({ error: error.code })
    throw error
  }
}

export async function deleteServerErrorsChannel(req: Request, res: Response) {
  return res.json(await removeLuaErrorChannel(req.server!.id))
}
