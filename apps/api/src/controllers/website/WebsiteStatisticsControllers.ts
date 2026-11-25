import type { Request, Response } from 'express'
import { processGetServerStatistics } from '@gmod/core/models/v3/serverStatisticsModels.js'

export async function getServerStatistics(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store')
  const result = await processGetServerStatistics(req.server!.getID(), req.query)
  return res.status(result.status).json(result.body)
}
