import { createResource, For, Show } from 'solid-js'
import { AdminOverviewSchema, type AdminOverview } from '@gmod/schema/admin/AdminDashboardSchema.js'
import AdminPanel from '../../../components/AdminPanel.js'
import { AsyncState, Button, ButtonLink } from '../../../components/ui/index.js'
import { useI18n } from '../../../i18n.js'
import { adminGet } from './adminApi.js'

export default function AdminInformations() {
  const { t, locale } = useI18n()
  const [overview, { refetch }] = createResource(async () => AdminOverviewSchema.parse(await adminGet('/overview')))
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
          <Button loading={overview.loading} onClick={() => void refetch()}>
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
                  {t('admin_v6.generated_at', 'Updated {1}', new Date(value().generatedAt).toLocaleString(locale()))}
                </p>
              </>
            )}
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
              <dl class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <dt class="text-sm text-base-content/65">{t('admin_v6.manual_premium', 'Manual Premium grants')}</dt>
                  <dd class="mt-1 text-xl font-semibold tabular-nums">{number(value().totals.manualPremium)}</dd>
                </div>
                <div>
                  <dt class="text-sm text-base-content/65">
                    {t('admin_v6.gmodstore_premium', 'GmodStore communities')}
                  </dt>
                  <dd class="mt-1 text-xl font-semibold tabular-nums">{number(value().totals.gmodstorePremium)}</dd>
                </div>
              </dl>
              <p class="text-sm text-base-content/60">
                {t(
                  'admin_v6.overlapping_access',
                  'A community can have more than one source of access. Inspect its details for the current effective entitlement.',
                )}
              </p>
            </AdminPanel>
            <AdminPanel title={t('admin_v6.communities_by_language', 'Communities by bot language')} icon="globe">
              <Show
                when={value().languages.length}
                fallback={
                  <p class="text-sm text-base-content/60">
                    {t('admin_v6.no_languages', 'No language data is available yet.')}
                  </p>
                }
              >
                <ul class="flex min-w-0 flex-col gap-4" role="list">
                  <For each={value().languages}>
                    {(item) => (
                      <li>
                        <div class="mb-2 flex items-center justify-between gap-3">
                          <span class="min-w-0 break-words">{languageName(item.language)}</span>
                          <strong class="tabular-nums">{number(item.count)}</strong>
                        </div>
                        <div class="h-2 overflow-hidden rounded-full bg-base-200" aria-hidden="true">
                          <div
                            class="h-full rounded-full bg-primary"
                            style={{
                              width: `${Math.min(100, (item.count / Math.max(1, value().totals.guilds)) * 100)}%`,
                            }}
                          />
                        </div>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </AdminPanel>
          </div>
        )}
      </Show>
    </>
  )
}
