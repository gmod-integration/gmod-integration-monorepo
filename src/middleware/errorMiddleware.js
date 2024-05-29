import { v4 as uuidv4 } from 'uuid';
import { gmLog } from '../utils/logger.js';

export default async (err, req, res, next) => {
  const error_uuid = uuidv4();
  gmLog('error', `Error UUID: ${error_uuid}`);
  console.error(err);
  return res.status(500).json({ error: 'internal_server_error', error_uuid });
};
