import { ChannelType, PermissionFlagsBits, type Guild, type GuildBasedChannel, type TextChannel } from 'discord.js'

function invitationUrl(code: string | null): string | null {
  return code && /^[A-Za-z0-9_-]{1,100}$/.test(code) ? `https://discord.gg/${code}` : null
}

/** Invitations belong to Discord communities, never to synthetic game-server IDs. */
export async function getPublicGuildInvite(guild: Guild): Promise<string | null> {
  const vanity = invitationUrl(guild.vanityURLCode)
  if (vanity) return vanity

  await guild.channels.fetch()
  const isPublicChannel = (channel: GuildBasedChannel | undefined) =>
    channel?.type === ChannelType.GuildText &&
    channel.permissionsFor(guild.roles.everyone)?.has(PermissionFlagsBits.ViewChannel)
  const invites = await guild.invites.fetch().catch(() => null)
  if (invites) {
    const reusable = [...invites.values()].filter((invite) => {
      const channelId = invite.channelId ?? invite.channel?.id
      return (
        invite.maxAge === 0 &&
        invite.maxUses === 0 &&
        !invite.temporary &&
        (!invite.expiresTimestamp || invite.expiresTimestamp > Date.now()) &&
        invitationUrl(invite.code) &&
        channelId &&
        isPublicChannel(guild.channels.cache.get(channelId))
      )
    })
    const owned = reusable.find((invite) => invite.inviter?.id === guild.client.user.id)
    const existing = owned || reusable[0]
    if (existing) return invitationUrl(existing.code)
  }

  const botMember = guild.members.me || (await guild.members.fetchMe())
  const canInvite = (channel: TextChannel) =>
    channel
      .permissionsFor(botMember)
      ?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.CreateInstantInvite]) && isPublicChannel(channel)
  const candidates = guild.channels.cache
    .filter((channel): channel is TextChannel => channel.type === ChannelType.GuildText)
    .filter(canInvite)
    .sort((a, b) => a.position - b.position)
  const system = guild.systemChannel
  const channel = system && canInvite(system) ? system : candidates.first()
  if (!channel) return null
  const invite = await channel.createInvite({
    maxAge: 0,
    maxUses: 0,
    temporary: false,
    unique: false,
    reason: 'Public server directory invitation',
  })
  return invitationUrl(invite.code)
}
