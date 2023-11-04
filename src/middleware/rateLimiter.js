const rateLimit = require('express-rate-limit');

module.exports = rateLimit({
    windowMs: 60 * 1000, // Time in milliseconds to keep records of requests in memory
    max: 100, // Max number of requests per IP
    message: "Too many requests from this IP, please try again in an hour"
});