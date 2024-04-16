const whitelist = [
    'https://dev.gmod-integration.com',
    'https://gmod-integration.com',
];

export default {
    origin: function (origin, callback) {
        if (whitelist.indexOf(origin) !== -1 || !origin) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    }
};