import {gmLog} from '../utils/logger.js';

export default async (err, req, res) => {
    const error_uuid = require('uuid').v4();

    gmLog('error', `Error UUID: ${error_uuid}`, err);
    return res.status(500).json({error: 'internal_server_error', error_uuid});
}