const {Client, GatewayIntentBits} = require('discord.js');
const client = new Client({
    intents: [
        GatewayIntentBits.GuildWebhooks,
        GatewayIntentBits.Guilds,
    ]
});
const {
    token,
} = require('../config/index');

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

client.login(token).catch(console.error);

async function getClient() {
    if (client.readyAt) {
        return client;
    } else {
        await new Promise(resolve => {
            client.on('ready', () => {
                resolve();
            });
        });
        return client;
    }
}

module.exports = {
    getClient
}