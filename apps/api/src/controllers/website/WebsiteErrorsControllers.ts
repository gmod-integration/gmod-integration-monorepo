import { Request, Response } from 'express';
import { Query } from '@gmod/core/classes/db/Query.js';
import { getErrorsByServer } from '@gmod/domain-gmod/GmodErrors.js';

export async function getServerErrors(req: Request, res: Response) {
  const { serverID } = req.params;

  let query: Query;
  try {
    query = Query.from(req.query);
  } catch (err) {
    console.error('Invalid query parameters:', err);
    return res.status(400).json({ error: 'Invalid query parameters' });
  }

  const errors = await getErrorsByServer(query, serverID);
  return res.send(errors || []);
}
