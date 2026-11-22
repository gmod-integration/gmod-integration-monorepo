import {
  ActivityType,
  Client,
  type ClientUser,
  Collection,
  Events,
  GatewayIntentBits,
  type Interaction,
  Partials,
  PermissionsBitField,
  REST,
  Routes,
} from 'discord.js'
import { gmLog } from '@gmod/shared/logger.js'
import { ConfigDiscord, ConfigServer } from '@gmod/config'
import { fork } from 'child_process'

import { fileURLToPath } from 'url'
import path, { join } from 'path'
import { existsSync, readdirSync } from 'fs'
import {
  routinePremiumRoleOfMainGuild,
  routineServerStatusRefresh,
  routineUpdateStatus,
} from '@gmod/core/models/v3/mainModels.js'
import { readdir } from 'fs/promises'
import { getUserFromSteamID64 } from '@gmod/domain-user/User.js'
import redis from '@gmod/infra-redis'
import prisma from '@gmod/infra-prisma'
import { getServersFromDiscordGuildID, type Server } from '@gmod/domain-server/Server.js'
import { type PlayerGmod } from '@gmod/core/classes/v3/PlayerGmod.js'
import { guildSettingExists } from '@gmod/domain-guild/Guild.js'
import { hasCapability, resolveGuildAccess } from '@gmod/domain-access/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const distRuntimePath = path.join(process.cwd(), 'dist')
const sourceRuntimePath = path.join(__dirname, '..')
const hasBuiltDiscordRuntime = existsSync(path.join(distRuntimePath, 'discord'))
const envExtension = hasBuiltDiscordRuntime ? '.js' : '.ts'
const appRuntimePath = hasBuiltDiscordRuntime ? distRuntimePath : sourceRuntimePath

const clientList = new Collection<string, Client>()
const guildReloads = new Map<string, Promise<void>>()

async function checkTokenAndIntents(token: string) {
  return new Promise((resolve, reject) => {
    const child = fork(path.join(__dirname, 'testLogin.js'))

    child.on('exit', (code) => {
      resolve(code === 0) // 0 = valid, 1 = invalid
    })

    child.send(token)
  })
}

const commandsData: any[] = []

async function indexCommandsAndContext(dirPath: string, type: string) {
  try {
    const foldersPath = dirPath
    const folders = await readdir(foldersPath)

    for (const folder of folders) {
      const commandsPath = join(foldersPath, folder)
      const commandFiles = (await readdir(commandsPath)).filter((file) => file.endsWith(envExtension))

      for (const file of commandFiles) {
        try {
          const filePath = join(commandsPath, file)
          if (file.endsWith(envExtension)) {
            const { default: module } = await import(filePath)
          }
          const command = await import(filePath)
          if (command.default && command.default.data) {
            if (!command.dev) {
              commandsData.push(command.default.data.toJSON())
            }
            gmLog('info', `Pushed ${type} ${command.default.data.name} from ${filePath}`)
          } else {
            gmLog('warning', `The ${type} at ${filePath} is missing a required "data" or "execute" property.`)
          }
        } catch (error) {
          gmLog('error', `Failed to load ${type} from ${file}: ${error}`)
          console.error(error)
        }
      }
    }
  } catch (error) {
    gmLog('error', `Failed to read directory ${dirPath}: ${error}`)
  }
}

