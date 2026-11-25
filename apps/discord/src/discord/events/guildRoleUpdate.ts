import type { Role } from 'discord.js'
import { invalidateDiscordGuildPermissions } from '@gmod/domain-user/guildPermissions.js'

export default {
  name: 'roleUpdate',
  async execute(oldRole: Role, newRole: Role) {
    if (oldRole.permissions.bitfield !== newRole.permissions.bitfield)
      await invalidateDiscordGuildPermissions({ guildID: newRole.guild.id })
  },
}
