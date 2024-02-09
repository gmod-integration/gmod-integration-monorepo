const {getConnection} = require('../../database/connection');
const {gmLog} = require('../../utils/logger');
const crypto = require('crypto');

module.exports = (req, res, next) => {
    const {id, token} = req.headers;
    const {steamID64} = req.body;

    if (!id || !token || !steamID64) {
        return res.status(401).json({
            error: 'missing_arguments',
            args: {
                id: !!id,
                token: !!token,
                steamID64: !!steamID64
            }
        });
    }

    getConnection().then(connection => {
        connection.query('SELECT * FROM gm_server WHERE id = ?', [id], (error, results) => {
            if (error) {
                gmLog('authValidator', 'Internal Server Error');
                console.error(error);
                return res.status(500).json({error: 'internal_server_error'});
            }
            if (results.length > 0) {
                req.headers.guild = results[0].guild;
                // use RSA to check token (steamid64 + '-' + token + '-' + publicTempToken)
                const srtCheck = steamID64 + '-' + results[0].token + '-' + results[0].publicTempToken;
                // use sha256 to hash the string
                const hash = crypto.createHash('sha256');
                hash.update(srtCheck);
                const hashString = hash.digest('hex');
                // compare the hash with the token
                if (hashString !== token) {
                    gmLog('authValidator', 'unauthorized');
                    return res.status(401).json({error: 'unauthorized'});
                }
                next();
            } else {
                gmLog('authValidator', 'unauthorized');
                return res.status(401).json({error: 'unauthorized'});
            }
        });
    });
};