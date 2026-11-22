import type { Role } from 'discord.js'
import { invalidateDiscordGuildPermissions } from '@gmod/domain-user/guildPermissions.js'

export default {
  name: 'roleDelete',
  async execute(role: Role) {
    await invalidateDiscordGuildPermissions({ guildID: role.guild.id })
  },
}
