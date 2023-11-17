const {getConnection} = require('../database/connection');
const {gmLog} = require('../utils/logger');

module.exports = (req, res, next) => {
    const {id, token} = req.headers;

    if (!id || !token) {
        return res.status(401).json({
            error: 'missing_arguments',
            args: {
                id: !!id,
                token: !!token,
            }
        });
    }

    getConnection().then(connection => {
        connection.query('SELECT * FROM gm_server WHERE id = ? AND token = ?', [id, token], (error, results) => {
            if (error) {
                gmLog('authValidator', 'Internal Server Error');
                console.error(error);
                return res.status(500).json({error: 'internal_server_error'});
            }
            if (results.length > 0) {
                req.headers.guild = results[0].guild;
                next();
            } else {
                gmLog('authValidator', 'unauthorized');
                return res.status(401).json({error: 'unauthorized'});
            }
        });
    });
};