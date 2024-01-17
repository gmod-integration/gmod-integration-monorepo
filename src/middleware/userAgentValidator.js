const {gmLog} = require("../utils/logger");

module.exports = (req, res, next) => {
    const userAgent = req.headers['user-agent'];

    if (userAgent.includes('Valve/Steam HTTP Client 1.0')) {
        next();
    } else {
        gmLog('userAgentValidator', 'unauthorized');
        res.status(401).json({error: 'unauthorized'});
    }
};