import { processGmodStoreWebhook } from '@gmod/core/models/webhooks/gmodStoreModels.js';
import { Request, Response } from 'express';

export default async (req: Request, res: Response) => {
  const result = await processGmodStoreWebhook(req.body);
  return res.status(result.status).json(result.body);
};
