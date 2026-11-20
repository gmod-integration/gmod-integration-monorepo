import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import {
  ChannelType,
  PermissionFlagsBits,
  REST,
  Routes,
  type APIGuildChannel,
  type APIGuildMember,
  type APIRole,
  type APIUser,
} from 'discord.js'

const categoryName = '[DEMO] Gmod Integration'
const channelNames = {
  status: 'demo-status',
  verification: 'demo-verification',
  logs: 'demo-logs',
  screenshots: 'demo-screenshots',
  votes: 'demo-votes',
  chat: 'demo-chat',
} as const
const roleNames = {
  member: '[DEMO] Membre',
  verified: '[DEMO] Vérifié',
  vip: '[DEMO] VIP',
  citizen: '[DEMO] Citoyen',
} as const
const requiredPermissions = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageWebhooks,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.ReadMessageHistory,
].reduce((all, permission) => all | permission, 0n)

export type DevDiscordResources = {
  guildId: string
  categoryId: string | null
  channels: Record<keyof typeof channelNames, string | null>
  roles: Record<keyof typeof roleNames, string | null>
  created: { channels: number; roles: number }
  botId: string
  messageIds: Record<string, string[]>
  webhookIds: string[]
  webhooks: { id: string; channelId: string | null }[]
}

function unique<T>(matches: T[], label: string): T | undefined {
  if (matches.length > 1) throw new Error(`Several Discord resources match ${label}; resolve the ambiguity first.`)
  return matches[0]
}

function canManageRole(role: APIRole, highest: APIRole) {
  return (
    role.position < highest.position || (role.position === highest.position && BigInt(role.id) > BigInt(highest.id))
  )
}

function assertChannelPermissions(
  channel: APIGuildChannel<ChannelType.GuildText | ChannelType.GuildCategory>,
  guildPermissions: bigint,
  guildId: string,
  member: APIGuildMember,
  botId: string,
) {
  if ((guildPermissions & PermissionFlagsBits.Administrator) !== 0n) return
  let permissions = guildPermissions
  const overwrites = channel.permission_overwrites || []
  const everyone = overwrites.find((overwrite) => overwrite.id === guildId)
  if (everyone) permissions = (permissions & ~BigInt(everyone.deny)) | BigInt(everyone.allow)
  let denied = 0n
  let allowed = 0n
  for (const overwrite of overwrites.filter((entry) => member.roles.includes(entry.id))) {
    denied |= BigInt(overwrite.deny)
    allowed |= BigInt(overwrite.allow)
  }
  permissions = (permissions & ~denied) | allowed
  const own = overwrites.find((overwrite) => overwrite.id === botId)
  if (own) permissions = (permissions & ~BigInt(own.deny)) | BigInt(own.allow)
  if ((permissions & requiredPermissions) !== requiredPermissions) {
    throw new Error(`The bot lacks permissions in demo channel ${channel.name}.`)
  }
}

