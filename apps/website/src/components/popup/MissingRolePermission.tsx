import { Icon } from '../ui/index.js'
import { Component, createMemo, createResource, For, Show } from 'solid-js'
import { createStore } from 'solid-js/store'
import { useI18n } from '../../i18n'
import { fetchAPI } from '../../utils/api'
import DiscordRole from '../discord/DiscordRole'

interface BotRoleSubordination {
  name: string
  editable: boolean
}

type BotRoleSubordinationResponse = Record<string, BotRoleSubordination>

async function fetchBotRoleSubordination() {
  return fetchAPI('/users/:discordID/guilds/:guildID/bot/roles/subordination', 'GET')
    .then((response) => response.json())
    .then((data) => {
      console.log('Bot role subordination data:', data)
      return data as BotRoleSubordinationResponse
    })
    .catch((error) => {
      console.error('Error fetching bot role subordination:', error)
      throw error
    })
}

export const [rolesToCheck, setRolesToCheckLocal] = createStore<string[]>([])

export function setRolesToCheck(roles: string[]) {
  if (roles.join(',') === rolesToCheck.join(',')) return
  setRolesToCheckLocal(roles)
}

const MissingRolePermission: Component = () => {
  const [botRoleSubordination, setBotRoleSubordination] = createResource(
    'botRoleSubordination',
    fetchBotRoleSubordination,
  )

  const { t } = useI18n()

  const uneditableRoles = createMemo(() => {
    if (botRoleSubordination.loading) return []

    const roleToRtn: string[] = []
    for (const roleID of rolesToCheck) {
      const role = botRoleSubordination()?.[roleID]
      if (!role) roleToRtn.push(roleID)
      if (role && !role.editable) roleToRtn.push(roleID)
    }

    return roleToRtn
  })

  return (
    <Show when={uneditableRoles().length > 0}>
      <div class="text-warning flex items-center rounded-lg border-warning border py-2 px-4 gap-4">
        <Icon name="triangle-alert" />
        <span class="flex flex-wrap gap-1">
          {t(
            'tools.needRolesPerms',
            'The bot cannot assign or remove these roles. Give it the Manage Roles permission and place its highest role above the affected roles in Discord: {1}',
            '',
          )}
          <For each={uneditableRoles()}>
            {(role) => (
              <>
                <DiscordRole roleID={role} />
              </>
            )}
          </For>
        </span>
      </div>
    </Show>
  )
}

export default MissingRolePermission
