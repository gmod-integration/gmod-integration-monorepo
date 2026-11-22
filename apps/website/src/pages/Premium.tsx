import { capabilityLimit, hasCapability, type CapabilityKey } from '@gmod/schema/server/AccessPolicySchema.js'
import { BooleanStatus, Icon, StatusBadge } from '../components/ui/index.js'
import { type Component, createMemo, For, Show } from 'solid-js'
import { useI18n } from '../i18n.js'

const Premium: Component = () => {
  const { t, locale } = useI18n()
  const identity = (premium: boolean) => ({ premium, customBot: false, state: 'ready' as const })
  const included = (key: CapabilityKey, premium: boolean) => hasCapability(identity(premium), key)
  const limit = (key: CapabilityKey, premium: boolean, label: string) => {
    const count = capabilityLimit(identity(premium), key)
    return count === null ? t('premium.infinite', 'infinite') : t(label, '{1}', count)
  }

  const FeatureValue: Component<{ value: boolean | string }> = (props) => (
    <>
      {typeof props.value === 'boolean' ? (
        <BooleanStatus
          value={props.value}
          trueLabel={t('premium.included', 'Included')}
          falseLabel={t('premium.not_included', 'Not included')}
        />
      ) : props.value === t('premium.infinite', 'infinite') ? (
        <StatusBadge tone="info" icon="infinity">
          {props.value}
        </StatusBadge>
      ) : (
        props.value
      )}
    </>
  )

  type Feature = {
    name: string
    free_value: boolean | string
    premium_value: boolean | string
    inDev?: boolean
  }

  const features = createMemo<Record<string, Feature>>(() => ({
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
      ['name']: t('premium.team_vocal', 'Team voice channels'),
      ['free_value']: false,
      ['premium_value']: true,
      ['inDev']: true,
    },
    ['server_status_alert']: {
      ['name']: t('premium.server_status_alert', 'Server Status - Alert'),
      ['free_value']: t('premium.default_message', 'Default message'),
      ['premium_value']: t('premium.custom_message', 'Custom message'),
      ['inDev']: true,
    },
    ['guild_link']: {
      ['name']: t('premium.guild_link', 'Community links'),
      ['free_value']: limit('guild.links', false, 'access.count_links'),
      ['premium_value']: true,
    },
    ['logs_relay']: {
      ['name']: t('premium.logs_relay', 'Server Logs Relay'),
      ['free_value']: true,
      ['premium_value']: true,
    },
    ['logs']: {
      ['name']: t('premium.logs', 'Game logs in the dashboard'),
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
      ['name']: t('premium.guild_tickets', 'Community support tickets'),
      ['free_value']: true,
      ['premium_value']: true,
      ['inDev']: true,
    },
    ['guild_suggestions']: {
      ['name']: t('premium.guild_suggestions', 'Community suggestions'),
      ['free_value']: true,
      ['premium_value']: true,
      ['inDev']: true,
    },
    ['guild_verification']: {
      ['name']: t('premium.guild_verification', 'Discord and Steam verification'),
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
      ['name']: t('premium.guild_verification_role_limit', 'Verification role limit'),
      ['free_value']: limit('verification.roles', false, 'premium.guild_roles'),
      ['premium_value']: t('premium.infinite', 'infinite'),
    },
    ['force_ply_link']: {
      ['name']: t('premium.force_ply_link', 'Require linked player accounts'),
      ['free_value']: true,
      ['premium_value']: true,
    },
    ['maintenance_white_list']: {
      ['name']: t('premium.maintenance_white_list', 'Maintenance'),
      ['free_value']: true,
      ['premium_value']: true,
    },
    ['rcon']: {
      ['name']: t('premium.rcon', 'Game console commands (RCON)'),
      ['free_value']: included('console.rcon', false),
      ['premium_value']: included('console.rcon', true),
    },
    ['reward']: {
      ['name']: t('premium.reward', 'Reward'),
      ['free_value']: false,
      ['premium_value']: true,
      ['inDev']: true,
    },
  }))

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

  const offers = createMemo<Record<string, Offer>>(() => {
    const current: Record<string, Offer> = {
      ['free']: {
        ['name']: t('premium.free', 'Free'),
        ['sub_price']: t('premium.free_price', 'No subscription required'),
        ['description']: t(
          'premium.free_description',
          'Start with the free features and limits shown in the comparison below.',
        ),
        ['promote_features']: [
          t('premium.all_free_features', 'All Free Features'),
          t('premium.basic_support', 'Basic Support'),
        ],
        ['button']: t('premium.setup_server', 'Connect a game server'),
        ['link']: '/dashboard/guilds',
        ['price']: 0,
        ['permanent']: false,
      },
      ['subscribe']: {
        ['name']: t('premium.subscribe', 'Monthly subscription'),
        ['sub_price']: t('premium.subscribe_price', 'per Discord community · month'),
        ['description']: t(
          'premium.subscribe_description',
          'Activate Premium for one Discord community through Discord. Custom bots require the GmodStore offer.',
        ),
        ['promote_features']: [
          t('premium.all_premium_features', 'Premium features listed below'),
          t('premium.premium_discord_role', 'Premium Discord Role'),
          t('premium.priority_support', 'Priority Support'),
        ],
        ['button']: t('premium.subscribe_on_discord', 'Subscribe on Discord'),
        ['link']: 'https://discord.com/application-directory/1110121451501129758/premium',
        ['price']: 25.99,
        ['permanent']: false,
      },
      ['buy']: {
        ['name']: t('premium.one_time', 'One-time purchase'),
        ['sub_price']: t('premium.one_time_price', 'per Discord community · lifetime'),
        ['description']: t(
          'premium.one_time_description',
          'Activate Premium for one Discord community through GmodStore, with access to the custom bot feature.',
        ),
        ['promote_features']: [
          t('premium.all_premium_features', 'Premium features listed below'),
          t('premium.custom_bot', 'Custom Bot'),
          t('premium.premium_discord_role', 'Premium Discord Role'),
          t('premium.priority_support', 'Priority Support'),
          t('premium.lifetime_access', 'Lifetime Access'),
        ],
        ['button']: t('premium.buy_on_gmod_store', 'Buy on Gmod Store'),
        ['link']: 'https://www.gmodstore.com/market/view/gmod-integration',
        ['price']: 259.99,
        ['reduction']: {
          ['percent']: 15,
          ['date']: '2024-09-22T23:59:59',
        },
        ['permanent']: true,
      },
    }

    for (const offer of Object.values(current)) {
      if (offer.reduction && new Date(offer.reduction.date) < new Date()) delete offer.reduction
    }
    return current
  })

  type Category = {
    name: string
    features: Feature[]
  }

  const category = createMemo<Record<string, Category>>(() => ({
    ['server']: {
      ['name']: t('premium.server', 'Server'),
      ['features']: [
        features()['servers'],
        features()['server_status'],
        features()['server_status_buttons_limit'],
        features()['status_chart'],
        features()['server_status_alert'],
        features()['logs'],
        features()['errors_history'],
        features()['log_triggers'],
        features()['logs_relay'],
        features()['players'],
        features()['reward'],
      ],
    },
    ['utility']: {
      ['name']: t('premium.utility', 'Utility'),
      ['features']: [
        features()['guild_link'],
        features()['custom_bot'],
        features()['screenshots'],
        features()['guild_tickets'],
        features()['guild_suggestions'],
        features()['ig_report_bug'],
        features()['team_vocal'],
        features()['maintenance_white_list'],
        features()['rcon'],
      ],
    },
    ['data']: {
      ['name']: t('premium.data_statistics', 'Data & Statistics'),
      ['features']: [
        features()['user_profiles'],
        features()['user_stats'],
        features()['user_stats_custom_value'],
        features()['leaderboards'],
      ],
    },
    ['security']: {
      ['name']: t('premium.security', 'Security'),
      ['features']: [
        features()['guild_verification'],
        features()['guild_verification_role_limit'],
        features()['verification_preferences'],
        features()['auto_roles_limit'],
        features()['force_ply_link'],
        features()['sync_bans'],
        features()['sync_kicks'],
        features()['sync_warns'],
      ],
    },
    ['synchronization']: {
      ['name']: t('premium.synchronization', 'Synchronization'),
      ['features']: [
        features()['sync_chat'],
        features()['sync_chat_customisation'],
        features()['sync_player_name'],
        features()['sync_player_name_customisation'],
        features()['nickname_rules_limit'],
        features()['chat_filters'],
        features()['reverse_sync'],
        features()['sync_roles'],
        features()['sync_roles_limit'],
        features()['sync_team'],
      ],
    },
  }))

  const faq = createMemo<{ question: string; answer: string }[]>(() => [
    {
      question: t('premium.faq_question_1', 'What does Premium add?'),
      answer: t(
        'premium.faq_answer_1',
        'Premium increases limits and adds the customization options shown in the comparison above. Features marked as in development are not available yet. Custom bots require the GmodStore offer.',
      ),
    },
    {
      question: t('premium.faq_question_2', 'What is the difference between a community and a game server?'),
      answer: t(
        'premium.faq_answer_2',
        "A community is your Discord server. A game server is a Garry's Mod server connected to it. One Discord community can manage several game servers, within the limits of its offer.",
      ),
    },
    {
      question: t('premium.faq_question_3', 'What happens when Premium expires?'),
      answer: t(
        'premium.faq_answer_3',
        'Premium-only features become unavailable and free limits apply. Expiry does not erase your saved configuration. You can still disable or remove saved settings that require Premium.',
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
      question: t('premium.faq_question_5', 'Where do I activate Premium?'),
      answer: t(
        'premium.faq_answer_5',
        'Use the Discord offer for a monthly subscription. For a GmodStore purchase, link your Steam account, then use the dashboard to activate the purchase for a community you manage.',
      ),
    },
    {
      question: t('premium.faq_question_6', 'Does Premium cover all my communities?'),
      answer: t(
        'premium.faq_answer_6',
        "Premium applies to the Discord community for which it is activated. Check each community's offer in its dashboard. Manage the community linked to a GmodStore purchase from your account page.",
      ),
    },
    {
      question: t('premium.faq_question_7', 'Can I move a GmodStore purchase to another community?'),
      answer: t(
        'premium.faq_answer_7',
        'Unlink the current community from your account page, then activate the purchase for another community you manage. The previous community loses this purchase’s Premium benefits and its custom bot disconnects. Invite the main bot first to keep the integration available, and enter the custom bot token again after reactivation.',
      ),
    },
    {
      question: t('premium.faq_question_8', 'What does In development mean?'),
      answer: t(
        'premium.faq_answer_8',
        'These features are not available yet, including with Premium. Choose an offer based on the features currently available; no release date is promised here.',
      ),
    },
  ])

  return (
    <div class="public-page premium-page mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 py-8 sm:px-6 lg:gap-16 lg:px-8 lg:py-12">
      <header class="public-page-heading flex max-w-2xl flex-col gap-4">
        <span class="inline-flex w-fit items-center gap-2 rounded-lg border border-primary/15 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary">
          <Icon name="crown" size={15} />
          {t('premium.premium', 'Premium')}
        </span>
        <h1 class="text-3xl font-semibold tracking-tight sm:text-4xl">{t('premium.title', 'Premium')}</h1>
        <p class="text-sm leading-relaxed text-base-content/55 sm:text-base">
          {t(
            'premium.subtitle',
            'Compare the free and Premium features available for your Discord community and its game servers.',
          )}
        </p>
      </header>

      <div class="premium-offers grid grid-cols-1 gap-5 lg:grid-cols-3">
        <For each={Object.keys(offers())}>
          {(key) => (
            <a
              class={`premium-offer public-card group flex min-w-0 flex-col gap-6 rounded-xl border bg-base-100 p-6 transition-colors ${key === 'subscribe' ? 'border-primary/35' : 'border-base-content/10 hover:border-primary/30'}`}
              data-featured={key === 'subscribe' || undefined}
              href={offers()[key].link}
            >
              <div class="flex items-center gap-3">
                <span
                  class={`flex h-10 w-10 items-center justify-center rounded-xl ${key === 'free' ? 'bg-base-200/65 text-base-content/55' : 'bg-primary/10 text-primary'}`}
                >
                  <Icon name={key === 'free' ? 'server' : key === 'subscribe' ? 'crown' : 'gift'} size={19} />
                </span>
                <h2 class="text-base font-semibold tracking-tight">{offers()[key].name}</h2>
              </div>
              <div class="premium-offer-price flex flex-col gap-2">
                <p class="flex flex-wrap items-baseline gap-3 text-4xl font-semibold tracking-tight sm:text-5xl">
                  <Show when={offers()[key].reduction} fallback={<span>${offers()[key].price}</span>}>
                    <span>
                      $
                      {(
                        offers()[key].price -
                        (offers()[key].price * (offers()[key].reduction?.percent || 1)) / 100
                      ).toFixed(2)}
                    </span>
                    <span class="text-lg font-normal text-base-content/35 line-through">${offers()[key].price}</span>
                  </Show>
                </p>
                <p class="text-xs text-base-content/45">{offers()[key].sub_price}</p>
                <Show when={offers()[key].reduction}>
                  <span class="text-xs text-amber-400">
                    {t(
                      'premium.discount_until',
                      '{1}% off until {2}',
                      offers()[key].reduction?.percent ?? 0,
                      new Date(offers()[key].reduction?.date ?? '').toLocaleDateString(locale()),
                    )}
                  </span>
                </Show>
              </div>
              <p class="text-xs leading-relaxed text-base-content/55">{offers()[key].description}</p>
              <ul class="premium-offer-features flex flex-col gap-3 border-t border-base-content/8 pt-5 text-xs">
                <For each={offers()[key].promote_features}>
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
                {offers()[key].button}
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
        <p class="text-sm leading-relaxed text-base-content/65">
          {t(
            'premium.availability_note',
            'Features marked In development are not available yet. The custom bot feature is specific to the GmodStore offer.',
          )}
        </p>
        <div class="flex min-w-0 flex-col gap-5">
          <For each={Object.keys(category())}>
            {(key) => (
              <div class="public-card min-w-0 overflow-x-auto rounded-xl border border-base-content/10 bg-base-100">
                <table class="premium-comparison-table table w-full border-collapse">
                  <thead>
                    <tr>
                      <th class="w-[54%] text-left">{category()[key].name}</th>
                      <th class="w-[23%] text-center">{t('premium.free', 'Free')}</th>
                      <th class="w-[23%] text-center text-primary">{t('premium.premium', 'Premium')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={category()[key].features}>
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
                            <FeatureValue value={feature.free_value} />
                          </td>
                          <td class="text-center text-xs">
                            <FeatureValue value={feature.premium_value} />
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
          <For each={faq()}>
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
