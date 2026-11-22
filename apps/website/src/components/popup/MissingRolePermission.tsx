import { AsyncState, Icon } from '../ui/index.js'
import { createMemo, createResource, For, Show, type Component } from 'solid-js'
import { createStore } from 'solid-js/store'
import { useI18n } from '../../i18n'
import { fetchAPI } from '../../utils/api'
import DiscordRole from '../discord/DiscordRole'

interface BotRoleSubordination {
  name: string
  editable: boolean
}

type BotRoleSubordinationResponse = Record<string, BotRoleSubordination>

async function fetchBotRoleSubordination(): Promise<BotRoleSubordinationResponse> {
  const response = await fetchAPI('/users/:discordID/guilds/:guildID/bot/roles/subordination', 'GET')
  if (!response.ok) throw new Error('Bot role permissions unavailable')
  const data: unknown = await response.json()
  if (
    !data ||
    typeof data !== 'object' ||
    Array.isArray(data) ||
    Object.values(data).some((role) => !role || typeof role.name !== 'string' || typeof role.editable !== 'boolean')
  )
    throw new Error('Invalid bot role permissions')
  return data as BotRoleSubordinationResponse
}

export const [rolesToCheck, setRolesToCheckLocal] = createStore<string[]>([])

export function setRolesToCheck(roles: string[]) {
  if (roles.join(',') === rolesToCheck.join(',')) return
  setRolesToCheckLocal(roles)
}

const MissingRolePermission: Component = () => {
  const [botRoleSubordination, { refetch }] = createResource('botRoleSubordination', fetchBotRoleSubordination)

  const { t } = useI18n()

  const uneditableRoles = createMemo(() => {
    if (botRoleSubordination.loading || botRoleSubordination.error) return []

    const roleToRtn: string[] = []
    for (const roleID of rolesToCheck) {
      const role = botRoleSubordination()?.[roleID]
      if (!role) roleToRtn.push(roleID)
      if (role && !role.editable) roleToRtn.push(roleID)
    }

    return roleToRtn
  })

  return (
    <Show when={rolesToCheck.length > 0}>
      <AsyncState
        loading={botRoleSubordination.loading}
        error={botRoleSubordination.error}
        onRetry={() => void refetch()}
      >
        <Show when={uneditableRoles().length > 0}>
          <div class="text-warning flex items-center rounded-lg border-warning border py-2 px-4 gap-4">
            <Icon name="triangle-alert" />
            <span class="flex flex-wrap gap-1">
              {t(
                'tools.needRolesPerms',
                'The bot cannot assign or remove these roles. Give it the Manage Roles permission and place its highest role above the affected roles in Discord: {1}',
                '',
              )}
              <For each={uneditableRoles()}>{(role) => <DiscordRole roleID={role} />}</For>
            </span>
          </div>
        </Show>
      </AsyncState>
    </Show>
  )
}

export default MissingRolePermission
