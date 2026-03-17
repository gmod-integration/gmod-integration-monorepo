import { Component, createResource, For, Match, Switch } from 'solid-js'
import { A, useNavigate } from '@solidjs/router'
import defaultServer from '../../../../assets/defaultServer.png'
import { useI18n } from '../../../../i18n'
import { PremiumFeature } from '../../../../components/popup/NeedPremium'
import { premium } from '../../../../utils/premium'
import { fetchAPI, getUrlWithActualParams } from '../../../../utils/api'

const fetchServers = async () => {
  const res = await fetchAPI('/users/:discordID/guilds/:guildID/servers', 'GET')
  return await res.json()
}

const ServerList: Component = () => {
  const [servers] = createResource('servers', fetchServers)
  const navigate = useNavigate()

  const { t } = useI18n()

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
          <span class="loading loading-spinner loading-lg py-12">
            {t('dashboard.server.servers_selector.loading', 'Loading...')}
          </span>
        </Match>
        <Match when={!servers.loading}>
          <div class="flex flex-col max-w-(--breakpoint-2xl) mx-auto gap-4 p-4">
            <h2 class="text-2xl py-8 font-bold text-center">
              {t('dashboard.server.servers_selector.select_server', 'Select a Server to manage')}
            </h2>
            <div class="flex flex-wrap justify-center gap-4">
              <For each={servers()}>
                {(server) => (
                  <A
                    href={getUrlWithActualParams(`/dashboard/guilds/:guildID/config/servers/${server.id}`)}
                    class="shadowHover flex flex-col border border-base-200 rounded-md min-w-[360px] p-5 gap-4 cursor-pointer"
                    onClick={() => localStorage.setItem('server', JSON.stringify(server))}
                  >
                    <img
                      src={server.image || defaultServer}
                      alt={server.name}
                      class="h-[96px] w-[96px] rounded-full mx-auto mt-4"
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
            <button
              class={'btn btn-base-200 btn-wide mx-auto'}
              classList={{
                'btn-disabled': !premium() && (!servers() || servers().length >= 1),
              }}
              onClick={async () => {
                const newServerRes = await fetchAPI('/users/:discordID/guilds/:guildID/servers', 'POST')
                if (!newServerRes.ok) {
                  return
                }
                const newServer = await newServerRes.json()
                localStorage.setItem('server', JSON.stringify(newServer))
                navigate(`/dashboard/guilds/:guildID/config/servers/${newServer.id}`)
              }}
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
