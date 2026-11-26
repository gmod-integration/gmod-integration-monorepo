import { Show, type Component } from 'solid-js'
import type { TypeDiscordRole } from '../../utils/types/DiscordTypes.js'
import { guildRoles } from '../../pages/dashboard/guilds/GuildInformations.js'

interface DiscordRoleProps {
  role?: TypeDiscordRole
  roleID?: string
}

const DiscordRole: Component<DiscordRoleProps> = (props) => {
  const resolvedRole = () => {
    if (props.role) return props.role
    if (!props.roleID || guildRoles.loading || guildRoles.error) return
    return guildRoles().find((role) => role.id === props.roleID)
  }

  return (
    <Show when={resolvedRole()}>
      {(role) => {
        const color = () => (role().color === 0 ? '#7d95ff' : role().colorHex)
        return (
          <p
            class="discord-role-mention w-min h-min text-nowrap rounded-md px-1"
            style={{ '--discord-role-color': color() }}
          >{`@${role().name}`}</p>
        )
      }}
    </Show>
  )
}

export default DiscordRole
