import { isGlobalBan } from '../../models/v3/bansModels.js';
import { ipGetIP } from '../../utils/tools.ts';

export async function isGlobalBanSomewhere(req, res) {
  const { steamID64, IP, discordID } = req.query;
  return res.status(200).json(await isGlobalBan(IP && ipGetIP(IP), discordID, steamID64));
}
