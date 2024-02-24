module.exports = async (err, req, res, next) => {
    const error_uuid = require('uuid').v4();

    console.log(`Error UUID: ${error_uuid}`, err);
    return res.status(500).json({error: 'internal_server_error', error_uuid});
}