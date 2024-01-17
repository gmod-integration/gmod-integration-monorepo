require('dotenv').config();

const dbConfig = process.env.dbConfig;
const port_api = process.env.PORT_API;
const bot_token = process.env.DISCORD_BOT_TOKEN;
const steamAPI = process.env.STEAM_API_KEY;

module.exports = {
    dbConfig,
    port_api,
    bot_token,
    steamAPI,
};