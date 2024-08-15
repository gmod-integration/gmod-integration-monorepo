import { gmLog } from '../../utils/logger.js';
import { gmodStoreConfig } from '../../config/index.js';

export default async (req, res, next) => {
  const payload = req.body;

  if (!payload.extra) {
    gmLog('error', 'No extra field in payload');
    return res.status(401).send('unauthorized');
  }

  if (payload.extra !== gmodStoreConfig.secretWebhook) {
    gmLog('error', 'Invalid secret');
    return res.status(401).send('unauthorized');
  }

  return next();
};
