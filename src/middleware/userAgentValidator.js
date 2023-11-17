const authUserAgent = [
    'Valve/Steam HTTP Client 1.0 (4000)'
]

module.exports = (req, res, next) => {
    const userAgent = req.headers['user-agent'];

    if (authUserAgent.includes(userAgent)) {
        next();
    } else {
        res.status(401).json({error: 'unauthorized'});
    }
};