import { getStats } from '@gmod/core/models/v3/mainModels.js';
import { type Request, type Response } from 'express';

export async function getActualStats(req: Request, res: Response) {
  return res.json(await getStats());
}
