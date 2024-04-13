const errorsModels = require('../../models/v3/errorsModels');
const {badArgument} = require("../../utils/tools.js");

function reportError(req, res) {
    let {
        error,
        stack,
        id,
        name,
        realm,
        identifier,
        uptime,
    } = req.body;

    if (badArgument([error, stack, id, name, realm, identifier, uptime])) {
        return res.status(400).json({
            error: 'bad argument',
            arguments: ['error: ' + !!error, 'stack: ' + !!stack, 'id: ' + !!id, 'name: ' + !!name, 'real: ' + !!realm, 'identifier: ' + !!identifier, 'uptime: ' + !!uptime]
        });
    }

    // if stat is empty list then set it to null
    stack = JSON.stringify(stack);

    errorsModels.reportError({error, stack, id, name, realm, identifier, uptime}).then(() => {
        res.status(200).json({success: true});
    }).catch((err) => {
        console.error(err);
        res.status(500).json({error: 'internal server error'});
    });
}

module.exports = {
    reportError,
}