const {gmLog} = require('../../utils/logger');
const serverModel = require('../../models/v3/serversModels');
const {badArgument} = require("../../utils/tools");

module.exports = (req, res, next) => {
    const {serverID} = req.params;
    const {authorization} = req.headers;

    if (badArgument([serverID, authorization])) {
        return res.status(400).json({error: 'missing_arguments', args: {serverID: !!serverID, token: !!token}});
    }
    const token = authorization.split(' ')[1];

    serverModel.isValidAuth(serverID, token).then((result) => {
        if (result) {
            req.headers.guild = result.guild;
            return next();
        } else {
            gmLog('authValidator', 'unauthorized for serverID: ' + serverID);
            return res.status(401).json({error: 'unauthorized'});
        }
    }).catch((err) => {
        console.error(err);
        return res.status(500).json({error: 'internal_server_error'});
    });
};