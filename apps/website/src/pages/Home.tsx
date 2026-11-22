import { createResource, For, Show, type Component } from 'solid-js'
import servers_status from '../assets/features/servers_status.png'
import profile from '../assets/features/profile.png'
import links from '../assets/features/links.png'
import verification from '../assets/features/verification.png'
import statistic from '../assets/features/statistic.png'
import logs from '../assets/features/logs.png'
import wallpaper from '../assets/wallpaper.png'
import players from '../assets/features/players.png'
import rcon from '../assets/features/rcon.png'
import chat from '../assets/features/chat.png'
import { useI18n } from '../i18n.js'
import { Button, ButtonLink, Icon, type IconName } from '../components/ui/index.js'
import { API_FQDN } from '../utils/api.js'

type PublicStats = { guild: number; server: number; user: number; verifyUser: number }

const fetchStats = async (): Promise<PublicStats> => {
  const response = await fetch(`${API_FQDN}/stats`)
  if (!response.ok) throw new Error('Statistics unavailable')
  const payload: unknown = await response.json()
  if (!payload || typeof payload !== 'object') throw new Error('Invalid statistics response')
  const data = payload as Record<string, unknown>
  const count = (key: keyof PublicStats): number => {
    const value = data[key]
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0
  }
  return { guild: count('guild'), server: count('server'), user: count('user'), verifyUser: count('verifyUser') }
}