async function addNewClient(guildInstance: string, token: string) {
  if (!token || !guildInstance) return

  // Guard against a leftover/leaked client for this guild - without this, every restart or
  // re-provisioning that adds a client for a guild that already has one leaves both instances
  // logged in and both handling the same Gateway events (e.g. duplicated chat-sync messages).
  const existingClient = clientList.get(guildInstance)
  if (existingClient) {
    await existingClient.destroy()
    clientList.delete(guildInstance)
  }

  const hasValidIntents = await checkTokenAndIntents(token)
  if (!hasValidIntents) {
    throw new Error('The given token is invalid or missing required intents')
  }

  // Create a new client
  const client = new Client({
    intents: [
      GatewayIntentBits.AutoModerationConfiguration,
      GatewayIntentBits.AutoModerationExecution,
      GatewayIntentBits.DirectMessages,
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
  })

  // Handle Events
  const eventsPath = join(appRuntimePath, 'discord/events')
  const eventFiles = readdirSync(eventsPath).filter((file) => file.endsWith(envExtension))
  for (const file of eventFiles) {
    const filePath = join(eventsPath, file)
    import(filePath).then((event) => {
      if (event.default && event.default.name) {
        client.on(event.default.name, event.default.execute)
        gmLog('event', `Event ${filePath} loaded`)
      } else {
        if (!event.default) {
          gmLog('event', `Event ${filePath} is missing default export`)
        }
        if (!event.default.name) {
          gmLog('event', `Event ${filePath} is missing name`)
        }
      }
    })
  }

  // Handle Commands
  const commands: Collection<string, { execute: Function; autocomplete?: Function }> = new Collection()
  const foldersPath = join(appRuntimePath, 'discord/commands')
  const commandFolders = readdirSync(foldersPath)

  for (const folder of commandFolders) {
    const commandsPath = join(foldersPath, folder)

    const commandFiles = (await readdir(commandsPath)).filter((file) => file.endsWith(envExtension))

    for (const file of commandFiles) {
      const filePath = join(commandsPath, file)
      import(filePath).then((command) => {
        if (command.default && command.default.data) {
          commands.set(command.default.data.name, command.default)
          gmLog('command', `Command ${filePath} loaded`)
        } else {
          gmLog('command', `Command ${filePath} is missing default or data`)
        }
      })
    }
  }

  // Handle Context Menu Commands
  const contextMenuCommands: Collection<string, { execute: Function }> = new Collection()
  const contextMenuPath = join(appRuntimePath, 'discord/contexts')
  const contextMenuFolders = readdirSync(contextMenuPath)

  for (const folder of contextMenuFolders) {
    const contextMenuFiles = readdirSync(join(contextMenuPath, folder)).filter((file) => file.endsWith(envExtension))

    for (const file of contextMenuFiles) {
      const filePath = join(contextMenuPath, folder, file)
      import(filePath).then((contextMenu) => {
        if (contextMenu.default && contextMenu.default.data) {
          contextMenuCommands.set(contextMenu.default.data.name, contextMenu.default)
          gmLog('contextMenu', `ContextMenu ${filePath} loaded`)
        } else {
          gmLog('contextMenu', `ContextMenu ${filePath} is missing default or data`)
        }
      })
    }
  }

  // Handle Interactions
  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    if (!interaction.isCommand() && !interaction.isAutocomplete()) return

    const command = commands.get(interaction.commandName)
    const contextMenuCommand = contextMenuCommands.get(interaction.commandName)

    try {
      if (contextMenuCommand) {
        await contextMenuCommand.execute(interaction)
      } else if (command && command.execute && interaction.isChatInputCommand()) {
        await command.execute(interaction)
      } else if (command && command.autocomplete && interaction.isAutocomplete()) {
        await command.autocomplete(interaction)
      }
    } catch (error) {
      console.error(error)
    }
  })

  client.on('clientReady', async () => {
    const user: ClientUser = client.user!
    gmLog('discord', `Ready on ${guildInstance} with ${user.tag}`)

    // Load commands and context menu commands
    if (ConfigServer.dev) {
      gmLog('discord', 'Skipping command push due to test mode')
      return
    }

    const rest = new REST().setToken(token)
    try {
      gmLog('discord', `Started reloading application: ${guildInstance}`)
      await rest.put(Routes.applicationCommands(user.id), {
        body: commandsData,
      })

      if (guildInstance !== 'main') {
        // remove all other guild commands if not main
        const guildCommands: any = await rest.get(Routes.applicationGuildCommands(user.id, guildInstance))
        for (const command of guildCommands) {
          await rest.delete(Routes.applicationGuildCommand(user.id, guildInstance, command.id))
        }
      }

      gmLog('discord', `Successfully reloaded application: ${guildInstance}`)
    } catch (error) {
      gmLog('discord', `Failed to reload application: ${guildInstance}`)
      console.error(error)
    }
  })

  client.on('warn', (info) => {
    gmLog('discord', `Warn: ${info}`)
    console.warn(info)
  })

  client.on('error', (error) => {
    gmLog('discord', `Error: ${error}`)
    console.error(error)
  })

  await client.login(token).then(() => {
    gmLog('discord', `Logged in as ${client.user!.tag}`)
  })

  clientList.set(guildInstance, client)
}

/*
 * Load the main discord instance
 */
export async function loadDiscordMain() {
  // Display all files and folders in the directory recursively
  function displayFilesAndFolders(dirPath: string) {
    readdir(dirPath, { withFileTypes: true })
      .then((files) => {
        files.forEach((file) => {
          if (file.isDirectory()) {
            displayFilesAndFolders(join(dirPath, file.name))
          } else {
            gmLog('info', join(dirPath, file.name))
          }
        })
      })
      .catch((error) => {
        gmLog('error', error)
      })
  }

  displayFilesAndFolders(join(appRuntimePath, 'discord/commands'))
  // Load
  gmLog('discord', 'Loading Contexts')
  await indexCommandsAndContext(join(appRuntimePath, 'discord/contexts'), 'Context')

  gmLog('discord', 'Loading Commands')
  await indexCommandsAndContext(join(appRuntimePath, 'discord/commands'), 'Command')

  gmLog('discord', `Loaded ${commandsData.length} commands and context menu commands`)
  await addNewClient('main', ConfigDiscord.botToken!).catch((error) => {
    console.error('Error adding main client:', error)
  })

  // Routine Main
  await routineUpdateStatus()
  await routinePremiumRoleOfMainGuild()
}

