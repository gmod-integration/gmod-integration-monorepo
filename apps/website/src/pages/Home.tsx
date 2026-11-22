import { createResource, createSignal, For, Show, type Component } from 'solid-js'
import statusImage from '../assets/features/servers_status.png'
import chatImage from '../assets/features/chat.png'
import verificationImage from '../assets/features/verification.png'
import wallpaper from '../assets/wallpaper.png'
import { useI18n } from '../i18n.js'
import { Button, ButtonLink, Icon } from '../components/ui/index.js'
import { HomeFeatures } from '../components/home/HomeFeatures.js'
import { API_FQDN } from '../utils/api.js'

type PublicStats = { guild: number | null; server: number | null; verifyUser: number | null }
type HeroVariant = 'panorama' | 'console' | 'editorial'
type StatsVariant = 'ribbon' | 'spotlight' | 'ledger'
type Appearance = { hero: HeroVariant; stats: StatsVariant }
const appearanceKey = 'gmod-home-appearance'
const heroVariants = ['panorama', 'console', 'editorial'] as const
const statsVariants = ['ribbon', 'spotlight', 'ledger'] as const

function readAppearance(): Appearance {
  const defaults: Appearance = { hero: 'panorama', stats: 'ribbon' }
  try {
    const saved = JSON.parse(localStorage.getItem(appearanceKey) ?? 'null')
    if (!saved || typeof saved !== 'object') return defaults
    return {
      hero: heroVariants.includes(saved.hero) ? saved.hero : defaults.hero,
      stats: statsVariants.includes(saved.stats) ? saved.stats : defaults.stats,
    }
  } catch {
    return defaults
  }
}
function rememberAppearance(appearance: Appearance) {
  try {
    localStorage.setItem(appearanceKey, JSON.stringify(appearance))
  } catch {
    /* Controls remain usable when browser storage is unavailable. */
  }
}
const fetchStats = async (): Promise<PublicStats> => {
  const response = await fetch(`${API_FQDN}/stats`)
  if (!response.ok) throw new Error('Statistics unavailable')
  const payload: unknown = await response.json()
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid statistics response')
  const data = payload as Record<string, unknown>
  const count = (key: keyof PublicStats): number | null => {
    const value = data[key]
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null
  }
  return { guild: count('guild'), server: count('server'), verifyUser: count('verifyUser') }
}

