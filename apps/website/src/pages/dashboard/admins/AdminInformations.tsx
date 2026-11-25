import { createResource, createSignal, For, Show } from 'solid-js'
import { AdminOverviewSchema, type AdminOverview } from '@gmod/schema/admin/AdminDashboardSchema.js'
import { AdminAnalyticsSchema, type AdminAnalyticsDays } from '@gmod/schema/admin/AdminAnalyticsSchema.js'
import AdminPanel from '../../../components/AdminPanel.js'
import { AsyncState, Button, ButtonLink, FormField } from '../../../components/ui/index.js'
import { useI18n } from '../../../i18n.js'
import { formatDateTime } from '../../../utils/dateTime.js'
import { adminGet } from './adminApi.js'
import AdminRegistrationsChart, { type RegistrationMetric } from './AdminRegistrationsChart.js'
import AdminDistributionChart from './AdminDistributionChart.js'

export default function AdminInformations() {
  const { t, locale } = useI18n()
  const [overview, { refetch }] = createResource(async () => AdminOverviewSchema.parse(await adminGet('/overview')))
  const [days, setDays] = createSignal<AdminAnalyticsDays>(30)
  const [selectedMetric, setSelectedMetric] = createSignal<RegistrationMetric>('all')
  const [analytics, { refetch: refreshAnalytics }] = createResource(days, async (window) => {
    const result = AdminAnalyticsSchema.parse(await adminGet('/analytics', { days: window }))
    if (result.days !== window) throw new Error('Unexpected analytics period')
    return result
  })
  const history = () => (analytics.error ? undefined : analytics())
  const data = () => (overview.error ? undefined : overview())
  const number = (value: number) => value.toLocaleString(locale())
  const metric = (value: AdminOverview) => [
    { label: t('admin_v6.communities', 'Communities'), value: value.totals.guilds, href: '/dashboard/admins/guilds' },
    {
      label: t('admin_v6.game_servers', 'Game servers'),
      value: value.totals.servers,
      href: '/dashboard/admins/servers',
    },
    {
      label: t('admin_v6.user_accounts', 'User accounts'),
      value: value.totals.discordUsers,
      href: '/dashboard/admins/users',
    },
    {
      label: t('admin_v6.active_sessions', 'Active sessions'),
      value: value.totals.activeSessions,
      href: '/dashboard/admins/users',
    },
  ]
  const languageName = (language: string) => {
    if (!language.trim()) return t('admin_v6.language_unspecified', 'Unspecified')
    try {
      return new Intl.DisplayNames([locale()], { type: 'language' }).of(language) || language
    } catch {
      return language
    }
  }
  return (
    <>
      <AdminPanel
        title={t('admin_v6.platform_overview', 'Platform overview')}
        description={t(
          'admin_v6.overview_description',
          'Current registered communities, game servers and accounts across Gmod Integration.',
        )}
        icon="layout-dashboard"
        actions={
          <Button
            loading={overview.loading || analytics.loading}
            onClick={() => {
              void refetch()
              void refreshAnalytics()
            }}
          >
            {t('admin_v6.refresh', 'Refresh')}
          </Button>
        }
      >
        <AsyncState loading={overview.loading} error={overview.error} onRetry={() => void refetch()}>
          <Show when={data()}>
            {(value) => (
              <>
                <div class="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <For each={metric(value())}>
                    {(item) => (
                      <div class="flex min-w-0 flex-col items-start gap-3 rounded-lg border border-base-200 p-4">
                        <h3 class="text-sm text-base-content/65">{item.label}</h3>
                        <p class="text-3xl font-semibold tabular-nums">{number(item.value)}</p>
                        <ButtonLink href={item.href} variant="ghost" size="sm">
                          {t('admin_v6.view_records', 'View records')}
                        </ButtonLink>
                      </div>
                    )}
                  </For>
                </div>
                <p class="text-xs text-base-content/60">
                  {t('admin_v6.generated_at', 'Updated {1}', formatDateTime(value().generatedAt, locale()))}
                </p>
              </>
            )}
          </Show>
        </AsyncState>
      </AdminPanel>
      <AdminPanel
        title={t('admin_v6.daily_registrations', 'Daily registrations')}
        description={t(
          'admin_v6.registrations_description',
          'Registration dates of communities, game servers and accounts still stored. UTC days; today is incomplete.',
        )}
        icon="chart-no-axes-combined"
        actions={
          <Button size="sm" loading={analytics.loading} onClick={() => void refreshAnalytics()}>
            {t('admin_v6.refresh_chart', 'Refresh chart')}
          </Button>
        }
      >
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField id="admin-analytics-window" label={t('admin_v6.analytics_window', 'Period')}>
            <select
              id="admin-analytics-window"
              class="select w-full"
              value={days()}
              onChange={(event) => {
                const value = Number(event.currentTarget.value)
                if (value === 7 || value === 30 || value === 90) setDays(value)
              }}
            >
              <option value="7">{t('admin_v6.last_7_days', 'Last 7 days')}</option>
              <option value="30">{t('admin_v6.last_30_days', 'Last 30 days')}</option>
              <option value="90">{t('admin_v6.last_90_days', 'Last 90 days')}</option>
            </select>
          </FormField>
          <FormField id="admin-analytics-metric" label={t('admin_v6.analytics_metric', 'Show')}>
            <select
              id="admin-analytics-metric"
              class="select w-full"
              value={selectedMetric()}
              onChange={(event) => {
                const value = event.currentTarget.value
                if (value === 'all' || value === 'communities' || value === 'servers' || value === 'accounts')
                  setSelectedMetric(value)
              }}
            >
              <option value="all">{t('admin_v6.all_registrations', 'All registrations')}</option>
              <option value="communities">{t('admin_v6.communities', 'Communities')}</option>
              <option value="servers">{t('admin_v6.game_servers', 'Game servers')}</option>
              <option value="accounts">{t('admin_v6.user_accounts', 'User accounts')}</option>
            </select>
          </FormField>
        </div>
        <AsyncState
          loading={analytics.loading}
          error={analytics.error}
          onRetry={() => void refreshAnalytics()}
          errorLabel={t('admin_v6.analytics_load_error', 'Unable to load registration history. Try again.')}
        >
          <Show when={history()}>
            {(value) => <AdminRegistrationsChart data={value()} metric={selectedMetric()} />}
          </Show>
        </AsyncState>
      </AdminPanel>
      <Show when={!overview.loading && data()}>
        {(value) => (
          <div class="settings-card-grid">
            <AdminPanel title={t('admin_v6.accounts_and_memberships', 'Accounts and memberships')} icon="users">
              <dl class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <dt class="text-sm text-base-content/65">
                    {t('admin_v6.linked_accounts', 'Accounts linked to Steam')}
                  </dt>
                  <dd class="mt-1 text-xl font-semibold tabular-nums">{number(value().totals.linkedUsers)}</dd>
                </div>
                <div>
                  <dt class="text-sm text-base-content/65">{t('admin_v6.steam_profiles', 'Stored Steam profiles')}</dt>
                  <dd class="mt-1 text-xl font-semibold tabular-nums">{number(value().totals.steamProfiles)}</dd>
                </div>
                <div>
                  <dt class="text-sm text-base-content/65">
                    {t('admin_v6.discord_memberships', 'Discord memberships')}
                  </dt>
                  <dd class="mt-1 text-xl font-semibold tabular-nums">{number(value().totals.discordMemberships)}</dd>
                </div>
              </dl>
              <p class="text-sm text-base-content/60">
                {t(
                  'admin_v6.membership_note',
                  'Memberships are counted per community. One person can belong to several communities; memberships are not unique accounts.',
                )}
              </p>
            </AdminPanel>
            <AdminPanel title={t('admin_v6.new_this_week', 'New in the last 7 days')} icon="activity">
              <dl class="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <dt class="text-sm text-base-content/65">{t('admin_v6.communities', 'Communities')}</dt>
                  <dd class="mt-1 text-xl font-semibold tabular-nums">{number(value().recent.guilds)}</dd>
                </div>
                <div>
                  <dt class="text-sm text-base-content/65">{t('admin_v6.game_servers', 'Game servers')}</dt>
                  <dd class="mt-1 text-xl font-semibold tabular-nums">{number(value().recent.servers)}</dd>
                </div>
                <div>
                  <dt class="text-sm text-base-content/65">{t('admin_v6.user_accounts', 'User accounts')}</dt>
                  <dd class="mt-1 text-xl font-semibold tabular-nums">{number(value().recent.users)}</dd>
                </div>
              </dl>
            </AdminPanel>
            <AdminPanel
              title={t('admin_v6.access_sources', 'Premium access sources')}
              icon="crown"
              actions={
                <ButtonLink href="/dashboard/admins/premium" size="sm">
                  {t('admin_v6.manage_premium', 'Manage Premium')}
                </ButtonLink>
              }
            >
              <AdminDistributionChart
                label={t('admin_v6.access_sources', 'Premium access sources')}
                items={[
                  { label: t('admin_v6.manual_premium', 'Manual Premium grants'), value: value().totals.manualPremium },
                  {
                    label: t('admin_v6.gmodstore_premium', 'GmodStore communities'),
                    value: value().totals.gmodstorePremium,
                  },
                ]}
                emptyLabel={t('admin_v6.no_recorded_premium_sources', 'No active recorded Premium grants.')}
              />
              <p class="text-sm text-base-content/60">
                {t(
                  'admin_v6.overlapping_access',
                  'A community can have more than one source of access. Inspect its details for the current effective entitlement.',
                )}
              </p>
            </AdminPanel>
            <AdminPanel title={t('admin_v6.communities_by_language', 'Communities by bot language')} icon="globe">
              <AdminDistributionChart
                label={t('admin_v6.communities_by_language', 'Communities by bot language')}
                items={value().languages.map((item) => ({ label: languageName(item.language), value: item.count }))}
                emptyLabel={t('admin_v6.no_languages', 'No language data is available yet.')}
              />
            </AdminPanel>
          </div>
        )}
      </Show>
    </>
  )
}
