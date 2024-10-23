import { saveGmodStorePurchase } from '../../models/webhooks/gmodStoreModels';
import { badArgument } from '../../utils/tools';
import { Request, Response } from 'express';

export default async (req: Request, res: Response) => {
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

  await saveGmodStorePurchase(steamid, user_id, false);
  return res.status(200).send('');
};
