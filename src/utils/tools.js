function checkMissingArgs(requiredArgs, location) {
    return function (req, res, next) {
        const missingArgs = [];

        requiredArgs.forEach((arg) => {
            let value;
            switch (location) {
                case 'body':
                    value = req.body[arg];
                    break;
                case 'header':
                    value = req.headers[arg.toLowerCase()];
                    break;
                case 'query':
                    value = req.query[arg];
                    break;
                default:
                    value = undefined;
            }
            if (value === undefined || value === null) {
                missingArgs.push(arg);
            }
        });

        if (missingArgs.length > 0) {
            return res.status(400).json({ message: `Missing arguments: ${missingArgs.join(', ')}` });
        }

        next();
    }
}

function badArgument(list) {
    for (let i = 0; i < list.length; i++) {
        if (list[i] === undefined) {
            return true;
        }
    }
    return false;
}

function ipGetIP(ip) {
    if (!ip || typeof ip !== 'string' || ip.length === 0) {
        return '';
    }
    return ip.split(':')[0];
}

module.exports = {
    checkMissingArgs,
    badArgument,
    ipGetIP
};