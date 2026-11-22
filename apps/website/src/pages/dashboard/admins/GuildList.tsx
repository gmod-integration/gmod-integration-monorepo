import { type Component, createResource, For, Show } from 'solid-js'

import { fetchAPI } from '../../../utils/api'
import { useI18n } from '../../../i18n.js'
import { AsyncState } from '../../../components/ui/index.js'
import Pagination from '../../../components/Pagination.js'
import { createListPagination } from '../../../hooks/createListPagination.js'

type AdminGuild = {
  name: string
  guild: string
  language: string
  member: number
  createdAt: string
  updatedAt: string
}

const fetchGuildList = async (): Promise<AdminGuild[]> => {
  const res = await fetchAPI('/users/:discordID/admins/guilds', 'GET')
  if (!res.ok) throw new Error('Discord communities request failed')
  const data: AdminGuild[] = await res.json()
  return data.sort((a, b) => b.member - a.member)
}

const GuildList: Component = () => {
  const { t, locale } = useI18n()
  const [guildList, { refetch }] = createResource('guildList', fetchGuildList)
  const pagination = createListPagination(() => (guildList.error ? undefined : guildList()))

  return (
    <>
      <p class="text-sm text-base-content/65">
        {t(
          'admin.communities_description',
          'Registered Discord communities, ordered by member count. Dates refer to their records in Gmod Integration.',
        )}
      </p>
      <AsyncState
        loading={guildList.loading}
        error={guildList.error}
        empty={!guildList.loading && !guildList.error && guildList()?.length === 0}
        errorLabel={t('admin.communities_load_error', 'Unable to load the Discord communities. Try again.')}
        emptyLabel={t('admin.communities_empty', 'No communities to display.')}
        onRetry={() => void refetch()}
      >
        <div class="flex flex-wrap gap-4">
          <For each={pagination.items()}>
            {(guild) => (
              <div class="card min-w-0 w-full max-w-[400px] shadow-md border border-base-200">
                <div class="card-body min-w-0 [overflow-wrap:anywhere]">
                  <h2 class="card-title text-xl">{guild.name}</h2>
                  <p class="text-base-content/50">
                    {t('admin.community_id', 'Discord server ID')}: <span>{guild.guild}</span>
                  </p>
                  <p class="text-base-content/50">
                    {t('admin.bot_language', 'Bot language')}: <span>{guild.language}</span>
                  </p>
                  <p class="text-base-content/50">
                    {t('admin.members', 'Members')}: <span>{guild.member.toLocaleString(locale())}</span>
                  </p>
                  <p class="text-base-content/50">
                    {t('admin.registered_at', 'Registered')}:{' '}
                    <span>{new Date(guild.createdAt).toLocaleString(locale())}</span>
                  </p>
                  <p class="text-base-content/50">
                    {t('admin.updated_at', 'Record updated')}:{' '}
                    <span>{new Date(guild.updatedAt).toLocaleString(locale())}</span>
                  </p>
                </div>
              </div>
            )}
          </For>
        </div>
        <Show when={pagination.visible()}>
          <div class="pt-4">
            <Pagination
              standalone
              query={pagination.query()}
              total={pagination.total()}
              onChange={pagination.onChange}
            />
          </div>
        </Show>
      </AsyncState>
    </>
  )
}

export default GuildList
