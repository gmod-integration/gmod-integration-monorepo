import { gmLog } from '../../utils/logger.js';
import { NextFunction, Request, Response } from 'express';
import { verifyWebhookSignature } from '../../models/webhooks/gmodStoreModels.js';

export default async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const payload = req.body;

    if (!(await verifyWebhookSignature(req.headers, payload))) {
      gmLog('error', 'Invalid signature');
      res.status(401).send('unauthorized');
      return;
    }

    return next();
  } catch (error) {
    return next(error);
  }
};