/** Create only named demo resources; never edit or delete existing Discord objects. */
export async function provisionDevDiscord(
  rest: Pick<REST, 'get' | 'post'>,
  guildId: string,
  dryRun: boolean,
  savedMessages: { channelId: string; messageId: string }[] = [],
): Promise<DevDiscordResources> {
  const user = (await rest.get(Routes.user())) as APIUser
  await rest.get(Routes.guild(guildId))
  const member = (await rest.get(Routes.guildMember(guildId, user.id))) as APIGuildMember
  let allRoles = (await rest.get(Routes.guildRoles(guildId))) as APIRole[]
  const allChannels = (await rest.get(Routes.guildChannels(guildId))) as APIGuildChannel<
    ChannelType.GuildText | ChannelType.GuildCategory
  >[]
  const botRoles = allRoles.filter((role) => member.roles.includes(role.id) || role.id === guildId)
  const permissions = botRoles.reduce((all, role) => all | BigInt(role.permissions), 0n)
  if (
    (permissions & PermissionFlagsBits.Administrator) === 0n &&
    (permissions & requiredPermissions) !== requiredPermissions
  ) {
    throw new Error('The development bot needs channel, role, webhook and message permissions.')
  }
  let highest = botRoles.reduce((current, role) => (canManageRole(current, role) ? role : current))
  let category = unique(
    allChannels.filter((channel) => channel.name === categoryName),
    categoryName,
  )
  if (category && category.type !== ChannelType.GuildCategory)
    throw new Error('The demo category name is already used by a different channel type.')

  const channels = {} as DevDiscordResources['channels']
  const roles = {} as DevDiscordResources['roles']
  const created = { channels: 0, roles: 0 }
  // Validate every existing demo object before creating any missing resource.
  for (const [key, name] of Object.entries(roleNames)) {
    const role = unique(
      allRoles.filter((entry) => entry.name === name),
      name,
    )
    if (role && (role.managed || BigInt(role.permissions) !== 0n || !canManageRole(role, highest))) {
      throw new Error(`Demo role ${name} must have zero permissions and be below the bot's highest role.`)
    }
    roles[key as keyof typeof roles] = role?.id || null
  }
  if (category) assertChannelPermissions(category, permissions, guildId, member, user.id)
  for (const [key, name] of Object.entries(channelNames)) {
    const channel = category
      ? unique(
          allChannels.filter((entry) => entry.name === name && entry.parent_id === category!.id),
          name,
        )
      : undefined
    if (channel && channel.type !== ChannelType.GuildText)
      throw new Error(`Demo channel ${name} must be a text channel.`)
    if (channel) assertChannelPermissions(channel, permissions, guildId, member, user.id)
    channels[key as keyof typeof channels] = channel?.id || null
  }
  if (!dryRun) {
    const reason = 'Development integration fixtures'
    for (const [key, name] of Object.entries(roleNames)) {
      if (roles[key as keyof typeof roles]) continue
      const role = (await rest.post(Routes.guildRoles(guildId), {
        body: { name, permissions: '0', mentionable: false },
        reason,
      })) as APIRole
      allRoles = (await rest.get(Routes.guildRoles(guildId))) as APIRole[]
      highest = allRoles
        .filter((entry) => member.roles.includes(entry.id) || entry.id === guildId)
        .reduce((current, entry) => (canManageRole(current, entry) ? entry : current))
      const actualRole = allRoles.find((entry) => entry.id === role.id)
      if (!actualRole || !canManageRole(actualRole, highest))
        throw new Error(`The newly created demo role ${name} is not below the bot.`)
      roles[key as keyof typeof roles] = role.id
      created.roles++
    }
    if (!category) {
      category = (await rest.post(Routes.guildChannels(guildId), {
        body: { name: categoryName, type: ChannelType.GuildCategory },
        reason,
      })) as APIGuildChannel<ChannelType.GuildCategory>
      created.channels++
    }
    for (const [key, name] of Object.entries(channelNames)) {
      if (channels[key as keyof typeof channels]) continue
      const channel = (await rest.post(Routes.guildChannels(guildId), {
        body: {
          name,
          type: ChannelType.GuildText,
          parent_id: category.id,
          topic: 'Démonstration Gmod Integration — données de développement.',
        },
        reason,
      })) as APIGuildChannel<ChannelType.GuildText>
      channels[key as keyof typeof channels] = channel.id
      created.channels++
    }
  }
  const messageIds: Record<string, string[]> = {}
  for (const channelId of [channels.status, channels.verification]) {
    if (!channelId) continue
    const messages = (await rest.get(Routes.channelMessages(channelId), {
      query: new URLSearchParams({ limit: '100' }),
    })) as { id: string }[]
    messageIds[channelId] = messages.map((message) => message.id)
    for (const saved of savedMessages.filter(
      (message) => message.channelId === channelId && !messageIds[channelId].includes(message.messageId),
    )) {
      try {
        const message = (await rest.get(Routes.channelMessage(channelId, saved.messageId))) as { id: string }
        messageIds[channelId].push(message.id)
      } catch (error) {
        if (!error || typeof error !== 'object' || !('code' in error) || ![10003, 10008].includes(Number(error.code)))
          throw error
      }
    }
  }
  const webhooks = (await rest.get(Routes.guildWebhooks(guildId))) as { id: string; channel_id?: string | null }[]
  return {
    guildId,
    categoryId: category?.id || null,
    channels,
    roles,
    created,
    botId: user.id,
    messageIds,
    webhookIds: webhooks.map((webhook) => webhook.id),
    webhooks: webhooks.map((webhook) => ({ id: webhook.id, channelId: webhook.channel_id || null })),
  }
}

export async function provisionMain(args = process.argv.slice(2)) {
  const { values } = parseArgs({
    args,
    strict: true,
    allowPositionals: false,
    options: {
      'guild-id': { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      message: { type: 'string', multiple: true, default: [] },
      help: { type: 'boolean', default: false },
    },
  })
  if (values.help) {
    console.log('Usage: bun apps/discord/scripts/provision-dev.ts --guild-id <id> [--dry-run]')
    return
  }
  if (!values['guild-id'] || !/^\d{17,20}$/.test(values['guild-id']))
    throw new Error('Pass --guild-id with a Discord guild ID.')
  const savedMessages = values.message.map((reference) => {
    const match = /^(\d{17,20})\/(\d{17,20})$/.exec(reference)
    if (!match) throw new Error('--message must contain channelID/messageID.')
    return { channelId: match[1], messageId: match[2] }
  })
  const { ConfigDiscord, ConfigServer } = await import('@gmod/config')
  if (!ConfigServer.dev || ConfigDiscord.guildID !== values['guild-id'])
    throw new Error('Discord fixtures require DEV=true and the configured DISCORD_GUILD_ID.')
  const rest = new REST({ timeout: 15_000, retries: 0 }).setToken(ConfigDiscord.botToken!)
  console.log(JSON.stringify(await provisionDevDiscord(rest, values['guild-id'], values['dry-run'], savedMessages)))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await provisionMain()
  } catch (error) {
    const message =
      error instanceof Error && !('requestBody' in error)
        ? error.message
        : 'Discord request failed; check bot permissions and connectivity.'
    console.error(`Development Discord provisioning failed: ${message}`)
    process.exitCode = 1
  }
}
