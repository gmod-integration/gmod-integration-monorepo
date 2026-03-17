import { Component, createEffect, createResource, For, Match, onCleanup, Switch } from 'solid-js'
import { A, useNavigate } from '@solidjs/router'
import defaultGuild from '../../../assets/defaultGuild.png'
import { isLogged } from '../../../utils/event'
import { useI18n } from '../../../i18n'
import { fetchAPI } from '../../../utils/api'

const fetchGuilds = async () => {
  const res = await fetchAPI('/users/:discordID/guilds', 'GET')
  const guilds = await res.json()

  guilds.sort((a: any, b: any) => {
    if (a.isPremium === b.isPremium) {
      if (a.hasBot === b.hasBot) {
        return a.name.localeCompare(b.name)
      }
      return b.hasBot - a.hasBot
    }
    return b.isPremium - a.isPremium
  })

  return guilds
}

const GuildsSelector: Component = () => {
  const [guilds, { refetch }] = createResource('guilds', fetchGuilds)
  const navigate = useNavigate()
  const { t } = useI18n()

  createEffect(() => {
    if (!isLogged()) {
      navigate('/login')
    }
    localStorage.removeItem('server')
    localStorage.removeItem('guilds')
  }, [location.pathname])

  return (
    <>
      <div class="flex flex-col max-w-(--breakpoint-2xl) mx-auto gap-4 p-4">
        <h2 class="text-2xl py-8 font-bold text-center">
          {t('dashboard.guild.select.select_guild', 'Select a Guild to manage / add the Bot to')}
        </h2>
        <div class="flex flex-wrap justify-center gap-4">
          <Switch>
            <Match when={guilds.loading}>
              <span class="loading loading-spinner loading-lg py-12"></span>
            </Match>
            <Match when={guilds.error}>
              <h2 class="text-2xl font-bold text-center text-secondary">
                {t('dashboard.guild.select.failed_to_fetch_guilds', 'Error loading guilds')}
              </h2>
            </Match>
            <Match when={!guilds.loading}>
              <For each={guilds()}>
                {(guild) => (
                  <A
                    onClick={(e) => {
                      if (!guild.hasBot) {
                        e.preventDefault()
                        const newWindow = window.open(`/invite&guild_id=${guild.id}`, '_blank', 'width=600,height=900')
                        const timer = setInterval(function () {
                          if (newWindow && newWindow.closed) {
                            clearInterval(timer)
                            refetch()
                          }
                        }, 500)
                        onCleanup(() => clearInterval(timer))
                      } else {
                        localStorage.setItem('guilds', JSON.stringify(guild))
                      }
                    }}
                    href={`/dashboard/guilds/${guild.id}/config`}
                    class="shadowHover relative flex flex-col border border-base-200 rounded-md min-w-[360px] p-5 gap-4 cursor-pointer"
                  >
                    {guild.isPremium && <i class="fa-solid fa-crown absolute top-5 left-5 text-2xl text-amber-400"></i>}
                    <img
                      src={guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png` : defaultGuild}
                      alt={guild.name}
                      class="h-[96px] w-[96px] rounded-full mx-auto mt-4"
                    />
                    <div>
                      <h3 class="font-bold text-lg">{guild.name}</h3>
                      <p class="text-sm">
                        {guild.isOwner
                          ? t('dashboard.guild.select.owner', 'Owner')
                          : t('dashboard.guild.select.admin', 'Admin')}
                      </p>
                    </div>
                    <div class="btn btn-base-200">
                      {guild.hasBot
                        ? t('dashboard.guild.select.manage', 'Manage')
                        : t('dashboard.guild.select.add_bot', 'Add Bot')}
                    </div>
                  </A>
                )}
              </For>
            </Match>
          </Switch>
        </div>
        <a href="discord://-/guilds/create" class="btn btn-base-200 btn-wide mx-auto">
          {t('dashboard.guild.select.create_guild', 'Create a Guild')}
        </a>
      </div>
    </>
  )
}

export default GuildsSelector
