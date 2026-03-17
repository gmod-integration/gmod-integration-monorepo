import { type Request, type Response } from 'express';
import {
  processSteamVerification,
  processSteamVerificationReturn,
} from '@gmod/core/models/v3/steamControllerModels.js';

type SteamResult = ReturnType<typeof processSteamVerification> | Awaited<ReturnType<typeof processSteamVerificationReturn>>;

function sendSteamResult(res: Response, result: SteamResult): void {
  if (result.kind === 'redirect') {
    res.redirect(result.url);
    return;
  }
  if (result.kind === 'text') {
    res.status(result.status).send(result.text);
    return;
  }
  res.status(result.status).json(result.body);
}

export async function steamVerification(req: Request, res: Response): Promise<void> {
  sendSteamResult(res, processSteamVerification(req.query as Record<string, unknown>));
}

export async function steamVerificationReturn(req: Request, res: Response): Promise<void> {
  sendSteamResult(res, await processSteamVerificationReturn(req.query as Record<string, unknown>));
}
