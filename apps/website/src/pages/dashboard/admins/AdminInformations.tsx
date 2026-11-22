import { AsyncState, Button } from '../../../components/ui/index.js'
import { type Component, createResource, Show } from 'solid-js'
import PieChart from './pieChart'
import AdminChart from '../../../components/AdminChart'
import { fetchAPI } from '../../../utils/api'
import { useI18n } from '../../../i18n.js'

const AdminInformations: Component = () => {
  const { t, locale } = useI18n()
  const [adminData, { refetch }] = createResource('adminData', async () => {
    const res = await fetchAPI('/users/:discordID/admins/informations', 'GET')
    if (!res.ok) throw new Error('Service statistics request failed')
    return await res.json()
  })

  return (
    <>
      <p class="text-sm text-base-content/65">
        {t(
          'admin.overview_description',
          'Service-wide totals. Discord memberships are counted in each community, so the same person may appear more than once. Percentages use the combined membership and Steam profile total.',
        )}
      </p>
      <AsyncState
        loading={adminData.loading}
        error={adminData.error}
        errorLabel={t('admin.overview_load_error', 'Unable to load the service statistics. Try again.')}
        onRetry={() => void refetch()}
      >
        <Show when={!adminData.loading && !adminData.error && adminData()}>
          <Button class="border-base-200 hover:bg-base-100 hover:border-base-200" onClick={refetch}>
            {t('admin.refresh', 'Refresh statistics')}
          </Button>

          <h2 class="text-2xl font-semibold text-zinc-500">{t('admin.overview', 'Service overview')}</h2>
          <div class="stats shadow-sm border-base-200 border">
            <div class="stat">
              <div class="stat-title">{t('admin.communities', 'Discord communities')}</div>
              <div class="stat-value">{adminData().guild.total.toLocaleString(locale())}</div>
            </div>
            <div class="stat">
              <div class="stat-title">{t('admin.servers', 'Registered game servers')}</div>
              <div class="stat-value">{adminData().server.total.toLocaleString(locale())}</div>
            </div>
            <div class="stat">
              <div class="stat-title">{t('admin.combined_total', 'Memberships and Steam profiles')}</div>
              <div class="stat-value">{adminData().user.total.toLocaleString(locale())}</div>
            </div>
          </div>
          <h2 class="text-2xl font-semibold text-zinc-500">{t('admin.accounts', 'Accounts and memberships')}</h2>
          <div class="stats shadow-sm border-base-200 border">
            <div class="stat">
              <div class="stat-title">{t('admin.discord_memberships', 'Discord memberships')}</div>
              <div class="stat-value">
                {adminData().user.totalDiscordMembers.toLocaleString(locale())} -{' '}
                {Math.round((adminData().user.totalDiscordMembers / adminData().user.total) * 100)}%
              </div>
            </div>
            <div class="stat">
              <div class="stat-title">{t('admin.discord_accounts', 'Stored Discord accounts')}</div>
              <div class="stat-value">
                {adminData().user.totalDiscordUser.toLocaleString(locale())} -{' '}
                {Math.round((adminData().user.totalDiscordUser / adminData().user.total) * 100)}%
              </div>
            </div>
            <div class="stat">
              <div class="stat-title">{t('admin.linked_accounts', 'Discord accounts linked to Steam')}</div>
              <div class="stat-value">
                {adminData().user.totalVerified.toLocaleString(locale())} -{' '}
                {Math.round((adminData().user.totalVerified / adminData().user.total) * 100)}%
              </div>
            </div>
            <div class="stat">
              <div class="stat-title">{t('admin.unlinked_estimate', 'Estimated unlinked memberships')}</div>
              <div class="stat-value">
                {adminData().user.totalUnverified.toLocaleString(locale())} -{' '}
                {Math.round((adminData().user.totalUnverified / adminData().user.total) * 100)}%
              </div>
            </div>
            <div class="stat">
              <div class="stat-title">{t('admin.steam_profiles', 'Stored Steam profiles')}</div>
              <div class="stat-value">{adminData().user.totalSteamUser.toLocaleString(locale())}</div>
            </div>
          </div>
          <h2 class="text-2xl font-semibold text-zinc-500">{t('admin.charts', 'Charts')}</h2>
          <div class="flex flex-wrap gap-4">
            <AdminChart name={t('admin.communities_by_language', 'Communities by bot language')}>
              <PieChart data={adminData().guild.language} />
            </AdminChart>
          </div>
        </Show>
      </AsyncState>
    </>
  )
}

export default AdminInformations
