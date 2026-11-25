import { ConfigDiscord } from '@gmod/config'
import { addAutoRoleToUser, updateGuildStat, verifyUser } from '@gmod/domain-guild/discordModels.js'
import { gmLog } from '@gmod/shared/logger.js'
import { getNotVerifiedMessage } from '../utils/messages.js'
import { type GuildMember } from 'discord.js'
import { Guild } from '@gmod/domain-guild/Guild.js'
import { refreshGuildMemberPlayerAccess } from '@gmod/domain-guild/playerAccessNotifications.js'

export default {
  name: 'guildMemberAdd',
  async execute(add_info: GuildMember) {
    if (add_info.user.id === ConfigDiscord.clientID) return

    try {
      const guild = add_info.client.guilds.cache.get(add_info.guild.id)
      if (!guild) throw new Error('Guild not found')
      const member = guild.members.cache.get(add_info.user.id)
      if (!member) throw new Error('Member not found')

      gmLog('event', `New member joined guild: ${add_info.guild.name}`)
      await updateGuildStat(guild)
      await addAutoRoleToUser(guild, member).catch(() => {})

      if (!(await verifyUser(guild, member))) {
        const dontMp = await new Guild({ id: guild.id }).getEffectiveSetting('verification_dont_mp')

        if (dontMp) {
          return
        }

        await member.send(await getNotVerifiedMessage(guild, member))
      }
    } catch (err) {
      gmLog('error', `Error in guildMemberAdd: ${err}`)
    } finally {
      await refreshGuildMemberPlayerAccess(add_info.guild.id, add_info.user.id).catch(() => {})
    }
  },
}
