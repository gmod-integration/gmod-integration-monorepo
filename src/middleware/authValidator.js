const { getConnection } = require('../database/connection');
const { gmLog } = require('../utils/logger');

module.exports = (req, res, next) => {
    const { id, token } = req.headers;

    if (!id || !token) {
        return res.status(401).json({ error: 'Missing Credentials' });
    }

    getConnection().then(connection => {
        connection.query('SELECT * FROM gm_server WHERE id = ? AND token = ?', [id, token], (error, results) => {
            if (error) {
                gmLog('authValidator', 'Internal Server Error');
                console.error(error);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            if (results.length > 0) {
                req.headers.guild = results[0].guild;
                next();
            } else {
                gmLog('authValidator', 'Invalid Auth');
                return res.status(401).json({ error: 'Unauthorized' });
            }
        });
    });
};