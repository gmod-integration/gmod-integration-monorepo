const {gmLog} = require("../../utils/logger");
const {gmodStoreAPIKey} = require("../../config");
const apiVersions = [
    'v2',
    'v3'
];

module.exports = (req, res, next) => {
    const url = req.url;

    const version = url.split('/')[1];
    if (!apiVersions.includes(version)) {
        gmLog('api version', 'Invalid API Version: ' + (version || 'unknown') + ', redirecting to /v2' + url);
        return res.redirect('/v2' + url);
    }

    return next();
};