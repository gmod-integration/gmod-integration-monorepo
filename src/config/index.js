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

exports.port_api = 53136;
exports.bot_token = process.env.DISCORD_BOT_TOKEN;
exports.steamAPI = process.env.STEAM_API_KEY;