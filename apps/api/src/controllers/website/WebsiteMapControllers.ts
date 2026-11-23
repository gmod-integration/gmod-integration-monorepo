import type { Request, Response } from 'express'
import { processGetServerMap } from '@gmod/core/models/v3/serverMapModels.js'

export async function getServerMap(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store')
  const snapshot = await processGetServerMap(req.server!.getID())
  return res.status(200).json(snapshot)
}
