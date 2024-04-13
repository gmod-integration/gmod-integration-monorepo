export function checkMissingArgs(requiredArgs, location) {
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
            return res.status(400).json({message: `Missing arguments: ${missingArgs.join(', ')}`});
        }

        next();
    }
}

export function badArgument(list) {
    let valid = true;
    const failedArg = [];

    for (let i = 0; i < list.length; i++) {
        if (list[i] === undefined) {
            valid = false;
            failedArg.push(i);
        }
    }

    if (!valid) {
        return failedArg.join(', ');
    }

    return false;
}

export function ipGetIP(ip) {
    if (!ip || typeof ip !== 'string' || ip.length === 0) {
        return '';
    }
    return ip.split(':')[0];
}

export function generateToken(length) {
    let token = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < length; i++) {
        token += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return token;
}