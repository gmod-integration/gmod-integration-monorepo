import { getStats } from '../../models/v3/mainModels';
import { Request, Response } from 'express';

export async function getActualStats(req: Request, res: Response) {
  return res.json(await getStats());
}
