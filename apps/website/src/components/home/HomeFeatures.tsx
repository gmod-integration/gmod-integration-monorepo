import { createSignal, For, Show } from 'solid-js'
import statusImage from '../../assets/features/servers_status.png'
import chatImage from '../../assets/features/chat.png'
import verificationImage from '../../assets/features/verification.png'
import playersImage from '../../assets/features/players.png'
import logsImage from '../../assets/features/logs.png'
import { useI18n } from '../../i18n.js'
import { Button, ButtonLink, Icon, type IconName } from '../ui/index.js'

const featureGroups = [
  { id: 'status', icon: 'activity', image: statusImage },
  { id: 'chat', icon: 'messages-square', image: chatImage },
  { id: 'accounts', icon: 'shield-check', image: verificationImage },
  { id: 'sync', icon: 'arrow-left-right' },
  { id: 'players', icon: 'chart-no-axes-combined', image: playersImage },
  { id: 'moderation', icon: 'shield' },
  { id: 'diagnostics', icon: 'scroll-text', image: logsImage },
  { id: 'community', icon: 'bot' },
] as const satisfies ReadonlyArray<{ id: string; icon: IconName; image?: string }>

type FeatureGroupID = (typeof featureGroups)[number]['id']

/** The public catalogue contains shipped capabilities, grouped by the task they help with. */
export function HomeFeatures() {
  const { t } = useI18n()
  const [active, setActive] = createSignal<FeatureGroupID | 'all'>('all')
  const selectedGroups = () => featureGroups.filter((group) => active() === 'all' || group.id === active())

  return (
    <section class="home-features" id="features" aria-labelledby="home-features-title">
      <div class="home-section-heading">
        <div>
          <p class="home-eyebrow">{t('home.catalog.eyebrow')}</p>
          <h2 id="home-features-title">{t('home.catalog.title')}</h2>
          <p>{t('home.catalog.description')}</p>
        </div>
        <ButtonLink href="/docs" variant="ghost" size="sm">
          {t('home.catalog.documentation')}
          <Icon name="arrow-up-right" size={16} />
        </ButtonLink>
      </div>

      <div class="home-feature-filters" role="group" aria-label={t('home.catalog.explore')}>
        <Button variant="ghost" size="sm" aria-pressed={active() === 'all'} onClick={() => setActive('all')}>
          {t('home.catalog.all')}
        </Button>
        <For each={featureGroups}>
          {(group) => (
            <Button variant="ghost" size="sm" aria-pressed={active() === group.id} onClick={() => setActive(group.id)}>
              <Icon name={group.icon} size={15} />
              {t(`home.catalog.groups.${group.id}.title`)}
            </Button>
          )}
        </For>
      </div>

      <div class="home-feature-catalogue" data-filtered={active() !== 'all'}>
        <For each={selectedGroups()}>
          {(group) => (
            <article class="home-feature-group" data-group={group.id}>
              <div class="home-feature-group-heading">
                <span class="home-feature-icon">
                  <Icon name={group.icon} size={21} />
                </span>
                <span class="home-feature-index" aria-hidden="true">
                  {String(featureGroups.indexOf(group) + 1).padStart(2, '0')}
                </span>
                <h3>{t(`home.catalog.groups.${group.id}.title`)}</h3>
              </div>
              <p>{t(`home.catalog.groups.${group.id}.intro`)}</p>
              <ul class="home-feature-points">
                <For each={['one', 'two', 'three', 'four']}>
                  {(point) => (
                    <li>
                      <Icon name="check" size={15} />
                      <span>{t(`home.catalog.groups.${group.id}.${point}`)}</span>
                    </li>
                  )}
                </For>
              </ul>
              <Show when={'image' in group && group.image}>
                {(image) => (
                  <figure class="home-feature-proof">
                    <img
                      src={image()}
                      alt={t(`home.catalog.groups.${group.id}.title`)}
                      loading="lazy"
                      decoding="async"
                    />
                  </figure>
                )}
              </Show>
            </article>
          )}
        </For>
      </div>

      <p class="home-feature-note">
        {t('home.catalog.availability')} <a href="/premium">{t('home.catalog.compare_plans')}</a>
      </p>
    </section>
  )
}
