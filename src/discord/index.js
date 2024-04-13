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
        // GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildWebhooks,
        GatewayIntentBits.Guilds,
        GatewayIntentBits.MessageContent,
    ]
});

client.on('ready', () => {
    gmLog('discord', 'Connected to Discord');
});

client.login(discordConfig.botToken).catch(console.error);

// Load Events
const eventFiles = readdirSync('./src/discord/events').filter(file => file.endsWith('.js'));
for (const file of eventFiles) {
    const event = await import(`./events/${file}`);
    if (event.name) {
        client.on(event.name, (...args) => event.execute(...args, client));
    }
}

// Load Slash Commands
client.commands = new Collection();
const foldersPath = join(__dirname, 'commands');
const commandFolders = readdirSync(foldersPath);

for (const folder of commandFolders) {
    const commandsPath = join(foldersPath, folder);
    const commandFiles = readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const filePath = join(commandsPath, file);
        const command = await import(filePath);

        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
            console.log(`[INFO] Loaded command ${command.data.name} from ${filePath}`);
        } else {
            console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
        }
    }
}

client.on(Events.InteractionCreate, async interaction => {
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);

        if (!command) return;

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(error);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    content: 'There was an error while executing this command!',
                    ephemeral: true
                });
            } else {
                await interaction.reply({content: 'There was an error while executing this command!', ephemeral: true});
            }
        }
    } else if (interaction.isAutocomplete()) {
        const command = interaction.client.commands.get(interaction.commandName);

        if (!command) {
            console.error(`No command matching ${interaction.commandName} was found.`);
            return;
        }

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