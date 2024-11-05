import { isGlobalBan } from '../../models/v3/bansModels.js';
import { ipGetIP } from '../../utils/tools.js';
import { Request, Response } from 'express';

export async function isGlobalBanSomewhere(req: Request, res: Response) {
  const { steamID64, IP, discordID } = req.query;
  return res
    .status(200)
    .json(await isGlobalBan(IP ? ipGetIP(IP as string) : null, discordID as string, steamID64 as string));
}
