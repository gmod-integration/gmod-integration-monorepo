import {
  createEffect,
  createResource,
  createSignal,
  For,
  Match,
  onCleanup,
  onMount,
  Show,
  Switch,
  type Component,
} from 'solid-js'
import { A, useNavigate } from '@solidjs/router'
import defaultGuild from '../../../assets/defaultGuild.png'
import { isLogged } from '../../../utils/event.js'
import { useI18n } from '../../../i18n.js'
import { INVITE_URL } from '../../../utils/utils.js'
import { fetchAPI } from '../../../utils/api.js'

type GuildSummary = {
  id: string
  name: string
  isPremium: boolean
  hasBot: boolean
  isOwner: boolean
  icon: string | null
}

const fetchGuilds = async (): Promise<GuildSummary[]> => {
  const response = await fetchAPI('/users/:discordID/guilds', 'GET')
  if (!response.ok) throw new Error('Communities unavailable')
  const guilds: GuildSummary[] = await response.json()
  if (!Array.isArray(guilds)) throw new Error('Invalid communities response')
  return [...guilds].sort(
    (a, b) =>
      Number(b.isPremium) - Number(a.isPremium) || Number(b.hasBot) - Number(a.hasBot) || a.name.localeCompare(b.name),
  )
}

const GuildsSelector: Component = () => {
  const [guilds, { refetch }] = createResource(isLogged, fetchGuilds)
  const navigate = useNavigate()
  const { t } = useI18n()
  const [popupBlocked, setPopupBlocked] = createSignal(false)
  const inviteTimers = new Set<ReturnType<typeof setInterval>>()

  createEffect(() => {
    if (!isLogged()) navigate('/login')
  })
  onMount(() => {
    localStorage.removeItem('server')
    localStorage.removeItem('guilds')
  })
  onCleanup(() => inviteTimers.forEach((timer) => clearInterval(timer)))

  const invite = (guild: GuildSummary) => {
    setPopupBlocked(false)
    const url = new URL(INVITE_URL)
    url.searchParams.set('guild_id', guild.id)
    const popup = window.open(url.toString(), '_blank', 'width=600,height=900')
    if (!popup) {
      setPopupBlocked(true)
      return
    }
    const timer = setInterval(() => {
      if (!popup.closed) return
      clearInterval(timer)
      inviteTimers.delete(timer)
      void refetch()
    }, 500)
    inviteTimers.add(timer)
  }

  return (
    <>
      <div class="flex flex-col max-w-(--breakpoint-2xl) mx-auto gap-4 p-4">
        <h2 class="text-2xl py-8 font-bold text-center">
          {t('dashboard.guild.select.select_guild', 'Select a Guild to manage / add the Bot to')}
        </h2>
        <Show when={popupBlocked()}>
          <p role="alert" class="text-error text-center">
            {t('ui.popup_blocked', 'Allow pop-ups for this site to invite the bot.')}
          </p>
        </Show>
        <div class="flex flex-wrap justify-center gap-4" aria-busy={guilds.loading}>
          <Switch>
            <Match when={guilds.loading}>
              <span role="status" class="loading loading-spinner loading-lg py-12">
                <span class="sr-only">{t('ui.loading', 'Loading…')}</span>
              </span>
            </Match>
            <Match when={guilds.error}>
              <div role="alert" class="flex flex-col items-center gap-4">
                <h2 class="text-2xl font-bold text-center text-secondary">
                  {t('dashboard.guild.select.failed_to_fetch_guilds', 'Error loading guilds')}
                </h2>
                <button type="button" class="btn btn-base-200" onClick={() => refetch()}>
                  {t('ui.retry', 'Try again')}
                </button>
              </div>
            </Match>
            <Match when={!guilds.loading}>
              <For
                each={guilds() || []}
                fallback={
                  <p role="status" class="text-center text-base-content/70">
                    {t('ui.no_guilds', 'No communities are available for this account.')}
                  </p>
                }
              >
                {(guild) => (
                  <A
                    onClick={(event) => {
                      if (!guild.hasBot) {
                        event.preventDefault()
                        invite(guild)
                      } else localStorage.setItem('guilds', JSON.stringify(guild))
                    }}
                    href={`/dashboard/guilds/${encodeURIComponent(guild.id)}/config`}
                    class="shadowHover relative flex flex-col border border-base-200 rounded-md min-w-[360px] max-sm:min-w-0 max-sm:w-full p-5 gap-4 cursor-pointer"
                  >
                    <Show when={guild.isPremium}>
                      <i aria-label="Premium" class="fa-solid fa-crown absolute top-5 left-5 text-2xl text-amber-400" />
                    </Show>
                    <img
                      src={guild.icon || defaultGuild}
                      alt={guild.name}
                      class="h-[96px] w-[96px] rounded-full mx-auto mt-4"
                      loading="lazy"
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
