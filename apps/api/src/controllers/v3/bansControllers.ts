import { isGlobalBan } from '@gmod/domain-moderation/bansModels.js';
import { ipGetIP } from '@gmod/core/utils/tools.js';
import { type Request, type Response } from 'express';

export async function isGlobalBanSomewhere(req: Request, res: Response) {
  const { steamID64, IP, discordID } = req.query;
  return res
    .status(200)
    .json(await isGlobalBan(IP ? ipGetIP(IP as string) : null, discordID as string, steamID64 as string));
}
