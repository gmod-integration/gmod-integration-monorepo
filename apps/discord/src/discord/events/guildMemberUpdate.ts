import { updatePseudoToGmod, updateRolesToGmod } from '@gmod/domain-guild/discordModels.js'
import { type GuildMember } from 'discord.js'
import { invalidateDiscordGuildPermissions } from '@gmod/domain-user/guildPermissions.js'
import { refreshGuildMemberPlayerAccess } from '@gmod/domain-guild/playerAccessNotifications.js'

export default {
  name: 'guildMemberUpdate',
  async execute(oldMember: GuildMember, newMember: GuildMember) {
    if (
      oldMember.partial ||
      newMember.partial ||
      oldMember.roles.cache.size !== newMember.roles.cache.size ||
      newMember.roles.cache.some((role) => !oldMember.roles.cache.has(role.id))
    ) {
      await invalidateDiscordGuildPermissions({ discordID: newMember.id, guildID: newMember.guild.id }).catch(() => {})
      await refreshGuildMemberPlayerAccess(newMember.guild.id, newMember.id).catch(() => {})
    }
    await updateRolesToGmod(newMember, oldMember, newMember).catch(() => {})
    await updatePseudoToGmod(newMember, oldMember, newMember).catch(() => {})
  },
}
