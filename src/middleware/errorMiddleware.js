module.exports = async (err, req, res, next) => {
    console.log(err);
    res.status(500).json({error: 'internal_server_error', message: err.message});
    next();
}