/*
 * Load all discord instances
 */
export async function loadDiscordSlave() {
  const gmodStorePurchases = await prisma.gm_gmodstore_purchases.findMany({
    where: {
      revoke: false,
    },
  })

  const processedGuilds = new Set<string>()
  for (const instanceInfo of gmodStorePurchases) {
    if (!instanceInfo.guild || !instanceInfo.token) continue
    // A guild can have several purchase rows (e.g. renewals); only ever spin up one client per guild.
    if (processedGuilds.has(instanceInfo.guild)) continue
    processedGuilds.add(instanceInfo.guild)

    // Queue workers already run during startup. Re-read credentials inside the same guild lock
    // as interactive reloads so this startup snapshot cannot reconnect a removed credential.
    await loadGuildBotInstance(instanceInfo.guild).catch(() => {
      console.error(`Error starting bot instance for guild ${instanceInfo.guild}`)
    })
  }

  // Routine Server
  await routineServerStatusRefresh()
}

const MAIN_CLIENT_READY_TIMEOUT_MS = 30_000
const GUILD_CLIENT_READY_TIMEOUT_MS = 10_000

/**
 * Resolves true once the client is ready, false if it is still not ready after timeoutMs.
 * Never waits forever: a bot that cannot (re)connect must not hold a caller - typically a
 * queue worker slot - indefinitely.
 */
export async function waitForClientReady(client: Client, timeoutMs: number): Promise<boolean> {
  if (client.readyAt) return true

  return await new Promise<boolean>((resolve) => {
    const onReady = () => {
      clearTimeout(timer)
      resolve(true)
    }
    const timer = setTimeout(() => {
      client.off('clientReady', onReady)
      resolve(Boolean(client.readyAt))
    }, timeoutMs)
    client.once('clientReady', onReady)
  })
}

export async function getMainClient() {
  const mainClient = clientList.get('main')
  if (!mainClient) {
    throw new Error('Main client is not defined')
  }
  if (!(await waitForClientReady(mainClient, MAIN_CLIENT_READY_TIMEOUT_MS))) {
    throw new Error(`Main client not ready after ${MAIN_CLIENT_READY_TIMEOUT_MS}ms`)
  }
  return mainClient
}

export async function killGuildClient(guildID: string) {
  if (!guildID) return
  if (guildID === 'main') return

  if (clientList.has(guildID)) {
    const client = clientList.get(guildID)
    if (client) await client.destroy()
    clientList.delete(guildID)
  }
}

export async function getGuildClient(guildID: string, forcePresenceOnGuild = true): Promise<Client> {
  if (!guildID) return getMainClient()
  const guildClient = clientList.get(guildID)
  if (!guildClient) return getMainClient()
  if (!hasCapability(await resolveGuildAccess(guildID), 'bot.custom')) {
    await killGuildClient(guildID)
    return getMainClient()
  }

  if (!(await waitForClientReady(guildClient, GUILD_CLIENT_READY_TIMEOUT_MS))) {
    gmLog(
      'discord',
      `Custom bot for guild ${guildID} not ready after ${GUILD_CLIENT_READY_TIMEOUT_MS}ms, using main bot`,
    )
    return getMainClient()
  }

  if (forcePresenceOnGuild) {
    const guild = guildClient.guilds.cache.get(guildID)
    if (!guild) return getMainClient()
  }
  return guildClient
}

export async function updateGuildUserPseudo(server: Server, player: PlayerGmod, forceName?: string) {
  try {
    const pseudoDirection = await server.getEffectiveSetting('sync_pseudo_direction')
    if (pseudoDirection !== 'both' && pseudoDirection !== 'gmod-to-discord') return

    const pseudoFormat = await server.getEffectiveSetting('pseudoFormat')
    if (!pseudoFormat) return

    const rolesFormat = (await server.getEffectivePseudoRules()).find(
      (rule) => rule.role === player.userGroup && rule.enabled,
    )

    const newPseudo = pseudoFormat
      .replace(/{plyName}/g, forceName || player.name)
      .replace(/{plySteamID64}/g, player.steamID64)
      .replace(/{rolePrefix}/g, rolesFormat ? rolesFormat.prefix : '')
      .replace(/{roleName}/g, rolesFormat ? rolesFormat.name : '')

    const user = await getUserFromSteamID64(player.steamID64)
    if (!user || !user.getDiscordID()) return

    const dscClient = await getGuildClient(server.getGuildID())

    const guild = dscClient.guilds.cache.get(server.getGuildID())
    if (!guild) return

    if (guild.ownerId === user.getDiscordID() || !dscClient.user) return

    const member = await guild.members.fetch(user.getDiscordID())
    if (!member) return

    // check if the bot has the permission to change the nickname
    const botMember = await guild.members.fetch(dscClient.user.id)
    if (!botMember) return
    if (!botMember.permissions.has(PermissionsBitField.Flags.ManageNicknames)) return
    if (botMember.roles.highest.comparePositionTo(member.roles.highest) <= 0) return

    await member.setNickname(newPseudo)

    const redisKey = `sync-pseudo:gmod:server:${server.getID()}:user:${user.getSteamID64()}`
    await redis.set(redisKey, newPseudo, 'EX', 120)
  } catch (error) {
    console.error(error)
  }
}

