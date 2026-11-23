import { createEffect, Show, type Accessor } from 'solid-js'
import { guildRoles, guildRolesRefetch } from '../pages/dashboard/guilds/GuildInformations.js'
import { AsyncState } from './ui/index.js'

/** Metadata availability stays separate from saved rules and unfinished editors. */
export const GuildRolesState = () => (
  <Show when={guildRoles.loading || guildRoles.error}>
    <AsyncState loading={guildRoles.loading} error={guildRoles.error} onRetry={() => void guildRolesRefetch()} />
  </Show>
)

/** Restored options must also restore the visible choice from the untouched form draft. */
export function retainGuildRoleSelection(select: HTMLSelectElement, selected: Accessor<string>) {
  createEffect(() => {
    if (!guildRoles.loading && !guildRoles.error) {
      guildRoles()
      select.value = selected()
    }
  })
}
