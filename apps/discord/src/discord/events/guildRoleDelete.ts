import type { Role } from 'discord.js'
import { invalidateDiscordGuildPermissions } from '@gmod/domain-user/guildPermissions.js'
import { refreshGuildRolePlayerAccess } from '@gmod/domain-guild/playerAccessNotifications.js'

export default {
  name: 'roleDelete',
  async execute(role: Role) {
    await invalidateDiscordGuildPermissions({ guildID: role.guild.id }).catch(() => {})
    await refreshGuildRolePlayerAccess(role.guild.id, role.id).catch(() => {})
  },
}
