import { ActivityType, Client, Collection, Events, GatewayIntentBits, Partials, REST, Routes } from 'discord.js';
import { gmLog } from '../utils/logger.js';
import { discordConfig } from '../config/index.js';
import GmodStorePurchases from '../database/schema/GmodStorePurchases.js';
import { fork } from 'child_process';

import { fileURLToPath } from 'url';
import path, { join } from 'path';
import { readdirSync } from 'fs';
import { routineStatusRefresh, routineUpdateStatus, updateGuildsInDB } from '../models/v3/mainModels.js';
import { readdir } from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const clientList = new Collection();

async function checkTokenAndIntents(token) {
  return new Promise((resolve, reject) => {
    const child = fork(path.join(__dirname, 'testLogin.js'));

    child.on('message', (message) => {
      if (message === 'OK') {
        resolve(true);
      }
    });

    child.on('exit', (code) => {
      if (code !== 0) {
        resolve(false);
      }
    });

    child.send(token);
  });
}

const commandsData = [];

async function loadCommands(dirPath, type) {
  try {
    const foldersPath = join(process.cwd(), dirPath);
    const folders = await readdir(foldersPath);

    for (const folder of folders) {
      const commandsPath = join(foldersPath, folder);
      const commandFiles = (await readdir(commandsPath)).filter((file) => file.endsWith('.js'));

      for (const file of commandFiles) {
        try {
          const filePath = join(commandsPath, file);
          const command = await import(filePath);
          if (command.default && command.default.data) {
            commandsData.push(command.default.data.toJSON());
            console.log(`[INFO] Pushed ${type} ${command.default.data.name} from ${filePath}`);
          } else {
            console.log(`[WARNING] The ${type} at ${filePath} is missing a required "data" or "execute" property.`);
          }
        } catch (error) {
          console.error(`[ERROR] Failed to load ${type} from ${file}: ${error}`);
        }
      }
    }
  } catch (error) {
    console.error(`[ERROR] Failed to read directory ${dirPath}: ${error}`);
  }
}

async function addNewClient(guildInstance, token) {
  if (!token || !guildInstance) return;

  const hasValidIntents = await checkTokenAndIntents(token);
  if (!hasValidIntents) {
    throw new Error('The given token is invalid or missing required intents');
  }

  // Create a new client
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

  // Handle Events
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

  // Handle Commands
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

  // Handle Context Menu Commands
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

  // Handle Interactions
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

  client.on('ready', async () => {
    gmLog('discord', `Ready on ${guildInstance} with ${client.user.tag}`);
    if (client.user.id === discordConfig.clientID) {
      await routineUpdateStatus();
      await routineStatusRefresh();
    }
    await updateGuildsInDB(client);

    if (guildInstance === 'main') {
      await loadCommands('src/discord/contexts', 'Context');
      await loadCommands('src/discord/commands', 'Command');
      console.log(`[INFO] Loaded ${commandsData.length} commands and context menu commands`);
    } else {
      // client.user.setPresence({
      //   activities: [
      //     {
      //       name: `${serverConfig.version} - gmi.linv.dev`,
      //       type: ActivityType.Watching,
      //     },
      //   ],
      // });
    }
    // Load commands and context menu commands
    const rest = new REST().setToken(token);
    try {
      console.log('[INFO] Started reloading application: ', guildInstance);
      await rest.put(Routes.applicationCommands(client.user.id), {
        body: commandsData,
      });

      console.log('[INFO] Successfully reloaded application: ', guildInstance);
    } catch (error) {
      console.error('[ERROR] Failed to reload application: ', guildInstance);
      console.error(error);
    }
  });

  client.on('warn', (msg) => {
    gmLog('discord', `Warn: ${msg}`);
  });

  client.on('error', (msg) => {
    gmLog('discord', `Error: ${msg}`);
  });

  await client.login(token).then(() => {
    gmLog('discord', `Logged in as ${client.user.tag}`);
  });
  clientList.set(guildInstance, client);
}

// main client
await addNewClient('main', discordConfig.botToken).catch((error) => {
  console.error('Error adding main client:', error);
});

export async function getMainClient() {
  const mainClient = clientList.get('main');
  if (mainClient.readyAt) {
    return mainClient;
  } else {
    await new Promise((resolve) => {
      mainClient.on('ready', () => {
        resolve();
      });
    });
    return mainClient;
  }
}

export async function loadGuildBotInstance(guildID) {
  const instanceInfo = await GmodStorePurchases.findOne({
    where: {
      guild: guildID,
      revoke: false,
    },
  });
  if (!instanceInfo) return;
  await addNewClient(guildID, instanceInfo.token);
}

// load all guilds custom intance of the bot select all GmodBotInstance how have a valid GmodStorePurchases
await GmodStorePurchases.findAll({
  where: {
    revoke: false,
  },
}).then(async (gmodStorePurchases) => {
  for (const instanceInfo of gmodStorePurchases) {
    if (!instanceInfo.guild || !instanceInfo.token) continue;
    await addNewClient(instanceInfo.guild, instanceInfo.token).catch(() => {
      console.error(`Error starting bot instance for guild ${instanceInfo.guild}`);
    });
  }
});

export async function getGuildClient(guildID) {
  if (!guildID) return getMainClient();
  const guildClient = clientList.get(guildID);
  if (!guildClient) return getMainClient();
  if (guildClient.readyAt) {
    return guildClient;
  } else {
    await new Promise((resolve) => {
      guildClient.on('ready', () => {
        resolve();
      });
    });
    return guildClient;
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

    const client = await getMainClient();

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
  });
}
