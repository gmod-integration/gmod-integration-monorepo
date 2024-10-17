import { gmLog } from '../../utils/logger';
import { gmodStoreConfig } from '../../config';
import { NextFunction, Request, Response } from 'express';

export default async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const payload = req.body;

    if (!payload.extra) {
      gmLog('error', 'No extra field in payload');
      res.status(401).send('unauthorized');
      return;
    }

    if (payload.extra !== gmodStoreConfig.secretWebhook) {
      gmLog('error', 'Invalid secret');
      res.status(401).send('unauthorized');
      return;
    }

    return next();
  } catch (error) {
    return next(error);
  }
};
