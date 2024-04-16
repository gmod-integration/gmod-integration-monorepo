import { gmLog } from '../../utils/logger.js';
import { verifyWebhookSignature } from '../../models/webhooks/gmodStoreModels.js';

export default async (req, res, next) => {
  const headers = req.headers;
  const payload = req.body;

  if (await verifyWebhookSignature(headers, payload)) {
    next();
  } else {
    gmLog('webhooks', 'gmodStoreValidator', 'unauthorized');
    return res.status(401).json({ error: 'unauthorized' });
  }
};
