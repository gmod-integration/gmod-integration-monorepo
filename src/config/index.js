require('dotenv').config();

exports.dbConfig = {
    host: process.env.DATABASE_HOST,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    port: process.env.DATABASE_PORT,
    "connectTimeout": 60000,
    "charset": "utf8mb4_unicode_ci"
};
exports.bodyLimit = '10mb';
exports.port_api = process.env.PORT_API;
exports.bot_token = process.env.DISCORD_BOT_TOKEN;
exports.steamAPI = process.env.STEAM_API_KEY;
exports.signingSecretWebhook = process.env.SIGNING_SECRET_WEBHOOK;
exports.gmodStoreAPIKey = process.env.GMODSTORE_API_KEY;
exports.productID = "7523cd69-0370-47c6-82e6-39675e9a56d3";
exports.token = process.env.DISCORD_BOT_TOKEN;
exports.production = process.env.PRODUCTION;
exports.domain = process.env.DOMAIN_URL;
exports.port_website = process.env.PORT_WEBSITE;
exports.intern_websocket_token = process.env.INTERN_WEBSOCKET_TOKEN;