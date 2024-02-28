const {Client, GatewayIntentBits} = require('discord.js');
const client = new Client({
    intents: [
        GatewayIntentBits.AutoModerationConfiguration,
        GatewayIntentBits.AutoModerationExecution,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildBans,
        GatewayIntentBits.GuildEmojisAndStickers,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildScheduledEvents,
        GatewayIntentBits.GuildWebhooks,
        GatewayIntentBits.Guilds,
        GatewayIntentBits.MessageContent,
    ]
});
const {
    token,
} = require('../config/index');
const {readdirSync} = require("fs");

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


// Load Events
const eventFiles = readdirSync('./src/discord/events').filter(file => file.endsWith('.js'));
for (const file of eventFiles) {
    const event = require(`./events/${file}`);
    if (event.name) {
        client.on(event.name, (...args) => event.execute(...args, client));
    }
}

function updateGuildUserPseudo(guildID, userID, pseudo) {
    return new Promise((resolve, reject) => {
        if (!guildID || !userID || !pseudo) {
            return reject({
                error: 'missing_arguments',
                args: {
                    guildID: !!guildID,
                    userID: !!userID,
                    pseudo: !!pseudo,
                }
            });
        }

        getClient().then(async (client) => {
            const guild = client.guilds.cache.get(guildID);
            if (!guild) {
                return reject('Guild not found');
            }

            if (guild.ownerId === userID) {
                return resolve();
            }

            guild.members.fetch(userID)
                .then(member => {
                    if (!member) {
                        return reject('User not found');
                    }
                    member.setNickname(pseudo)
                        .then(updatedMember => {
                            return resolve(updatedMember);
                        })
                        .catch(reject);
                })
                .catch(reject);
        }).catch(reject);
    });
}

module.exports = {
    getClient,
    updateGuildUserPseudo,
}