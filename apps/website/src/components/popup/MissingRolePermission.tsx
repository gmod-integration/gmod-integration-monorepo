import { AsyncState, Icon } from '../ui/index.js'
import { createMemo, createResource, For, onCleanup, onMount, Show, type Component } from 'solid-js'
import { createStore } from 'solid-js/store'
import { useLocation, useParams } from '@solidjs/router'
import { useI18n } from '../../i18n.js'
import { fetchAPI } from '../../utils/api.js'
import { getGuild } from '../../utils/utils.js'
import DiscordRole from '../discord/DiscordRole.js'

interface BotRoleSubordination {
  name: string
  editable: boolean
}

type BotRoleSubordinationResponse = Record<string, BotRoleSubordination>

async function fetchBotRoleSubordination(guildID: string, signal: AbortSignal): Promise<BotRoleSubordinationResponse> {
  const response = await fetchAPI(
    `/users/:discordID/guilds/${guildID ? encodeURIComponent(guildID) : ':guildID'}/bot/roles/subordination`,
    'GET',
    undefined,
    { signal },
  )
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
  const params = useParams()
  const location = useLocation()
  const permissionSource = () =>
    rolesToCheck.length > 0 &&
    JSON.stringify([params.guildID || getGuild().id || '', location.pathname, ...new Set(rolesToCheck)])
  let disposed = false
  let activeController: AbortController | undefined
  let activeTimeout: ReturnType<typeof setTimeout> | undefined
  let pending: Promise<BotRoleSubordinationResponse | undefined> | undefined
  let pendingSource = ''
  const [botRoleSubordination, { refetch }] = createResource(permissionSource, async (source) => {
    if (pending && pendingSource === source) return pending
    const previous = pending
    const operation = (async () => {
      // A changed role list or guild supersedes queued checks; only one request runs at a time.
      await previous?.catch(() => undefined)
      if (disposed || source !== permissionSource()) return
      const [guildID] = JSON.parse(source) as string[]
      const controller = new AbortController()
      activeController = controller
      const timeout = setTimeout(() => controller.abort(), 15_000)
      activeTimeout = timeout
      try {
        return await fetchBotRoleSubordination(guildID, controller.signal)
      } finally {
        clearTimeout(timeout)
        if (activeController === controller) activeController = undefined
      }
    })()
    pendingSource = source
    pending = operation
    try {
      return await operation
    } finally {
      if (pending === operation) pending = undefined
    }
  })
  const refreshIfVisible = () => {
    if (!disposed && document.visibilityState !== 'hidden' && permissionSource()) void refetch()
  }
  let refreshInterval: ReturnType<typeof setInterval> | undefined
  onMount(() => {
    window.addEventListener('focus', refreshIfVisible)
    document.addEventListener('visibilitychange', refreshIfVisible)
    refreshInterval = setInterval(refreshIfVisible, 30_000)
  })
  onCleanup(() => {
    disposed = true
    clearTimeout(activeTimeout)
    activeController?.abort()
    clearInterval(refreshInterval)
    window.removeEventListener('focus', refreshIfVisible)
    document.removeEventListener('visibilitychange', refreshIfVisible)
  })

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