export async function loadGuildBotInstance(guildID: string) {
  const previous = guildReloads.get(guildID)
  const current = (async () => {
    // A preceding reload may already hold the old token. Finish it before acknowledging its removal.
    await previous?.catch(() => {})
    await killGuildClient(guildID)
    const instanceInfo = await prisma.gm_gmodstore_purchases.findFirst({
      where: {
        guild: guildID,
        revoke: false,
      },
    })
    // A purchase can be active with no token: the guild then simply uses the main bot.
    if (!instanceInfo?.token) return
    await addNewClient(guildID, instanceInfo.token)
  })()
  guildReloads.set(guildID, current)
  try {
    await current
  } finally {
    if (guildReloads.get(guildID) === current) guildReloads.delete(guildID)
  }
}

/** Reconcile even bots with custom presence disabled, including clients already connected at revocation. */
export async function reconcileGuildClientAccess() {
  for (const guildID of clientList.keys()) {
    if (guildID === 'main') continue
    try {
      if (!hasCapability(await resolveGuildAccess(guildID), 'bot.custom')) await killGuildClient(guildID)
    } catch {
      gmLog('discord', 'Custom bot access reconciliation is temporarily unavailable')
    }
  }
}

const lastStatusID: Record<string, number> = {}
setInterval(async () => {
  await reconcileGuildClientAccess()
  if (!(await guildSettingExists('bot_status'))) return
  const guildsStatusNotDisable = await prisma.gm_guild_settings.findMany({
    where: {
      setting: 'bot_status',
    },
  })

  for (const guildStatus of guildsStatusNotDisable) {
    const key = guildStatus.guildID
    const customStatus = guildStatus.value as string

    lastStatusID[key] = lastStatusID[key] || 0
    const client = clientList.get(key)
    if (!client || !client.user) continue

    try {
      if (!hasCapability(await resolveGuildAccess(key), 'bot.custom')) {
        await killGuildClient(key)
        continue
      }
      if (customStatus === 'disabled' || !hasCapability(await resolveGuildAccess(key), 'bot.presence')) {
        client.user.setPresence({ activities: [] })
        continue
      }
      const dscGuild = client.guilds.cache.get(key)
      if (!dscGuild) continue

      let totalPlayers = 0
      let maxPlayers = 0

      const servers = await getServersFromDiscordGuildID(key)
      for (const server of servers) {
        const data = await server.getStatusData()
        if (data) {
          totalPlayers += data.players
          maxPlayers += data.maxPlayers
        }
      }
      const botStatusList: Record<string, string> = {
        playerCount: `${totalPlayers} / ${maxPlayers} players`,
        guildMemberCount: `${dscGuild.memberCount} members`,
      }

      async function setPresence(str: string) {
        // Only called after the `if (!client || !client.user) continue` guard above already
        // passed for this iteration, so client/client.user are always defined here - TS can't
        // see that narrowing across the closure boundary, hence the non-null assertions.
        client!.user!.setPresence({
          activities: [
            {
              name: str,
              type: ActivityType.Watching,
            },
          ],
        })
      }

      if (customStatus == 'rotate') {
        const objKeys = Object.keys(botStatusList)
        const status = botStatusList[objKeys[lastStatusID[key]]] || 'default status'
        lastStatusID[key] = (lastStatusID[key] + 1) % objKeys.length
        await setPresence(status)
      } else if (botStatusList[customStatus]) {
        await setPresence(botStatusList[customStatus])
      }

      gmLog('discord', `Updated custom status for ${client.user.globalName} & server ${key}`)
    } catch (error) {
      gmLog('discord', `Failed to update custom status for server ${key}`)
      console.error(error)
    }
  }
}, 30000)

export async function gracefulShutdownDiscord() {
  for (const client of clientList.values()) {
    await client.destroy()
  }
}
