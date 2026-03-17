import { getUser, saveGmodStorePurchase } from '@/models/webhooks/gmodStoreModels.js';
import { Request, Response } from 'express';

export default async (req: Request, res: Response) => {
  const user_id = req.body.data.userId;
  if (!user_id) {
    return res.status(400).json({ error: 'missing_arguments', args: { user_id: !!user_id } });
  }

  const user = await getUser(user_id);
  if (!user || !user.data.steamId) {
    return res.status(404).json({ error: 'user_not_found' });
  }

  const eventType = req.body.eventType;
  if (!eventType) {
    return res.status(400).json({ error: 'missing_arguments', args: { eventType: !!eventType } });
  }

  switch (eventType) {
    case 'product_purchase.created':
      await saveGmodStorePurchase(user.data.steamId, user_id, false);
      break;
    case 'product_purchase.unrevoked':
      await saveGmodStorePurchase(user.data.steamId, user_id, false);
      break;
    case 'product_purchase.deleted':
      await saveGmodStorePurchase(user.data.steamId, user_id, true);
      break;
    case 'product_purchase.revoked':
      await saveGmodStorePurchase(user.data.steamId, user_id, true);
      break;
    default:
      return res.status(400).json({ error: 'invalid_event_type' });
  }

  return res.status(200).json({ success: true });
};