const Home: Component = () => {
  const [stat, { refetch }] = createResource(fetchStats)
  const { t, locale } = useI18n()

  type Feature = {
    title: string
    description: string
    img: string
    icon: IconName
  }

  const showFeatures = (): Feature[] => [
    {
      title: t('home.features.server_status.title', 'Server Status'),
      description: t(
        'home.features.server_status.description',
        "Show your game server's connection status, player count, map and game mode in a Discord message. Choose the channel, message content and buttons in the dashboard.",
      ),
      img: servers_status,
      icon: 'activity',
    },
    {
      title: t('home.features.user_profile.title', 'User Profile'),
      description: t(
        'home.features.user_profile.description',
        "View a member's linked Discord and Steam accounts, verification details and available player information from Discord. Profile buttons provide direct access to their accounts.",
      ),
      img: profile,
      icon: 'contact',
    },
    {
      title: t('home.features.chat_bridge.title', 'Chat Bridge'),
      description: t(
        'home.features.chat_bridge.description',
        "Relay messages between Garry's Mod and a Discord channel. Choose the direction of the relay and use filters to control which game messages are sent.",
      ),
      img: chat,
      icon: 'messages-square',
    },
    {
      title: t('home.features.discord_rcon.title', 'Game console commands'),
      description: t(
        'home.features.discord_rcon.description',
        'Run game server console commands from Discord with RCON. Access depends on your permissions and the server configuration.',
      ),
      img: rcon,
      icon: 'monitor',
    },
    {
      title: t('home.features.custom_link.title', 'Community links'),
      description: t(
        'home.features.custom_link.description',
        "Give members quick access to your website, shop, Steam group or Workshop collection through the bot's community links.",
      ),
      img: links,
      icon: 'link',
    },
    {
      title: t('home.features.user_verification.title', 'Discord and Steam verification'),
      description: t(
        'home.features.user_verification.description',
        'Let members link their Discord and Steam accounts. Configure verification messages and Discord roles, and choose whether linked accounts are required to join your game server.',
      ),
      img: verification,
      icon: 'shield-check',
    },
    {
      title: t('home.features.statistics.title', 'Statistics'),
      description: t(
        'home.features.statistics.description',
        'View available player and server statistics to follow activity in your community. The information shown depends on the data collected by your game server.',
      ),
      img: statistic,
      icon: 'chart-no-axes-combined',
    },
    {
      title: t('home.features.logs.title', 'Game server logs'),
      description: t(
        'home.features.logs.description',
        'Read recorded game events in the dashboard and choose which events are relayed to Discord. Add event actions for the conditions you want to monitor.',
      ),
      img: logs,
      icon: 'scroll-text',
    },
    {
      title: t('home.features.player_database.title', 'Player Database'),
      description: t(
        'home.features.player_database.description',
        'Find players recorded by your game server and view their Steam ID, linked Discord account and available activity information. This list includes previous players, not just those currently online.',
      ),
      img: players,
      icon: 'users',
    },
  ]

  const metrics = () => [
    { key: 'guild' as const, icon: 'users' as const, label: t('main.guilds', 'Discord communities') },
    { key: 'server' as const, icon: 'server' as const, label: t('main.servers', 'Servers') },
    { key: 'user' as const, icon: 'user-round' as const, label: t('main.users', 'Users') },
    { key: 'verifyUser' as const, icon: 'shield-check' as const, label: t('main.verified_users', 'Verified Users') },
  ]
  const value = (key: keyof PublicStats) =>
    stat.loading || stat.error ? '—' : (stat()?.[key].toLocaleString(locale()) ?? '—')

  return (
    <div class="public-home">
      <section
        class="public-hero mx-auto grid w-full max-w-6xl min-w-0 items-center gap-12 px-5 py-14 sm:px-8 sm:py-20 lg:grid-cols-[1.08fr_1fr] lg:gap-16 lg:py-24"
        aria-labelledby="home-title"
      >
        <div class="public-hero-copy flex min-w-0 flex-col items-start gap-7">
          <span class="public-eyebrow inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/8 px-3 py-1.5 text-xs font-medium text-primary">
            <Icon name="gamepad-2" size={15} />
            Garry’s Mod
            <span class="text-base-content/30">/</span>
            Discord
          </span>
          <div class="flex flex-col gap-5">
            <h1
              id="home-title"
              class="max-w-xl text-5xl font-semibold leading-[1.03] tracking-[-0.055em] sm:text-6xl lg:text-7xl"
            >
              Gmod Integration
            </h1>
            <p class="max-w-lg text-base leading-relaxed text-base-content/60 sm:text-lg">
              {t(
                'home.hero.title',
                "Connect your Garry's Mod server to Discord: share chat, show server activity and link player accounts.",
              )}
            </p>
          </div>
          <div class="public-hero-actions flex w-full flex-wrap items-center gap-3">
            <ButtonLink href="/dashboard/guilds" variant="primary">
              {t('home.hero.button', 'Open the dashboard')}
              <Icon name="arrow-right" size={17} />
            </ButtonLink>
            <ButtonLink href="/docs">
              <Icon name="book-open" size={17} />
              {t('main.documentation', 'Documentation')}
            </ButtonLink>
          </div>
          <div class="flex flex-wrap gap-x-5 gap-y-3 pt-1 text-xs text-base-content/50">
            <span class="inline-flex items-center gap-2">
              <Icon name="activity" size={14} />
              {t('home.features.server_status.title', 'Server Status')}
            </span>
            <span class="inline-flex items-center gap-2">
              <Icon name="messages-square" size={14} />
              {t('home.features.chat_bridge.title', 'Chat Bridge')}
            </span>
            <span class="inline-flex items-center gap-2">
              <Icon name="shield-check" size={14} />
              {t('home.features.user_verification.title', 'Discord and Steam verification')}
            </span>
          </div>
        </div>

        <div class="public-hero-visual relative min-w-0 overflow-hidden rounded-2xl border border-base-content/10 bg-base-100 shadow-xl shadow-black/5">
          <img
            src={wallpaper}
            alt=""
            aria-hidden="true"
            class="absolute inset-0 h-full w-full object-cover opacity-10"
            decoding="async"
          />
          <div class="relative flex min-w-0 flex-col gap-5 p-5 sm:p-6">
            <div class="flex items-center justify-between gap-4 border-b border-base-content/8 pb-5">
              <span class="inline-flex items-center gap-2.5 text-sm font-medium">
                <Icon name="gamepad-2" class="text-primary" size={19} />
                Garry’s Mod
              </span>
              <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/15 bg-primary/8 text-primary">
                <Icon name="arrow-left-right" size={16} />
              </span>
              <span class="inline-flex items-center gap-2.5 text-sm font-medium">
                <Icon name="messages-square" class="text-primary" size={19} />
                Discord
              </span>
            </div>
            <div class="overflow-hidden rounded-xl border border-base-content/10 bg-base-200/25 p-3 sm:p-4">
              <img
                src={servers_status}
                alt=""
                aria-hidden="true"
                class="mx-auto max-h-80 w-full object-contain"
                decoding="async"
              />
            </div>
            <div class="grid grid-cols-3 gap-2 text-center text-[10px] text-base-content/55 sm:text-xs">
              <span class="flex min-w-0 flex-col items-center gap-2 rounded-lg border border-base-content/8 bg-base-100/75 px-1 py-3">
                <Icon name="users" size={17} />
                {t('main.users', 'Users')}
              </span>
              <span class="flex min-w-0 flex-col items-center gap-2 rounded-lg border border-base-content/8 bg-base-100/75 px-1 py-3">
                <Icon name="server" size={17} />
                {t('main.servers', 'Servers')}
              </span>
              <span class="flex min-w-0 flex-col items-center gap-2 rounded-lg border border-base-content/8 bg-base-100/75 px-1 py-3">
                <Icon name="shield-check" size={17} />
                {t('main.verified_users', 'Verified Users')}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section
        class="public-stats mx-auto grid w-full max-w-6xl grid-cols-2 gap-3 px-5 sm:gap-4 sm:px-8 lg:grid-cols-4"
        aria-label={t('ui.community_statistics', 'Community statistics')}
        aria-busy={stat.loading}
      >
        <For each={metrics()}>
          {(metric) => (
            <div class="public-stat flex min-w-0 flex-col gap-4 rounded-xl border border-base-content/10 bg-base-100 p-5 sm:p-6">
              <div class="flex items-center justify-between gap-2 text-xs text-base-content/55">
                <span>{metric.label}</span>
                <Icon name={metric.icon} size={17} class="text-primary/75" />
              </div>
              <p class="text-2xl font-semibold tracking-tight sm:text-3xl">
                <span aria-hidden="true" class="text-primary">
                  {stat.loading || stat.error ? '' : '+'}
                </span>
                <span>{value(metric.key)}</span>
              </p>
            </div>
          )}
        </For>
        <Show when={stat.error}>
          <div
            role="status"
            class="col-span-full flex flex-wrap items-center justify-center gap-3 rounded-xl border border-base-content/10 bg-base-100 p-4 text-sm text-base-content/60"
          >
            {t('ui.statistics_unavailable', 'Community statistics are temporarily unavailable.')}
            <Button size="sm" variant="ghost" onClick={() => refetch()}>
              {t('ui.retry', 'Try again')}
            </Button>
          </div>
        </Show>
      </section>

      <section
        class="public-section mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 py-16 sm:px-8 sm:py-20"
        aria-labelledby="home-services-title"
      >
        <div class="flex flex-wrap items-end justify-between gap-5 border-b border-base-content/8 pb-6">
          <div class="flex flex-col gap-3">
            <span class="public-eyebrow text-xs font-medium uppercase tracking-[0.12em] text-primary">
              Gmod Integration
            </span>
            <h2 id="home-services-title" class="text-3xl font-semibold tracking-tight sm:text-4xl">
              {t('main.services', 'Services')}
            </h2>
          </div>
          <a
            href="/docs"
            class="inline-flex items-center gap-2 text-sm font-medium text-base-content/60 transition-colors hover:text-primary"
          >
            {t('main.documentation', 'Documentation')}
            <Icon name="arrow-up-right" size={16} />
          </a>
        </div>
        <div class="public-feature-grid grid min-w-0 grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          <For each={showFeatures()}>
            {({ title, description, img, icon }) => (
              <article class="public-feature-card flex min-w-0 flex-col overflow-hidden rounded-xl border border-base-content/10 bg-base-100">
                <div class="public-feature-media flex h-52 items-center justify-center overflow-hidden border-b border-base-content/8 bg-base-200/20 p-5">
                  <img
                    src={img}
                    alt={title}
                    class="max-h-full w-full min-w-0 rounded-lg object-contain"
                    loading="lazy"
                    decoding="async"
                  />
                </div>
                <div class="flex min-w-0 flex-1 flex-col gap-4 p-6">
                  <span class="flex h-9 w-9 items-center justify-center rounded-lg border border-primary/10 bg-primary/8 text-primary">
                    <Icon name={icon} size={18} />
                  </span>
                  <h2 class="text-lg font-semibold tracking-tight">{title}</h2>
                  <p class="text-sm leading-7 text-base-content/55">{description}</p>
                </div>
              </article>
            )}
          </For>
        </div>
        <div class="flex flex-wrap items-center justify-between gap-5 rounded-xl border border-primary/15 bg-primary/5 p-6 sm:p-8">
          <span class="inline-flex items-center gap-3 text-lg font-semibold tracking-tight">
            <Icon name="bot" size={22} class="text-primary" />
            Gmod Integration
          </span>
          <ButtonLink href="/dashboard/guilds" variant="primary">
            {t('home.hero.button', 'Open the dashboard')}
            <Icon name="arrow-right" size={17} />
          </ButtonLink>
        </div>
      </section>
    </div>
  )
}

export default Home
