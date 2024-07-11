import { getUser, saveGmodStorePurchase } from '../../models/webhooks/gmodStoreModels.js';

async function productPurchase(req, res, event) {
  const userID = req.body.data.userId;
  const revoke = event === 'product_purchase.revoked';

  if (!userID) return res.status(400).json({ error: 'missing_arguments' });

  try {
    const user = await getUser(userID);
    await saveGmodStorePurchase(user.data.steamId, revoke);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'internal_error' });
  }
}

export default async (req, res) => {
  const event = req.body.eventType;

  if (!event) return res.status(400).json({ error: 'missing_arguments' });

  if (['product_purchase.created', 'product_purchase.unrevoked', 'product_purchase.revoked'].includes(event)) {
    await productPurchase(req, res, event);
  } else {
    res.status(400).json({ error: 'invalid_event' });
  }
};
