import { Client, Collection, Events, GatewayIntentBits, Partials } from 'discord.js';
import { discordConfig } from '../config/index.js';
import { readdirSync } from 'fs';
import { gmLog } from '../utils/logger.js';
import { join } from 'path';

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
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
});

const eventFiles = readdirSync(join(process.cwd(), 'src/discord/events')).filter((file) => file.endsWith('.js'));
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
  const commandFiles = readdirSync(commandsPath).filter((file) => file.endsWith('.js'));

  for (const file of commandFiles) {
    const filePath = join(commandsPath, file);
    import(filePath).then((command) => {
      if (command.default && command.default.data) {
        commands.set(command.default.data.name, command.default);
        gmLog('command', `Command ${filePath} loaded`);
      } else {
        gmLog('command', `Command ${filePath} is missing default or data`);
      }
    });
  }
}

// Load Context Menu Commands
let contextMenuCommands = new Collection();
const contextMenuPath = join(process.cwd(), 'src/discord/contexts');
const contextMenuFolders = readdirSync(contextMenuPath);

for (const folder of contextMenuFolders) {
  const contextMenuFiles = readdirSync(join(contextMenuPath, folder)).filter((file) => file.endsWith('.js'));

  for (const file of contextMenuFiles) {
    const filePath = join(contextMenuPath, folder, file);
    import(filePath).then((contextMenu) => {
      if (contextMenu.default && contextMenu.default.data) {
        contextMenuCommands.set(contextMenu.default.data.name, contextMenu.default);
        gmLog('contextMenu', `ContextMenu ${filePath} loaded`);
      } else {
        gmLog('contextMenu', `ContextMenu ${filePath} is missing default or data`);
      }
    });
  }
}

client.on(Events.InteractionCreate, async (interaction) => {
  const command = commands.get(interaction.commandName);
  const contextMenuCommand = contextMenuCommands.get(interaction.commandName);

  try {
    if (contextMenuCommand) {
      await contextMenuCommand.execute(interaction);
    } else if (command && interaction.isChatInputCommand()) {
      await command.execute(interaction);
    } else if (command && interaction.isAutocomplete()) {
      await command.autocomplete(interaction);
    }
  } catch (error) {
    interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
    console.error(error);
  }
});

export async function getClient() {
  if (client.readyAt) {
    return client;
  } else {
    await new Promise((resolve) => {
      client.on('ready', () => {
        resolve();
      });
    });
    return client;
  }
}

export function updateGuildUserPseudo(guildID, userID, pseudo) {
  return new Promise(async (resolve, reject) => {
    if (!guildID || !userID || !pseudo) {
      return reject({
        error: 'missing_arguments',
        args: {
          guildID: !!guildID,
          userID: !!userID,
          pseudo: !!pseudo,
        },
      });
    }

    const client = await getClient();

    const guild = client.guilds.cache.get(guildID);
    if (!guild) {
      return reject('Guild not found');
    }

    // Get the member from the guild
    const member = guild.members.cache.get(userID);
    if (!member) {
      return reject('User not found');
    }

    // Verify if the bot has the permission to change the nickname
    if (member.nickname === pseudo) {
      return resolve();
    }

    // Verify if the bot has the permission to change the nickname
    if (!member.manageable) {
      return reject('Bot does not have the permission to change the nickname');
    }

    member
      .setNickname(pseudo)
      .then((updatedMember) => {
        return resolve(updatedMember);
      })
      .catch(reject);
  });
}

client.on('ready', () => {
  gmLog('discord', 'Connected to Discord');
});

client.login(discordConfig.botToken).catch(console.error);
