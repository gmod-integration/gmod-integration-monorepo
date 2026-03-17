import { reportBugPayload, uploadScreenshotPayload } from '@gmod/core/models/v3/clientsModels.js';
import { type Request, type Response } from 'express';

export async function uploadScreenshot(req: Request, res: Response) {
  const server = req.server!;
  const result = await uploadScreenshotPayload(server, req.body);
  if ('error' in result) {
    return res.status(400).json(result);
  }
  return res.status(200).json(result);
}

export async function reportBugs(req: Request, res: Response) {
  const server = req.server!;
  const result = await reportBugPayload(server, req.body);
  if ('error' in result) {
    return res.status(400).json(result);
  }
  return res.status(200).json(result);
}
