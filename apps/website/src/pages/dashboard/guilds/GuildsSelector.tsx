import { Button, Icon } from '../../../components/ui/index.js'
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
import { authStatus } from '../../../utils/authClient.js'
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
  const [search, setSearch] = createSignal('')
  const filteredGuilds = () => {
    const term = search().trim().toLocaleLowerCase()
    return (guilds.error ? [] : guilds() || []).filter((guild) => guild.name.toLocaleLowerCase().includes(term))
  }
  const inviteTimers = new Set<ReturnType<typeof setInterval>>()

  createEffect(() => {
    if (!isLogged() && authStatus() === 'signed_out') navigate('/login')
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
      <div class="dashboard-selection-page mx-auto flex w-full max-w-6xl flex-col gap-7 p-4 sm:p-8 lg:p-10">
        <div class="dashboard-selection-heading flex flex-wrap items-start justify-between gap-5">
          <div class="flex max-w-2xl flex-col gap-3">
            <span class="inline-flex w-fit items-center gap-2 text-sm font-medium text-primary">
              <Icon name="users" size={17} />
              {t('main.guilds', 'Guilds')}
            </span>
            <h2 class="text-2xl font-semibold tracking-tight sm:text-3xl">
              {t('dashboard.guild.select.select_guild', 'Select a Guild to manage / add the Bot to')}
            </h2>
            <p class="max-w-xl text-sm leading-relaxed text-base-content/55">
              {t(
                'ui.communities_description',
                'Choose your community to configure its connections, members and servers.',
              )}
            </p>
          </div>
          <a
            href="discord://-/guilds/create"
            class="inline-flex shrink-0 items-center gap-2 rounded-lg border border-base-content/10 bg-base-100 px-4 py-2.5 text-sm font-medium transition-colors hover:border-primary/40 hover:text-primary"
          >
            <Icon name="plus" size={17} />
            {t('dashboard.guild.select.create_guild', 'Create a Guild')}
          </a>
        </div>
        <label class="dashboard-selection-toolbar flex w-full max-w-md items-center gap-3 rounded-xl border border-base-content/10 bg-base-100 px-4 py-3 text-base-content/45 focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/10">
          <Icon name="search" size={18} />
          <input
            class="min-w-0 flex-1 bg-transparent text-sm text-base-content outline-none placeholder:text-base-content/35"
            type="search"
            aria-label={t('ui.search_communities', 'Search communities')}
            placeholder={t('ui.search_communities', 'Search communities')}
            value={search()}
            onInput={(event) => setSearch(event.currentTarget.value)}
          />
        </label>
        <Show when={popupBlocked()}>
          <p role="alert" class="text-error text-center">
            {t('ui.popup_blocked', 'Allow pop-ups for this site to invite the bot.')}
          </p>
        </Show>
        <div
          class="dashboard-entity-grid grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
          aria-busy={guilds.loading}
        >
          <Switch>
            <Match when={guilds.loading}>
              <div
                role="status"
                class="col-span-full flex min-h-40 items-center justify-center gap-3 rounded-2xl border border-base-content/8 bg-base-100 text-sm text-base-content/50"
              >
                <Icon name="loader-circle" size={19} class="animate-spin" />
                <span>{t('ui.loading', 'Loading…')}</span>
              </div>
            </Match>
            <Match when={guilds.error}>
              <div
                role="alert"
                class="col-span-full flex flex-col items-center gap-4 rounded-2xl border border-base-content/10 bg-base-100 p-10"
              >
                <h2 class="text-2xl font-bold text-center text-secondary">
                  {t('dashboard.guild.select.failed_to_fetch_guilds', 'Error loading guilds')}
                </h2>
                <Button type="button" onClick={() => refetch()}>
                  {t('ui.retry', 'Try again')}
                </Button>
              </div>
            </Match>
            <Match when={!guilds.loading}>
              <For
                each={filteredGuilds()}
                fallback={
                  <p
                    role="status"
                    class="col-span-full rounded-2xl border border-dashed border-base-content/15 p-10 text-center text-sm text-base-content/55"
                  >
                    {search().trim()
                      ? t('ui.no_search_results', 'No results match your search.')
                      : t('ui.no_guilds', 'No communities are available for this account.')}
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
                    class="dashboard-entity-card group relative flex min-w-0 flex-col overflow-hidden rounded-2xl border border-base-content/10 bg-base-100 p-5 transition duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
                  >
                    <div class="flex items-start gap-4">
                      <img
                        src={guild.icon || defaultGuild}
                        alt={guild.name}
                        class="dashboard-entity-avatar h-14 w-14 shrink-0 rounded-2xl border border-base-content/5 object-cover"
                        loading="lazy"
                      />
                      <div class="dashboard-entity-meta min-w-0 flex-1 pt-1">
                        <h3 class="truncate text-base font-semibold tracking-tight">{guild.name}</h3>
                        <p class="mt-1 text-xs text-base-content/50">
                          {guild.isOwner
                            ? t('dashboard.guild.select.owner', 'Owner')
                            : t('dashboard.guild.select.admin', 'Admin')}
                        </p>
                      </div>
                      <Show when={guild.isPremium}>
                        <span
                          class="inline-flex items-center justify-center rounded-lg bg-amber-400/10 p-1.5 text-amber-500"
                          title={t('main.premium', 'Premium')}
                        >
                          <Icon name="crown" size={16} />
                        </span>
                      </Show>
                    </div>
                    <div class="dashboard-entity-action mt-5 flex items-center justify-between border-t border-base-content/6 pt-4 text-sm font-medium text-base-content/65 group-hover:text-primary">
                      <span>
                        {guild.hasBot
                          ? t('dashboard.guild.select.manage', 'Manage')
                          : t('dashboard.guild.select.add_bot', 'Add Bot')}
                      </span>
                      <Icon
                        name={guild.hasBot ? 'arrow-right' : 'plus'}
                        size={17}
                        class="transition-transform group-hover:translate-x-0.5"
                      />
                    </div>
                  </A>
                )}
              </For>
            </Match>
          </Switch>
        </div>
      </div>
    </>
  )
}

export default GuildsSelector
