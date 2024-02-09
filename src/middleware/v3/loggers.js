const logger = require("../../utils/logger");

// url example: /v3/servers/:serverID
// script is execute a the main entry point of the server so no parameters are passed
module.exports = (req, res, next) => {
    const method = req.method;
    const url = req.url;
    const ip = req.headers['cf-connecting-ip'] || req.ip;
    let id = req.params.serverID || 'unknown';
    let body = JSON.stringify(req.body);

    if (url.includes('screenshots')) {
        body = '[REDACTED]';
    }

    const query = JSON.stringify(req.query);
    const version = req.headers['version'] || 'unknown';

    // if start with /v? extract the server id from the url
    if (url.startsWith('/v')) {
        id = url.split('/')[2];
    }


    logger.gmLog('api', ' Method: ' + method + ' URL: ' + url + ' IP: ' + ip + ' Version: ' + version + ' Server ID: ' + id + ' Body: ' + body + ' Query: ' + query);

    next();
};