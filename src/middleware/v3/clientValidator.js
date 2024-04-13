const {badArgument} = require("../../utils/tools.js");
const Server = require('../../classes/v3/Server');
const crypto = require('crypto');

module.exports = (req, res, next) => {
    const {serverID, clientID64} = req.params;
    const {authorization} = req.headers;

    if (badArgument([serverID, authorization, clientID64])) {
        return res.status(400).json({
            error: 'missing_arguments',
            args: {
                serverID: !!serverID,
                authorization: !!authorization,
                clientID64: !!clientID64
            }
        });
    }

    const token = authorization.split(' ')[1];
    const userID = authorization.split(' ')[2];

    Server.getServerFromID(serverID).then((server) => {
        if (!server) return res.status(404).json({error: 'server_not_found'});

        const hash = crypto.createHash('sha256');
        hash.update(`${clientID64}-${server.getPublicToken()}-${server.getToken()}-${userID}`);
        const tokenHash = hash.digest('hex');
        if (tokenHash !== token) {
            console.error('Unauthorized', tokenHash, token);
            return res.status(401).json({error: 'unauthorized'});
        }

        req.headers.guild = server.guild;
        req.server = server;
        return next();
    }).catch((err) => {
        console.error(err);
        return res.status(500).json({error: 'internal_server_error'});
    });
};