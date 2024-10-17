import { saveGmodStorePurchase } from '../../models/webhooks/gmodStoreModels.js';
import { badArgument } from '../../utils/tools.ts';

export default async (req, res) => {
  const { steamid, user_id } = req.body;

  if (badArgument([steamid, user_id])) {
    return res.status(400).json({
      error: 'missing_arguments',
      args: {
        steamid: !!steamid,
        user_id: !!user_id,
      },
    });
  }

  await saveGmodStorePurchase(req.body.steamid, req.body.user_id, false);
  return res.status(200).send('');
};
