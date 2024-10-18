import { v4 as uuidv4 } from 'uuid';
import { gmLog } from '../utils/logger';
import { NextFunction, Request, Response } from 'express';

export default async (err: Error, req: Request, res: Response, next: NextFunction) => {
  const error_uuid = uuidv4();
  gmLog('error', `Error UUID: ${error_uuid}`);
  console.error(err);
  res.status(500).json({ error: 'internal_server_error', error_uuid });
};
