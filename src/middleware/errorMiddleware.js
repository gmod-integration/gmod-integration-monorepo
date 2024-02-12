module.exports = async (err, req, res, next) => {
    if (res.headersSent) {
        return next(err);
    }

    console.log(err);
    res.status(500).json({error: 'internal_server_error', message: err.message});
    next();
}