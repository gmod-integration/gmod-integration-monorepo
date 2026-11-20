import { createResource, createSignal, For, Match, Switch, type Component } from 'solid-js'
import { A, useNavigate } from '@solidjs/router'
import defaultServer from '../../../../assets/defaultServer.png'
import { useI18n } from '../../../../i18n.js'
import { PremiumFeature } from '../../../../components/popup/NeedPremium.js'
import { premium } from '../../../../utils/premium.js'
import { fetchAPI, getUrlWithActualParams } from '../../../../utils/api.js'

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
  const cannotCreate = () =>
    creating() || servers.loading || Boolean(servers.error) || (!premium() && (servers()?.length || 0) >= 1)

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
      <PremiumFeature
        message={t(
          'dashboard.server.servers_selector.premium_feature_message',
          'The free plan only allows you to manage one server.',
        )}
      />
      <Switch>
        <Match when={servers.loading}>
          <span role="status" class="loading loading-spinner loading-lg py-12">
            {t('dashboard.server.servers_selector.loading', 'Loading...')}
          </span>
        </Match>
        <Match when={servers.error}>
          <div role="alert" class="flex flex-col items-center gap-4 py-12">
            <p class="text-center text-secondary">{t('ui.servers_unavailable', 'Your servers could not be loaded.')}</p>
            <button type="button" class="btn btn-base-200" onClick={() => refetch()}>
              {t('ui.retry', 'Try again')}
            </button>
          </div>
        </Match>
        <Match when={!servers.loading}>
          <div class="flex flex-col max-w-(--breakpoint-2xl) mx-auto gap-4 p-4">
            <h2 class="text-2xl py-8 font-bold text-center">
              {t('dashboard.server.servers_selector.select_server', 'Select a Server to manage')}
            </h2>
            <div class="flex flex-wrap justify-center gap-4">
              <For
                each={servers() || []}
                fallback={
                  <p role="status" class="text-center text-base-content/70">
                    {t('ui.no_servers', 'No servers yet. Connect your first server to get started.')}
                  </p>
                }
              >
                {(server) => (
                  <A
                    href={getUrlWithActualParams(`/dashboard/guilds/:guildID/config/servers/${server.id}`)}
                    class="shadowHover flex flex-col border border-base-200 rounded-md min-w-[360px] max-sm:min-w-0 max-sm:w-full p-5 gap-4 cursor-pointer"
                    onClick={() => localStorage.setItem('server', JSON.stringify(server))}
                  >
                    <img
                      src={server.image || defaultServer}
                      alt={server.name}
                      class="h-[96px] w-[96px] rounded-full mx-auto mt-4"
                      loading="lazy"
                    />
                    <div>
                      <h3 class="font-bold text-lg">{server.name}</h3>
                      <h3>{`${server.ip}:${server.port}`}</h3>
                    </div>
                    <div class="btn btn-base-200">{t('dashboard.server.servers_selector.manage_server', 'Manage')}</div>
                  </A>
                )}
              </For>
            </div>
            {createFailed() && (
              <p role="alert" class="text-error text-center">
                {t('ui.create_server_failed', 'The server could not be created. Please try again.')}
              </p>
            )}
            <button
              type="button"
              class="btn btn-base-200 btn-wide mx-auto"
              classList={{ 'btn-disabled': cannotCreate() }}
              disabled={cannotCreate()}
              aria-busy={creating()}
              onClick={createServer}
            >
              {t('dashboard.server.servers_selector.create_server', 'Create Server')}
            </button>
          </div>
        </Match>
      </Switch>
    </>
  )
}

export default ServerList
