import { type GuildMember } from 'discord.js'
import prisma from '@gmod/infra-prisma'
import { invalidateDiscordGuildPermissions } from '@gmod/domain-user/guildPermissions.js'

export default {
  name: 'guildMemberRemove',
  async execute(remove_info: GuildMember) {
    await invalidateDiscordGuildPermissions({ discordID: remove_info.id, guildID: remove_info.guild.id })
    const dbGuild = await prisma.gm_guild.findFirst({
      where: {
        guild: remove_info.guild.id,
      },
    })

    if (!dbGuild) return

    await prisma.gm_guild.update({
      where: {
        guild: remove_info.guild.id,
      },
      data: {
        member: dbGuild.member - 1,
      },
    })
  },
}
