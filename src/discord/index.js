import {
  ActivityType,
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  Partials,
  PermissionsBitField,
  REST,
  Routes,
} from 'discord.js';
import { gmLog } from '../utils/logger.ts';
import { discordConfig } from '../config/index.js';
import GmodStorePurchases from '../database/schema/GmodStorePurchases.js';
import { fork } from 'child_process';

import { fileURLToPath } from 'url';
import path, { join } from 'path';
import { readdirSync } from 'fs';
import {
  routinePremiumRoleOfMainGuild,
  routineServerStatusRefresh,
  routineUpdateStatus,
} from '../models/v3/mainModels.js';
import { readdir } from 'fs/promises';
import { getUserFromSteamID64 } from '../classes/v3/User.js';
import ServerPseudo from '../database/schema/ServerPseudo.js';
import redis from '../redis/index.ts';

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

async function indexCommandsAndContext(dirPath, type) {
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
            gmLog('info', `Pushed ${type} ${command.default.data.name} from ${filePath}`);
          } else {
            gmLog('warning', `The ${type} at ${filePath} is missing a required "data" or "execute" property.`);
          }
        } catch (error) {
          gmLog('error', `Failed to load ${type} from ${file}: ${error}`);
        }
      }
    }
  } catch (error) {
    gmLog('error', `Failed to read directory ${dirPath}: ${error}`);
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
      console.error(error);
    }
  });

  client.on('ready', async () => {
    gmLog('discord', `Ready on ${guildInstance} with ${client.user.tag}`);

    // Load commands and context menu commands
    const rest = new REST().setToken(token);
    try {
      gmLog('discord', `Started reloading application: ${guildInstance}`);
      await rest.put(Routes.applicationCommands(client.user.id), {
        body: commandsData,
      });

      if (guildInstance !== 'main') {
        // remove all other guild commands if not main
        const guildCommands = await rest.get(Routes.applicationGuildCommands(client.user.id, guildInstance));
        for (const command of guildCommands) {
          await rest.delete(Routes.applicationGuildCommand(client.user.id, guildInstance, command.id));
        }
      }

      gmLog('discord', `Successfully reloaded application: ${guildInstance}`);
    } catch (error) {
      gmLog('discord', `Failed to reload application: ${guildInstance}`);
      console.error(error);
    }
  });

  client.on('warn', (info) => {
    gmLog('discord', `Warn: ${info}`);
    console.warn(info);
  });

  client.on('error', (error) => {
    gmLog('discord', `Error: ${error}`);
    console.error(error);
  });

  await client.login(token).then(() => {
    gmLog('discord', `Logged in as ${client.user.tag}`);
  });

  clientList.set(guildInstance, client);
}

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

export async function killGuildClient(guildID) {
  if (!guildID) return;
  if (guildID === 'main') return;

  if (clientList.has(guildID)) {
    await clientList.get(guildID).destroy();
    clientList.delete(guildID);
  }
}

export async function loadGuildBotInstance(guildID) {
  await killGuildClient(guildID);
  const instanceInfo = await GmodStorePurchases.findOne({
    where: {
      guild: guildID,
      revoke: false,
    },
  });
  if (!instanceInfo) return;
  await addNewClient(guildID, instanceInfo.token);
}

export async function getGuildClient(guildID, forcePresenceOnGuild = true) {
  if (!guildID) return getMainClient();
  const guildClient = clientList.get(guildID);
  if (!guildClient) return getMainClient();
  if (guildClient.readyAt) {
    if (forcePresenceOnGuild) {
      const guild = guildClient.guilds.cache.get(guildID);
      if (!guild) return getMainClient();
    }
    return guildClient;
  } else {
    await new Promise((resolve) => {
      guildClient.on('ready', () => {
        resolve();
      });
    });
    if (forcePresenceOnGuild) {
      const guild = guildClient.guilds.cache.get(guildID);
      if (!guild) return getMainClient();
    }
    return guildClient;
  }
}

export async function updateGuildUserPseudo(server, player) {
  try {
    const pseudoDirection = await server.getSetting('sync_pseudo_direction');
    if (pseudoDirection !== 'both' && pseudoDirection !== 'gmod-to-discord') return;

    const pseudoFormat = await server.getSetting('pseudoFormat');
    if (!pseudoFormat) return;

    const rolesFormat = await ServerPseudo.findOne({
      where: {
        serverID: server.getID(),
        role: player.userGroup,
        enabled: true,
      },
    });

    let newPseudo = pseudoFormat
      .replace(/{plyName}/g, player.name)
      .replace(/{plySteamID64}/g, player.steamID64)
      .replace(/{rolePrefix}/g, rolesFormat ? rolesFormat.prefix : '')
      .replace(/{roleName}/g, rolesFormat ? rolesFormat.name : '');

    const user = await getUserFromSteamID64(player.steamID64);
    if (!user || !user.getDiscordID()) return;

    const dscClient = await getGuildClient(server.getGuildID());

    const guild = dscClient.guilds.cache.get(server.getGuildID());
    if (!guild) return;

    if (guild.ownerId === user.getDiscordID()) return;

    const member = await guild.members.fetch(user.getDiscordID());
    if (!member) return;

    // check if the bot has the permission to change the nickname
    const botMember = await guild.members.fetch(dscClient.user.id);
    if (!botMember) return;
    if (!botMember.permissions.has(PermissionsBitField.ManageNickname)) return;
    if (botMember.roles.highest.comparePositionTo(member.roles.highest) <= 0) return;

    await member.setNickname(newPseudo);

    const redisKey = `sync-pseudo:gmod:server:${server.id}:user:${user.getSteamID64()}`;
    await redis.set(redisKey, newPseudo, 'EX', 120);
  } catch (error) {
    console.error(error);
  }
}

/*
 * Load the main discord instance
 */
export async function loadDiscordMain() {
  // Load
  gmLog('discord', 'Loading Contexts');
  await indexCommandsAndContext('src/discord/contexts', 'Context');

  gmLog('discord', 'Loading Commands');
  await indexCommandsAndContext('src/discord/commands', 'Command');

  gmLog('discord', `Loaded ${commandsData.length} commands and context menu commands`);
  await addNewClient('main', discordConfig.botToken).catch((error) => {
    console.error('Error adding main client:', error);
  });

  // Routine Main
  await routineUpdateStatus();
  await routinePremiumRoleOfMainGuild();
}

/*
 * Load all discord instances
 */
export async function loadDiscordSlave() {
  const gmodStorePurchases = await GmodStorePurchases.findAll({
    where: {
      revoke: false,
    },
  });

  for (const instanceInfo of gmodStorePurchases) {
    if (!instanceInfo.guild || !instanceInfo.token) continue;

    await addNewClient(instanceInfo.guild, instanceInfo.token).catch(() => {
      console.error(`Error starting bot instance for guild ${instanceInfo.guild}`);
    });
  }

  // Routine Server
  await routineServerStatusRefresh();
}