const Home: Component = () => {
  const { t, locale } = useI18n()
  const [stat, { refetch }] = createResource(fetchStats)
  const initialAppearance = readAppearance()
  const [heroVariant, setHeroVariant] = createSignal<HeroVariant>(initialAppearance.hero)
  const [statsVariant, setStatsVariant] = createSignal<StatsVariant>(initialAppearance.stats)
  const [previewID, setPreviewID] = createSignal('status')
  const chooseHero = (hero: HeroVariant) => {
    setHeroVariant(hero)
    rememberAppearance({ hero, stats: statsVariant() })
  }
  const chooseStats = (stats: StatsVariant) => {
    setStatsVariant(stats)
    rememberAppearance({ hero: heroVariant(), stats })
  }
  const previews = () => [
    { id: 'status', label: t('home.features.server_status.title', 'Server Status'), image: statusImage },
    { id: 'chat', label: t('home.features.chat_bridge.title', 'Chat Bridge'), image: chatImage },
    {
      id: 'verification',
      label: t('home.features.user_verification.title', 'Discord and Steam verification'),
      image: verificationImage,
    },
  ]
  const selectedPreview = () => previews().find((preview) => preview.id === previewID()) ?? previews()[0]!
  const metrics = () => [
    {
      key: 'guild' as const,
      icon: 'users' as const,
      label: t('home.presentation.metric_guild', 'Discord communities'),
      detail: t('home.presentation.metric_guild_detail', 'Registered communities'),
    },
    {
      key: 'server' as const,
      icon: 'server' as const,
      label: t('home.presentation.metric_server', 'Game servers'),
      detail: t('home.presentation.metric_server_detail', 'Registered servers'),
    },
    {
      key: 'verifyUser' as const,
      icon: 'shield-check' as const,
      label: t('home.presentation.metric_verified', 'Linked accounts'),
      detail: t('home.presentation.metric_verified_detail', 'Steam connected to Discord'),
    },
  ]
  const value = (key: keyof PublicStats) => {
    if (stat.loading || stat.error) return '—'
    return stat()?.[key]?.toLocaleString(locale()) ?? '—'
  }

  return (
    <div class="public-home home-redesign" data-hero={heroVariant()} data-stats={statsVariant()}>
      <div class="home-scene" aria-hidden="true">
        <img src={wallpaper} alt="" decoding="async" fetchpriority="high" />
      </div>
      <div class="home-design-bar">
        <span class="home-design-label">
          <Icon name="sliders-horizontal" size={15} />
          {t('home.presentation.style_label', 'Appearance')}
        </span>
        <fieldset class="home-design-group">
          <legend>{t('home.presentation.hero_label', 'Hero')}</legend>
          <div class="home-switch">
            <For each={heroVariants}>
              {(variant) => (
                <Button
                  size="sm"
                  variant="ghost"
                  aria-pressed={heroVariant() === variant}
                  onClick={() => chooseHero(variant)}
                >
                  {t(`home.presentation.${variant}`)}
                </Button>
              )}
            </For>
          </div>
        </fieldset>
        <fieldset class="home-design-group">
          <legend>{t('home.presentation.stats_label', 'Statistics')}</legend>
          <div class="home-switch">
            <For each={statsVariants}>
              {(variant) => (
                <Button
                  size="sm"
                  variant="ghost"
                  aria-pressed={statsVariant() === variant}
                  onClick={() => chooseStats(variant)}
                >
                  {t(`home.presentation.${variant}`)}
                </Button>
              )}
            </For>
          </div>
        </fieldset>
      </div>
      <section class="home-hero" data-variant={heroVariant()} aria-label="Gmod Integration">
        <div class="home-hero-copy">
          <p class="home-hero-eyebrow">
            <Icon name="gamepad-2" size={19} />
            <span>Gmod Integration</span>
            <span aria-hidden="true">/</span>
            <span>Garry’s Mod × Discord</span>
          </p>
          <h1 id="home-title" class="home-hero-title">
            <span>{t('home.presentation.headline_first', 'Your server.')}</span>
            <span>{t('home.presentation.headline_second', 'Your community.')}</span>
            <span class="home-hero-title-accent">{t('home.presentation.headline_accent', 'Connected.')}</span>
          </h1>
          <p class="home-hero-description">
            {t(
              'home.hero.title',
              "Connect your Garry's Mod server to Discord: share chat, show server activity and link player accounts.",
            )}
          </p>
          <div class="home-hero-actions public-hero-actions">
            <ButtonLink href="/dashboard/guilds" variant="primary">
              {t('home.hero.button', 'Open the dashboard')}
              <Icon name="arrow-right" size={17} />
            </ButtonLink>
            <ButtonLink href="/docs" variant="secondary">
              <Icon name="book-open" size={17} />
              {t('main.documentation', 'Documentation')}
            </ButtonLink>
          </div>
          <a class="home-discover" href="#features">
            <Icon name="arrow-down" size={16} />
            {t('home.presentation.discover', 'Explore the features')}
          </a>
        </div>
        <div class="home-hero-stage">
          <Show
            when={heroVariant() === 'console'}
            fallback={
              <figure class="home-product-shot">
                <figcaption class="home-preview-heading">
                  <Icon name="messages-square" size={17} />
                  {t('home.presentation.preview_label', 'A glimpse of your Discord')}
                </figcaption>
                <img src={statusImage} alt="" class="home-status-image" decoding="async" />
                <p class="home-preview-caption">
                  {t('home.presentation.preview_caption', 'Example of the integration in your community.')}
                </p>
              </figure>
            }
          >
            <figure class="home-console">
              <figcaption class="home-preview-heading">
                <Icon name="layout-dashboard" size={17} />
                {t('home.presentation.preview_label', 'A glimpse of your Discord')}
              </figcaption>
              <div
                class="home-preview-tabs"
                role="group"
                aria-label={t('home.presentation.preview_label', 'A glimpse of your Discord')}
              >
                <For each={previews()}>
                  {(preview) => (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-pressed={previewID() === preview.id}
                      onClick={() => setPreviewID(preview.id)}
                    >
                      {preview.label}
                    </Button>
                  )}
                </For>
              </div>
              <div class="home-preview-image">
                <img src={selectedPreview().image} alt={selectedPreview().label} decoding="async" />
              </div>
              <p class="home-preview-caption">
                {t('home.presentation.preview_caption', 'Example of the integration in your community.')}
              </p>
            </figure>
          </Show>
        </div>
      </section>
      <section
        class="home-community"
        aria-label={t('ui.community_statistics', 'Community statistics')}
        aria-busy={stat.loading}
      >
        <div class="home-stats-intro">
          <p class="home-kicker">{t('home.presentation.community_kicker', 'Across the community')}</p>
          <h2>{t('home.presentation.community_title', 'Connected, in numbers.')}</h2>
          <p>{t('home.presentation.community_note', 'Totals recorded on Gmod Integration.')}</p>
        </div>
        <dl class="home-metrics">
          <For each={metrics()}>
            {(metric) => (
              <div class="home-metric">
                <dt>
                  <Icon name={metric.icon} size={17} />
                  {metric.label}
                </dt>
                <dd>
                  <span>{value(metric.key)}</span>
                  <small class="home-metric-detail">{metric.detail}</small>
                </dd>
              </div>
            )}
          </For>
        </dl>
        <Show when={stat.error}>
          <div role="status" class="home-stat-error">
            {t('ui.statistics_unavailable', 'Community statistics are temporarily unavailable.')}
            <Button size="sm" variant="ghost" onClick={() => refetch()}>
              {t('ui.retry', 'Try again')}
            </Button>
          </div>
        </Show>
      </section>
      <HomeFeatures />
      <section class="home-closing">
        <div>
          <p class="home-kicker">{t('home.presentation.closing_kicker', 'From your server to your Discord')}</p>
          <h2>{t('home.presentation.closing_title', 'Bring your community together.')}</h2>
          <p>
            {t(
              'home.presentation.closing_description',
              'Follow the setup guide, connect your server and choose the features that work for your community.',
            )}
          </p>
        </div>
        <ButtonLink href="/dashboard/guilds" variant="primary">
          {t('home.hero.button', 'Open the dashboard')}
          <Icon name="arrow-right" size={17} />
        </ButtonLink>
      </section>
    </div>
  )
}
export default Home
