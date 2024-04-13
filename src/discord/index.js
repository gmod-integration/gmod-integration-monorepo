import {Client, Collection, Events, GatewayIntentBits} from 'discord.js';
import {discordConfig} from '../config/index.js';
import {readdirSync} from 'fs';
import {gmLog} from '../utils/logger.js';
import {join} from 'path';

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

const eventFiles = readdirSync(join(process.cwd(), 'src/discord/events')).filter(file => file.endsWith('.js'));
for (const file of eventFiles) {
    const filePath = join(process.cwd(), 'src/discord/events', file);
    import(filePath).then((event) => {
        if (event.default && event.default.name) {
            client.on(event.default.name, event.default.execute);
            gmLog('event', `Event ${filePath} loaded`);
        } else {
            if (!event.default) {
                gmLog('event', `Event ${filePath} is missing default export`);
            }
            if (!event.default.name) {
                gmLog('event', `Event ${filePath} is missing name`);
            }
        }
    });
}

// Load Slash Commands
let commands = new Collection();
const foldersPath = join(process.cwd(), 'src/discord/commands');
const commandFolders = readdirSync(foldersPath);

for (const folder of commandFolders) {
    const commandsPath = join(foldersPath, folder);
    const commandFiles = readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const filePath = join(commandsPath, file);
        import(filePath).then((command) => {
            if (command.default && command.default.data) {
                commands.set(command.default.data.name, command.default);
                gmLog('command', `Command ${filePath} loaded`);
            } else {
                if (!command.default) {
                    gmLog('command', `Command ${filePath} is missing default export`);
                }
                if (!command.default.data) {
                    gmLog('command', `Command ${filePath} is missing data`);
                }
            }
        });
    }
}

client.on(Events.InteractionCreate, async interaction => {
    const command = commands.get(interaction.commandName);
    if (!command) return;

    if (interaction.isChatInputCommand()) {
        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(error);
        }
    } else if (interaction.isAutocomplete()) {
        try {
            await command.autocomplete(interaction);
        } catch (error) {
            console.error(error);
        }
    }
});

export async function getClient() {
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

export function updateGuildUserPseudo(guildID, userID, pseudo) {
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

client.on('ready', () => {
    gmLog('discord', 'Connected to Discord');
});

client.login(discordConfig.botToken).catch(console.error);