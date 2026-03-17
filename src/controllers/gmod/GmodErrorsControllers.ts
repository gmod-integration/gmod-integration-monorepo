import { Request, Response } from 'express';
import { GmodErrors } from '@gmod/domain-gmod/GmodErrors.js';

export async function reportError(req: Request, res: Response) {
  const { error, stack, id, name, realm, uptime, count } = req.body;
  const { serverID, steamID64 } = req.params;

  let plyError: GmodErrors;
  try {
    plyError = GmodErrors.from({
      error,
      stack: JSON.stringify(stack),
      workshopID: id,
      name,
      realm,
      uptime,
      count,
      serverID,
      steamID64,
    });
  } catch (err) {
    return res.status(400).json({ error: 'Invalid error data' });
  }

  const rtnError = await plyError.save();
  return res.status(200).json(rtnError);
}
