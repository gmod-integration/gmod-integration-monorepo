import { Button, Icon } from '../../../../components/ui/index.js'
import { createResource, createSignal, For, Match, Show, Switch, type Component } from 'solid-js'
import { A, useNavigate } from '@solidjs/router'
import defaultServer from '../../../../assets/defaultServer.png'
import { useI18n } from '../../../../i18n.js'
import { FeatureGate } from '../../../../components/FeatureGate.js'
import { useFeatureAccess } from '../../../../components/AccessProvider.js'
import { fetchAPI, getUrlWithActualParams } from '../../../../utils/api.js'
import Pagination from '../../../../components/Pagination.js'
import { createListPagination } from '../../../../hooks/createListPagination.js'

type ServerSummary = { id: string; name: string; ip: string; port: number; image?: string }

const fetchServers = async (): Promise<ServerSummary[]> => {
  const response = await fetchAPI('/users/:discordID/guilds/:guildID/servers', 'GET')
  if (!response.ok) throw new Error('Servers unavailable')
  const servers: ServerSummary[] = await response.json()
  if (!Array.isArray(servers)) throw new Error('Invalid servers response')
  return servers
}

const ServerList: Component = () => {
  const [servers, { refetch }] = createResource(fetchServers)
  const [creating, setCreating] = createSignal(false)
  const [createFailed, setCreateFailed] = createSignal(false)
  const navigate = useNavigate()
  const { t } = useI18n()
  const quotaAccess = useFeatureAccess('guild.servers')
  const [search, setSearch] = createSignal('')
  const filteredServers = () => {
    const term = search().trim().toLocaleLowerCase()
    return (servers.error ? [] : servers() || []).filter((server) =>
      `${server.name} ${server.ip}:${server.port}`.toLocaleLowerCase().includes(term),
    )
  }
  const pagination = createListPagination(filteredServers, { resetKey: search })
  const cannotCreate = () =>
    creating() || servers.loading || Boolean(servers.error) || !quotaAccess.canCreate(servers()?.length || 0)

  const createServer = async () => {
    if (cannotCreate()) return
    setCreating(true)
    setCreateFailed(false)
    try {
      const response = await fetchAPI('/users/:discordID/guilds/:guildID/servers', 'POST')
      if (!response.ok) throw new Error('Create server failed')
      const server: ServerSummary = await response.json()
      if (!server || typeof server.id !== 'string') throw new Error('Invalid server response')
      localStorage.setItem('server', JSON.stringify(server))
      navigate(getUrlWithActualParams(`/dashboard/guilds/:guildID/config/servers/${server.id}`))
    } catch {
      setCreateFailed(true)
    } finally {
      setCreating(false)
    }
  }

  return (
    <>
      <Switch>
        <Match when={servers.loading}>
          <div
            role="status"
            class="flex min-h-40 items-center justify-center gap-3 rounded-2xl border border-base-content/8 bg-base-100 text-sm text-base-content/50"
          >
            <Icon name="loader-circle" size={19} class="animate-spin" />
            <span>{t('dashboard.server.servers_selector.loading', 'Loading...')}</span>
          </div>
        </Match>
        <Match when={servers.error}>
          <div
            role="alert"
            class="flex flex-col items-center gap-4 rounded-2xl border border-base-content/10 bg-base-100 p-10"
          >
            <p class="text-center text-secondary">{t('ui.servers_unavailable', 'Your servers could not be loaded.')}</p>
            <Button type="button" onClick={() => refetch()}>
              {t('ui.retry', 'Try again')}
            </Button>
          </div>
        </Match>
        <Match when={!servers.loading}>
          <div class="dashboard-selection-page flex w-full flex-col gap-6">
            <div class="dashboard-selection-heading flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 class="text-xl font-semibold tracking-tight sm:text-2xl">
                  {t('dashboard.server.servers_selector.select_server', 'Your game servers')}
                </h2>
                <p class="mt-2 max-w-2xl text-sm text-base-content/60">
                  {t(
                    'dashboard.server.servers_selector.description',
                    'Add your existing Garry’s Mod server here, then follow its setup instructions to connect the addon. This does not create or host a game server.',
                  )}
                </p>
              </div>
              <FeatureGate
                capability="guild.servers"
                used={servers()?.length || 0}
                loading={servers.loading}
                error={servers.error}
              >
                <Button
                  type="button"
                  variant="primary"
                  classList={{ 'btn-disabled': cannotCreate() }}
                  disabled={cannotCreate()}
                  loading={creating()}
                  onClick={createServer}
                >
                  <Icon name="plus" size={17} />
                  {t('dashboard.server.servers_selector.create_server', 'Add server')}
                </Button>
              </FeatureGate>
            </div>
            <label class="dashboard-selection-toolbar flex w-full max-w-md items-center gap-3 rounded-xl border border-base-content/10 bg-base-100 px-4 py-3 text-base-content/45 focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/10">
              <Icon name="search" size={18} />
              <input
                class="min-w-0 flex-1 bg-transparent text-sm text-base-content outline-none placeholder:text-base-content/35"
                type="search"
                aria-label={t('ui.search_servers', 'Search servers')}
                placeholder={t('ui.search_servers', 'Search servers')}
                value={search()}
                onInput={(event) => setSearch(event.currentTarget.value)}
              />
            </label>
            <div class="dashboard-entity-grid grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
              <For
                each={pagination.items()}
                fallback={
                  <p
                    role="status"
                    class="col-span-full rounded-2xl border border-dashed border-base-content/15 p-10 text-center text-sm text-base-content/55"
                  >
                    {search().trim()
                      ? t('ui.no_search_results', 'No results match your search.')
                      : t('ui.no_servers', 'No servers yet. Connect your first server to get started.')}
                  </p>
                }
              >
                {(server) => (
                  <A
                    href={getUrlWithActualParams(`/dashboard/guilds/:guildID/config/servers/${server.id}`)}
                    class="dashboard-entity-card group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-base-content/10 bg-base-100 p-5 transition duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
                    onClick={() => localStorage.setItem('server', JSON.stringify(server))}
                  >
                    <div class="flex items-start gap-4">
                      <img
                        src={server.image || defaultServer}
                        alt={server.name}
                        class="dashboard-entity-avatar h-14 w-14 shrink-0 rounded-2xl border border-base-content/5 object-cover"
                        loading="lazy"
                      />
                      <div class="dashboard-entity-meta min-w-0 flex-1 pt-1">
                        <h3 class="truncate text-base font-semibold tracking-tight">{server.name}</h3>
                        <p class="mt-1.5 font-mono text-xs text-base-content/45">{`${server.ip}:${server.port}`}</p>
                      </div>
                      <span class="rounded-lg bg-base-200/60 p-2 text-base-content/40">
                        <Icon name="server" size={17} />
                      </span>
                    </div>
                    <div class="dashboard-entity-action mt-5 flex items-center justify-between border-t border-base-content/6 pt-4 text-sm font-medium text-base-content/65 group-hover:text-primary">
                      <span>{t('dashboard.server.servers_selector.manage_server', 'Configure server')}</span>
                      <Icon name="arrow-right" size={17} class="transition-transform group-hover:translate-x-0.5" />
                    </div>
                  </A>
                )}
              </For>
            </div>
            <Show when={pagination.visible()}>
              <Pagination
                standalone
                query={pagination.query()}
                total={pagination.total()}
                onChange={pagination.onChange}
              />
            </Show>
            {createFailed() && (
              <p role="alert" class="text-error text-center">
                {t('ui.create_server_failed', 'The server could not be created. Please try again.')}
              </p>
            )}
          </div>
        </Match>
      </Switch>
    </>
  )
}

export default ServerList
