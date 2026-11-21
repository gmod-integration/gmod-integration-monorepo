import { capabilityLimit, hasCapability, type CapabilityKey } from '@gmod/schema/server/AccessPolicySchema.js'
import { Icon } from '../components/ui/index.js'
import { type Component, For, Show } from 'solid-js'
import { useI18n } from '../i18n.js'

const Premium: Component = () => {
  const { t } = useI18n()
  const identity = (premium: boolean) => ({ premium, customBot: false, state: 'ready' as const })
  const included = (key: CapabilityKey, premium: boolean) => hasCapability(identity(premium), key)
  const limit = (key: CapabilityKey, premium: boolean, label: string) => {
    const count = capabilityLimit(identity(premium), key)
    return count === null ? t('premium.infinite', 'infinite') : t(label, '{1}', count)
  }

  type Feature = {
    name: string
    free_value: boolean | string
    premium_value: boolean | string
    inDev?: boolean
  }

  const features: Record<string, Feature> = {
    ['sync_chat']: {
      ['name']: t('premium.sync_chat', 'Sync Chat'),
      ['free_value']: true,
      ['premium_value']: true,
    },
    ['sync_chat_customisation']: {
      ['name']: t('premium.sync_chat_customisation', 'Sync Chat - Customisation'),
      ['free_value']: included('chat.filters', false),
      ['premium_value']: included('chat.filters', true),
    },
    ['server_status']: {
      ['name']: t('premium.server_status', 'Server Status'),
      ['free_value']: true,
      ['premium_value']: true,
    },
    ['status_chart']: {
      name: t('access.status_chart', 'Status activity chart'),
      free_value: included('status.chart', false),
      premium_value: included('status.chart', true),
    },
    ['auto_roles_limit']: {
      name: t('access.auto_roles_limit', 'Automatic roles - Limit'),
      free_value: limit('guild.auto_roles', false, 'premium.guild_roles'),
      premium_value: limit('guild.auto_roles', true, 'premium.guild_roles'),
    },
    ['nickname_rules_limit']: {
      name: t('access.nickname_rules_limit', 'Nickname rules - Limit'),
      free_value: limit('sync.nicknames.rules', false, 'premium.guild_roles'),
      premium_value: limit('sync.nicknames.rules', true, 'premium.guild_roles'),
    },
    ['chat_filters']: {
      name: t('access.chat_filters', 'Chat filters'),
      free_value: included('chat.filters', false),
      premium_value: included('chat.filters', true),
    },
    ['log_triggers']: {
      name: t('access.log_triggers', 'Log event actions'),
      free_value: included('logs.triggers', false),
      premium_value: included('logs.triggers', true),
    },
    ['reverse_sync']: {
      name: t('access.reverse_sync', 'Discord to game synchronization'),
      free_value: included('sync.roles.reverse', false),
      premium_value: included('sync.roles.reverse', true),
    },
    ['errors_history']: {
      name: t('access.errors_history', 'Error history'),
      free_value: limit('errors.history', false, 'access.history_count'),
      premium_value: limit('errors.history', true, 'access.history_count'),
    },
    ['server_status_buttons_limit']: {
      ['name']: t('premium.server_status_buttons_limit', 'Server Status - Buttons Limit'),
      ['free_value']: limit('status.buttons', false, 'access.count_buttons'),
      ['premium_value']: limit('status.buttons', true, 'access.count_buttons'),
    },
    ['sync_player_name']: {
      ['name']: t('premium.sync_player_name', 'Sync Player Name'),
      ['free_value']: true,
      ['premium_value']: true,
    },
    ['sync_player_name_customisation']: {
      ['name']: t('premium.sync_player_name_customisation', 'Sync Player Name - Customisation'),
      ['free_value']: included('sync.nicknames.format', false),
      ['premium_value']: included('sync.nicknames.format', true),
    },
    ['player_stats']: {
      ['name']: t('premium.player_stats', 'Player Stats'),
      ['free_value']: true,
      ['premium_value']: true,
    },
    ['player_stats_custom']: {
      ['name']: t('premium.player_stats_custom', 'Player Stats - Custom Stats'),
      ['free_value']: false,
      ['premium_value']: true,
    },
    ['screenshots']: {
      ['name']: t('premium.screenshots', 'Player Screenshots'),
      ['free_value']: true,
      ['premium_value']: true,
    },
    ['ig_report_bug']: {
      ['name']: t('premium.ig_report_bug', 'In-Game Report Bug'),
      ['free_value']: true,
      ['premium_value']: true,
    },
    ['team_vocal']: {
      ['name']: t('premium.team_vocal', 'Team Vocal'),
      ['free_value']: false,
      ['premium_value']: true,
      ['inDev']: true,
    },
    ['server_status_alert']: {
      ['name']: t('premium.server_status_alert', 'Server Status - Alert'),
      ['free_value']: 'Default Message',
      ['premium_value']: 'Custom Message',
      ['inDev']: true,
    },
    ['guild_link']: {
      ['name']: t('premium.guild_link', 'Guild Links'),
      ['free_value']: limit('guild.links', false, 'access.count_links'),
      ['premium_value']: true,
    },
    ['logs_relay']: {
      ['name']: t('premium.logs_relay', 'Server Logs Relay'),
      ['free_value']: true,
      ['premium_value']: true,
    },
    ['logs']: {
      ['name']: t('premium.logs', 'WebPanel Logs'),
      ['free_value']: limit('logs.history', false, 'access.history_count'),
      ['premium_value']: t('premium.infinite', 'infinite'),
    },
    ['players']: {
      ['name']: t('premium.players', 'Players Database'),
      ['free_value']: true,
      ['premium_value']: true,
    },
    ['user_profiles']: {
      ['name']: t('premium.user_profiles', 'User Profiles'),
      ['free_value']: true,
      ['premium_value']: true,
    },
    ['user_stats']: {
      ['name']: t('premium.user_stats', 'Player Stats'),
      ['free_value']: true,
      ['premium_value']: true,
    },
    ['user_stats_custom_value']: {
      ['name']: t('premium.user_stats_custom_value', 'Player Stats - Custom Value'),
      ['free_value']: false,
      ['premium_value']: true,
    },
    ['leaderboards']: {
      ['name']: t('premium.leaderboards', 'Player Leaderboards'),
      ['free_value']: true,
      ['premium_value']: true,
    },
    ['servers']: {
      ['name']: t('premium.servers', 'Servers'),
      ['free_value']: limit('guild.servers', false, 'premium.guild_server'),
      ['premium_value']: t('premium.infinite', 'infinite'),
    },
    ['sync_bans']: {
      ['name']: t('premium.sync_bans', 'Sync Bans'),
      ['free_value']: true,
      ['premium_value']: true,
    },
    ['sync_roles']: {
      ['name']: t('premium.sync_roles', 'Sync Role'),
      ['free_value']: true,
      ['premium_value']: true,
    },
    ['sync_roles_limit']: {
      ['name']: t('premium.sync_roles_limit', 'Sync Role - Limit'),
      ['free_value']: limit('sync.roles.rules', false, 'premium.guild_roles'),
      ['premium_value']: t('premium.infinite', 'infinite'),
    },
    ['sync_kicks']: {
      ['name']: t('premium.sync_kicks', 'Sync Kicks'),
      ['free_value']: false,
      ['premium_value']: true,
      ['inDev']: true,
    },
    ['sync_warns']: {
      ['name']: t('premium.sync_warns', 'Sync Warns'),
      ['free_value']: true,
      ['premium_value']: true,
    },
    ['sync_team']: {
      ['name']: t('premium.sync_team', 'Sync Teams Roles'),
      ['free_value']: included('sync.teams', false),
      ['premium_value']: included('sync.teams', true),
    },
    ['guild_tickets']: {
      ['name']: t('premium.guild_tickets', 'Guild Tickets'),
      ['free_value']: true,
      ['premium_value']: true,
      ['inDev']: true,
    },
    ['guild_suggestions']: {
      ['name']: t('premium.guild_suggestions', 'Guild Suggestions'),
      ['free_value']: true,
      ['premium_value']: true,
      ['inDev']: true,
    },
    ['guild_verification']: {
      ['name']: t('premium.guild_verification', 'Guild Verification'),
      ['free_value']: included('verification.roles', false),
      ['premium_value']: included('verification.roles', true),
    },
    ['verification_preferences']: {
      name: t('access.verification_preferences', 'Verification preferences'),
      free_value: included('verification.preferences', false),
      premium_value: included('verification.preferences', true),
    },
    ['custom_bot']: {
      name: t('premium.custom_bot', 'Custom Bot'),
      free_value: false,
      premium_value: t('access.historical_bot', 'Requires a GmodStore purchase'),
    },
    ['guild_verification_role_limit']: {
      ['name']: t('premium.guild_verification_role_limit', 'Guild Verification - Role Limit'),
      ['free_value']: limit('verification.roles', false, 'premium.guild_roles'),
      ['premium_value']: t('premium.infinite', 'infinite'),
    },
    ['force_ply_link']: {
      ['name']: t('premium.force_ply_link', 'Force Player Link'),
      ['free_value']: true,
      ['premium_value']: true,
    },
    ['maintenance_white_list']: {
      ['name']: t('premium.maintenance_white_list', 'Maintenance'),
      ['free_value']: true,
      ['premium_value']: true,
    },
    ['rcon']: {
      ['name']: t('premium.rcon', 'RCON Execution'),
      ['free_value']: included('console.rcon', false),
      ['premium_value']: included('console.rcon', true),
    },
    ['reward']: {
      ['name']: t('premium.reward', 'Reward'),
      ['free_value']: false,
      ['premium_value']: true,
      ['inDev']: true,
    },
  }

  type Offer = {
    name: string
    sub_price: string
    description: string
    promote_features: string[]
    button: string
    link: string
    price: number
    reduction?: {
      percent: number
      date: string
    }
    permanent: boolean
  }

  const offers: Record<string, Offer> = {
    ['free']: {
      ['name']: t('premium.free', 'Free'),
      ['sub_price']: t('premium.free_price', 'free, nada, nothing, niente'),
      ['description']: t('premium.free_description', 'Get access to all the basic features'),
      ['promote_features']: [
        t('premium.all_free_features', 'All Free Features'),
        t('premium.basic_support', 'Basic Support'),
      ],
      ['button']: t('premium.setup_server', 'Setup Server'),
      ['link']: '/dashboard/guilds',
      ['price']: 0,
      ['permanent']: false,
    },
    ['subscribe']: {
      ['name']: t('premium.subscribe', 'Subscribe'),
      ['sub_price']: t('premium.subscribe_price', 'guilds / month'),
      ['description']: t('premium.subscribe_description', 'Get access to all features and customisation'),
      ['promote_features']: [
        t('premium.all_premium_features', 'All Premium Features'),
        t('premium.premium_discord_role', 'Premium Discord Role'),
        t('premium.priority_support', 'Priority Support'),
      ],
      ['button']: t('premium.subscribe_on_discord', 'Subscribe on Discord'),
      ['link']: 'https://discord.com/application-directory/1110121451501129758/premium',
      ['price']: 7.99,
      ['permanent']: false,
    },
    ['buy']: {
      ['name']: t('premium.one_time', 'One Time'),
      ['sub_price']: t('premium.one_time_price', 'guilds / lifetime'),
      ['description']: t('premium.one_time_description', 'Get access to all features and customisation'),
      ['promote_features']: [
        t('premium.all_premium_features', 'All Premium Features'),
        t('premium.custom_bot', 'Custom Bot'),
        t('premium.premium_discord_role', 'Premium Discord Role'),
        t('premium.priority_support', 'Priority Support'),
        t('premium.lifetime_access', 'Lifetime Access'),
      ],
      ['button']: t('premium.buy_on_gmod_store', 'Buy on Gmod Store'),
      ['link']: 'https://www.gmodstore.com/market/view/gmod-integration',
      ['price']: 69.99,
      ['reduction']: {
        ['percent']: 15,
        ['date']: '2024-09-22T23:59:59',
      },
      ['permanent']: true,
    },
  }

  for (const key in offers) {
    if (offers[key].reduction && new Date(offers[key].reduction.date) < new Date()) {
      delete offers[key].reduction
    }
  }

  type Category = {
    name: string
    features: Feature[]
  }

  const category: Record<string, Category> = {
    ['server']: {
      ['name']: t('premium.server', 'Server'),
      ['features']: [
        features['servers'],
        features['server_status'],
        features['server_status_buttons_limit'],
        features['status_chart'],
        features['server_status_alert'],
        features['logs'],
        features['errors_history'],
        features['log_triggers'],
        features['logs_relay'],
        features['players'],
        features['reward'],
      ],
    },
    ['utility']: {
      ['name']: t('premium.utility', 'Utility'),
      ['features']: [
        features['guild_link'],
        features['custom_bot'],
        features['screenshots'],
        features['guild_tickets'],
        features['guild_suggestions'],
        features['ig_report_bug'],
        features['team_vocal'],
        features['maintenance_white_list'],
        features['rcon'],
      ],
    },
    ['data']: {
      ['name']: t('premium.data_statistics', 'Data & Statistics'),
      ['features']: [
        features['user_profiles'],
        features['user_stats'],
        features['user_stats_custom_value'],
        features['leaderboards'],
      ],
    },
    ['security']: {
      ['name']: t('premium.security', 'Security'),
      ['features']: [
        features['guild_verification'],
        features['guild_verification_role_limit'],
        features['verification_preferences'],
        features['auto_roles_limit'],
        features['force_ply_link'],
        features['sync_bans'],
        features['sync_kicks'],
        features['sync_warns'],
      ],
    },
    ['synchronization']: {
      ['name']: t('premium.synchronization', 'Synchronization'),
      ['features']: [
        features['sync_chat'],
        features['sync_chat_customisation'],
        features['sync_player_name'],
        features['sync_player_name_customisation'],
        features['nickname_rules_limit'],
        features['chat_filters'],
        features['reverse_sync'],
        features['sync_roles'],
        features['sync_roles_limit'],
        features['sync_team'],
      ],
    },
  }

  const faq: { question: string; answer: string }[] = [
    {
      question: t('premium.faq_question_1', 'What are the differences between the free and the premium version ?'),
      answer: t(
        'premium.faq_answer_1',
        'Gmod Integration Premium offers more features and customisation and is a way to support the project. You can see the full list of features in the plans comparison table above.',
      ),
    },
    {
      question: t('premium.faq_question_2', 'What is a server and what is a guilds ?'),
      answer: t(
        'premium.faq_answer_2',
        "The terms server refers to a Garry's Mod server and guilds refers to a Discord guilds (aka discord server).",
      ),
    },
    {
      question: t(
        'premium.faq_question_3',
        "What will happen if I lose my premium subscription or if I don't renew it ?",
      ),
      answer: t(
        'premium.faq_answer_3',
        "You will lose access to the premium features and customisation. You won't lose your data but can't access it anymore.",
      ),
    },
    {
      question: t('premium.faq_question_4', 'Can I get a refund or cancel my subscription ?'),
      answer: t(
        'premium.faq_answer_4',
        'We do not process payments ourselves. We use Discord and GmodStore for payment processing. As such, we redirect you to their respective refund policies for any inquiries regarding refunds or cancellations.',
      ),
    },
    {
      question: t('premium.faq_question_5', 'Who can buy the premium version ?'),
      answer: t(
        'premium.faq_answer_5',
        'Anyone can buy the monthly version for your guilds directly on Discord. The lifetime version is only available on Gmod Store and can be bought only once per guilds and only by a guilds Administrator.',
      ),
    },
    {
      question: t('premium.faq_question_6', 'How many premium can I buy ?'),
      answer: t(
        'premium.faq_answer_6',
        'You can buy only one lifetime version, but you can buy multiple monthly versions for different guilds.',
      ),
    },
    {
      question: t('premium.faq_question_7', 'Can I transfer my premium version to another guilds ?'),
      answer: t(
        'premium.faq_answer_7',
        'Only the lifetime version is transferable to another guilds, you need to be Administrator of both guilds.',
      ),
    },
    {
      question: t('premium.faq_question_8', 'Why so many features are in development ?'),
      answer: t(
        'premium.faq_answer_8',
        "Because I'm a solo developer the project is pretty new and big, so I need time to develop all the features. But I'm working hard to make them available as soon as possible.",
      ),
    },
  ]

  return (
    <div class="public-page premium-page mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 py-8 sm:px-6 lg:gap-16 lg:px-8 lg:py-12">
      <header class="public-page-heading flex max-w-2xl flex-col gap-4">
        <span class="inline-flex w-fit items-center gap-2 rounded-lg border border-primary/15 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary">
          <Icon name="crown" size={15} />
          {t('premium.premium', 'Premium')}
        </span>
        <h1 class="text-3xl font-semibold tracking-tight sm:text-4xl">{t('premium.title', 'Premium')}</h1>
        <p class="text-sm leading-relaxed text-base-content/55 sm:text-base">
          {t('premium.subtitle', 'Upgrade your community to the next level with customisation and more features')}
        </p>
      </header>

      <div class="premium-offers grid grid-cols-1 gap-5 lg:grid-cols-3">
        <For each={Object.keys(offers)}>
          {(key) => (
            <a
              class={`premium-offer public-card group flex min-w-0 flex-col gap-6 rounded-xl border bg-base-100 p-6 transition-colors ${key === 'subscribe' ? 'border-primary/35' : 'border-base-content/10 hover:border-primary/30'}`}
              data-featured={key === 'subscribe' || undefined}
              href={offers[key].link}
            >
              <div class="flex items-center gap-3">
                <span
                  class={`flex h-10 w-10 items-center justify-center rounded-xl ${key === 'free' ? 'bg-base-200/65 text-base-content/55' : 'bg-primary/10 text-primary'}`}
                >
                  <Icon name={key === 'free' ? 'server' : key === 'subscribe' ? 'crown' : 'gift'} size={19} />
                </span>
                <h2 class="text-base font-semibold tracking-tight">{offers[key].name}</h2>
              </div>
              <div class="premium-offer-price flex flex-col gap-2">
                <p class="flex flex-wrap items-baseline gap-3 text-4xl font-semibold tracking-tight sm:text-5xl">
                  <Show when={offers[key].reduction} fallback={<span>${offers[key].price}</span>}>
                    <span>
                      $
                      {(
                        offers[key].price -
                        (offers[key].price * ((offers[key].reduction && offers[key].reduction.percent) || 1)) / 100
                      ).toFixed(2)}
                    </span>
                    <span class="text-lg font-normal text-base-content/35 line-through">${offers[key].price}</span>
                  </Show>
                </p>
                <p class="text-xs text-base-content/45">{offers[key].sub_price}</p>
                <Show when={offers[key].reduction}>
                  <span class="text-xs text-amber-400">
                    {(offers[key].reduction && offers[key].reduction.percent) || 0}% off until{' '}
                    {new Date((offers[key].reduction && offers[key].reduction.date) || new Date()).toLocaleDateString()}
                  </span>
                </Show>
              </div>
              <p class="text-xs leading-relaxed text-base-content/55">{offers[key].description}</p>
              <ul class="premium-offer-features flex flex-col gap-3 border-t border-base-content/8 pt-5 text-xs">
                <For each={offers[key].promote_features}>
                  {(feature) => (
                    <li class="flex items-start gap-2.5 leading-relaxed">
                      <Icon name="check" size={15} class="mt-0.5 text-primary" />
                      <span>{feature}</span>
                    </li>
                  )}
                </For>
              </ul>
              <span
                class={`premium-offer-action mt-auto inline-flex items-center justify-between gap-3 rounded-lg px-4 py-3 text-xs font-semibold ${key === 'subscribe' ? 'bg-primary text-primary-content' : 'bg-base-200/65 text-base-content group-hover:text-primary'}`}
              >
                {offers[key].button}
                <Icon name="arrow-right" size={15} />
              </span>
            </a>
          )}
        </For>
      </div>

      <section
        class="public-section premium-comparison flex min-w-0 flex-col gap-6"
        aria-labelledby="premium-comparison-title"
      >
        <div class="flex items-center gap-3">
          <span class="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/8 text-primary">
            <Icon name="list" size={17} />
          </span>
          <h2 id="premium-comparison-title" class="text-xl font-semibold tracking-tight">
            {t('premium.plans_comparison', 'Plans Comparison')}
          </h2>
        </div>
        <div class="flex min-w-0 flex-col gap-5">
          <For each={Object.keys(category)}>
            {(key) => (
              <div class="public-card min-w-0 overflow-x-auto rounded-xl border border-base-content/10 bg-base-100">
                <table class="premium-comparison-table table w-full border-collapse">
                  <thead>
                    <tr>
                      <th class="w-[54%] text-left">{category[key].name}</th>
                      <th class="w-[23%] text-center">{t('premium.free', 'Free')}</th>
                      <th class="w-[23%] text-center text-primary">{t('premium.premium', 'Premium')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={category[key].features}>
                      {(feature) => (
                        <tr>
                          <td class="wrap-break-word text-left text-xs">
                            <Show when={feature.inDev}>
                              <span
                                class="tooltip tooltip-warning z-10"
                                data-tip={t(
                                  'premium.in_dev_tooltip',
                                  'This feature is still in development and not available.',
                                )}
                              >
                                {feature.name}
                                <Icon name="triangle-alert" size={13} class="ml-1.5 text-warning" />
                              </span>
                            </Show>
                            <Show when={!feature.inDev}>{feature.name}</Show>
                          </td>
                          <td class="text-center text-xs">
                            {feature.free_value === true ? (
                              <Icon name="check" size={17} class="text-success" />
                            ) : feature.free_value === false ? (
                              <Icon name="x" size={17} class="text-error" />
                            ) : feature.free_value === t('premium.infinite', 'infinite') ? (
                              <Icon name="infinity" size={17} class="text-primary" />
                            ) : (
                              feature.free_value
                            )}
                          </td>
                          <td class="text-center text-xs">
                            {feature.premium_value === true ? (
                              <Icon name="check" size={17} class="text-success" />
                            ) : feature.premium_value === false ? (
                              <Icon name="x" size={17} class="text-error" />
                            ) : feature.premium_value === t('premium.infinite', 'infinite') ? (
                              <Icon name="infinity" size={17} class="text-primary" />
                            ) : (
                              feature.premium_value
                            )}
                          </td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            )}
          </For>
        </div>
      </section>

      <section class="public-section premium-faq flex flex-col gap-6" aria-labelledby="premium-faq-title">
        <div class="flex items-center gap-3">
          <span class="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/8 text-primary">
            <Icon name="message-circle" size={17} />
          </span>
          <h2 id="premium-faq-title" class="text-xl font-semibold tracking-tight">
            {t('premium.faq_title', 'Frequently Asked Questions')}
          </h2>
        </div>
        <div class="public-card overflow-hidden rounded-xl border border-base-content/10 bg-base-100">
          <For each={faq}>
            {({ question, answer }) => (
              <div class="collapse collapse-arrow border-b border-base-content/8 last:border-b-0">
                <input type="radio" name="my-accordion-4" aria-label={question} />
                <div class="collapse-title text-sm font-medium">{question}</div>
                <div class="collapse-content text-xs leading-relaxed text-base-content/55">
                  <p>{answer}</p>
                </div>
              </div>
            )}
          </For>
        </div>
      </section>
    </div>
  )
}

export default Premium
