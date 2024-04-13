import {gmLog} from '../utils/logger.js';
import {v4 as uuidv4} from 'uuid';

export default async (err, req, res) => {
    const error_uuid = uuidv4();
    gmLog('error', `Error UUID: ${error_uuid}`, err);
    return res.status(500).json({error: 'internal_server_error', error_uuid});
}