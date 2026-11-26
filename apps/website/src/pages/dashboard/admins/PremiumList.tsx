import { createResource, createSignal, For, Show } from 'solid-js'
import {
  AdminGuildDetailSchema,
  AdminGuildRowSchema,
  AdminPremiumMutationResultSchema,
  type AdminGuildRow,
  type AdminPremiumMutationResult,
} from '@gmod/schema/admin/AdminDashboardSchema.js'
import AdminPanel from '../../../components/AdminPanel.js'
import AdminModal from '../../../components/AdminModal.js'
import ConfirmActionDialog from '../../../components/ConfirmActionDialog.js'
import Pagination from '../../../components/Pagination.js'
import {
  AsyncState,
  BooleanStatus,
  Button,
  CopyableValue,
  FormField,
  StatusBadge,
  TableState,
} from '../../../components/ui/index.js'
import { useI18n } from '../../../i18n.js'
import { showDialog } from '../../../utils/dialog.js'
import { formatDateTime } from '../../../utils/dateTime.js'
import { adminGet, adminMutate, createAdminList } from './adminApi.js'
import AdminListToolbar from './AdminListToolbar.js'

export default function PremiumList() {
  const { t, locale } = useI18n()
  const list = createAdminList<AdminGuildRow>('/premium', { premium: 'all' }, AdminGuildRowSchema)
  const [search, setSearch] = createSignal('')
  const [target, setTarget] = createSignal<AdminGuildRow>()
  const [enabled, setEnabled] = createSignal(false)
  const [reason, setReason] = createSignal('')
  const [result, setResult] = createSignal<AdminPremiumMutationResult>()
  const [details, setDetails] = createSignal<AdminGuildRow>()
  const [access, { refetch: refetchAccess }] = createResource(
    () => details()?.id,
    async (id) => AdminGuildDetailSchema.parse(await adminGet(`/guilds/${encodeURIComponent(id)}`)),
  )
  const openChange = (guild: AdminGuildRow) => {
    setTarget(guild)
    setEnabled(!guild.manualPremium)
    setReason('')
    showDialog('admin-premium-change')
  }
  const openDetails = (guild: AdminGuildRow) => {
    if (details()?.id === guild.id) void refetchAccess()
    setDetails(guild)
    showDialog('admin-premium-details')
  }
  return (
    <>
      <AdminPanel
        title={t('admin_v6.premium_title', 'Premium access')}
        description={t(
          'admin_v6.premium_description',
          'Manage local Premium grants and inspect effective access. Discord subscriptions and GmodStore purchases remain separate sources.',
        )}
        icon="crown"
        type="none"
        footer={
          <Show when={!list.results.loading && !list.results.error && list.results()}>
            <Pagination standalone query={list.query()} total={list.results()?.total ?? 0} onChange={list.paginate} />
          </Show>
        }
      >
        <Show when={result()}>
          {(saved) => (
            <p
              role="status"
              class={saved().pending ? 'px-4 pt-4 text-sm text-warning' : 'px-4 pt-4 text-sm text-success'}
            >
              {saved().pending
                ? t(
                    'admin_v6.premium_saved_pending',
                    'The local grant was saved. Effective access could not yet be confirmed; refresh its details to check again.',
                  )
                : t('admin_v6.premium_saved', 'The local grant was saved. Other verified Premium sources still apply.')}
            </p>
          )}
        </Show>
        <AdminListToolbar
          id="admin-premium"
          search={search()}
          onSearchInput={setSearch}
          onSearch={() => list.change({ search: search().trim() })}
          sort={list.query().sort}
          onSort={(sort) => list.change({ sort })}
          sorts={[
            { value: 'createdAt', label: t('admin_v6.registered', 'Registered') },
            { value: 'name', label: t('admin_v6.name', 'Name') },
            { value: 'members', label: t('admin_v6.members', 'Members') },
          ]}
          orderBy={list.query().orderBy}
          onOrder={(orderBy) => list.change({ orderBy })}
          loading={list.results.loading}
          onRefresh={() => void list.refetch()}
        >
          <FormField id="admin-premium-filter" label={t('admin_v6.recorded_access', 'Recorded access')}>
            <select
              id="admin-premium-filter"
              class="select"
              value={String(list.query().premium ?? 'all')}
              onChange={(event) => list.change({ premium: event.currentTarget.value })}
            >
              <option value="all">{t('admin_v6.all_communities', 'All communities')}</option>
              <option value="manual">{t('admin_v6.local_grant', 'Local grant')}</option>
              <option value="gmodstore">GmodStore</option>
              <option value="discord">{t('admin_v6.discord_subscription', 'Discord subscription')}</option>
              <option value="none">{t('admin_v6.no_recorded_grant', 'No active recorded grant')}</option>
            </select>
          </FormField>
        </AdminListToolbar>
        <p class="px-4 pb-3 text-xs text-base-content/60">
          {t(
            'admin_v6.premium_list_hint',
            'These filters include local grants, recorded GmodStore purchases and verified Discord subscriptions. Open access details to inspect the effective result.',
          )}
        </p>
        <div class="min-w-0 w-full overflow-x-auto">
          <table class="table">
            <thead>
              <tr>
                <th>{t('admin_v6.community', 'Community')}</th>
                <th>{t('admin_v6.local_grant', 'Local grant')}</th>
                <th>GmodStore</th>
                <th>{t('admin_v6.discord_subscription', 'Discord subscription')}</th>
                <th>{t('admin_v6.servers', 'Game servers')}</th>
                <th>{t('ui.actions', 'Actions')}</th>
              </tr>
            </thead>
            <tbody>
              <TableState
                colSpan={6}
                loading={list.results.loading}
                error={list.results.error}
                empty={!list.results.loading && !list.results.error && list.results()?.items.length === 0}
                errorLabel={t('admin_v6.premium_load_error', 'Unable to load Premium records. Try again.')}
                emptyLabel={t('admin_v6.premium_empty', 'No communities match these filters.')}
                onRetry={() => void list.refetch()}
              >
                <For each={!list.results.error ? list.results()?.items : []}>
                  {(guild) => (
                    <tr>
                      <td>
                        <div class="flex flex-col items-start gap-1">
                          <strong class="wrap-anywhere">{guild.name || guild.id}</strong>
                          <CopyableValue
                            value={guild.id}
                            label={t('admin_v6.copy_guild_id', 'Copy Discord server ID')}
                          />
                        </div>
                      </td>
                      <td>
                        <BooleanStatus
                          value={guild.manualPremium}
                          trueLabel={t('admin_v6.granted', 'Granted')}
                          falseLabel={t('admin_v6.not_granted', 'Not granted')}
                        />
                      </td>
                      <td>
                        <BooleanStatus
                          value={guild.gmodstore}
                          trueLabel={t('admin_v6.recorded', 'Recorded')}
                          falseLabel={t('admin_v6.not_recorded', 'Not recorded')}
                        />
                      </td>
                      <td>
                        <BooleanStatus
                          value={guild.discordPremium}
                          trueLabel={t('admin_v6.active_subscription', 'Active subscription')}
                          falseLabel={t('admin_v6.no_active_subscription', 'No active subscription')}
                        />
                      </td>
                      <td>{guild.serverCount.toLocaleString(locale())}</td>
                      <td>
                        <div class="flex flex-wrap gap-2">
                          <Button size="sm" onClick={() => openDetails(guild)}>
                            {t('admin_v6.access_details', 'Access details')}
                          </Button>
                          <Button
                            size="sm"
                            variant={guild.manualPremium ? 'warning' : 'primary'}
                            onClick={() => openChange(guild)}
                          >
                            {guild.manualPremium
                              ? t('admin_v6.remove_local_grant', 'Remove local grant')
                              : t('admin_v6.add_local_grant', 'Add local grant')}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )}
                </For>
              </TableState>
            </tbody>
          </table>
        </div>
      </AdminPanel>
      <ConfirmActionDialog
        id="admin-premium-change"
        title={
          enabled()
            ? t('admin_v6.grant_for', 'Grant local Premium to {1}?', target()?.name || target()?.id || '')
            : t('admin_v6.remove_grant_for', 'Remove the local grant for {1}?', target()?.name || target()?.id || '')
        }
        description={
          enabled()
            ? t(
                'admin_v6.grant_consequence',
                'This grants Premium until an administrator removes the local grant. It does not create a Discord subscription or a GmodStore purchase.',
              )
            : t(
                'admin_v6.remove_grant_consequence',
                'This removes only the local Premium grant. Valid Discord subscriptions or GmodStore purchases can keep Premium enabled.',
              )
        }
        variant={enabled() ? 'primary' : 'warning'}
        confirmLabel={
          enabled()
            ? t('admin_v6.add_local_grant', 'Add local grant')
            : t('admin_v6.remove_local_grant', 'Remove local grant')
        }
        disabled={reason().trim().length < 5 || reason().trim().length > 500}
        onConfirm={async () => {
          const guild = target()
          if (!guild) throw new Error('Missing community')
          const requested = enabled()
          const accepted = AdminPremiumMutationResultSchema.parse(
            await adminMutate(`/guilds/${encodeURIComponent(guild.id)}/premium`, 'PUT', {
              enabled: requested,
              reason: reason().trim(),
            }),
          )
          if (accepted.guildID !== guild.id || accepted.manualPremium !== requested)
            throw new Error('Invalid grant acknowledgement')
          setResult(accepted)
          void list.refetch()
          if (details()?.id === guild.id) void refetchAccess()
        }}
      >
        {(pending) => (
          <FormField
            id="admin-premium-reason"
            label={t('admin_v6.reason', 'Reason')}
            description={t('admin_v6.reason_help', 'Explain this administrative action in 5 to 500 characters.')}
            required
          >
            <textarea
              id="admin-premium-reason"
              class="textarea w-full"
              rows={3}
              maxLength={500}
              value={reason()}
              disabled={pending()}
              aria-describedby="admin-premium-reason-description"
              onInput={(event) => setReason(event.currentTarget.value)}
            />
          </FormField>
        )}
      </ConfirmActionDialog>
      <AdminModal
        id="admin-premium-details"
        title={t('admin_v6.access_for', 'Access for {1}', details()?.name || details()?.id || '')}
        description={t(
          'admin_v6.access_details_description',
          'Effective access is calculated from all verified sources. A provider outage remains unknown until verification succeeds.',
        )}
      >
        <AsyncState
          loading={access.loading}
          error={access.error}
          errorLabel={t('admin_v6.access_load_error', 'Unable to verify access. Try again.')}
          onRetry={() => void refetchAccess()}
        >
          <Show when={!access.loading && !access.error && access()}>
            {(data) => (
              <div class="flex flex-col gap-4">
                <Button class="self-start" loading={access.loading} onClick={() => void refetchAccess()}>
                  {t('admin_v6.refresh_access', 'Refresh access')}
                </Button>
                <CopyableValue value={data().guild.id} label={t('admin_v6.copy_guild_id', 'Copy Discord server ID')} />
                <div class="flex flex-wrap items-center gap-2">
                  <span class="ui-value-label">{t('admin_v6.effective_premium', 'Effective Premium')}:</span>
                  <BooleanStatus value={data().access.state === 'ready' ? data().access.premium : undefined} />
                </div>
                <div class="flex flex-wrap items-center gap-2">
                  <span class="ui-value-label">{t('admin_v6.discord_subscription', 'Discord subscription')}:</span>
                  <BooleanStatus
                    value={data().guild.discordPremium}
                    trueLabel={t('admin_v6.active_subscription', 'Active subscription')}
                    falseLabel={t('admin_v6.no_active_subscription', 'No active subscription')}
                  />
                </div>
                <Show when={data().access.state !== 'ready'}>
                  <p class="text-sm text-warning">
                    {t(
                      'admin_v6.access_unknown_preserved',
                      'Access could not be fully verified. The saved local grant is preserved.',
                    )}
                  </p>
                </Show>
                <div class="flex flex-wrap items-center gap-2">
                  <span class="ui-value-label">{t('admin_v6.verified_sources', 'Verified sources')}:</span>
                  <For
                    each={data().access.sources}
                    fallback={<StatusBadge>{t('admin_v6.no_verified_source', 'No verified source')}</StatusBadge>}
                  >
                    {(source) => (
                      <StatusBadge tone="info">
                        {source === 'legacy'
                          ? t('admin_v6.local_grant', 'Local grant')
                          : source === 'gmodstore'
                            ? 'GmodStore'
                            : 'Discord'}
                      </StatusBadge>
                    )}
                  </For>
                </div>
                <p class="px-4 pb-3 text-xs text-base-content/60">
                  {t(
                    'admin_v6.verified_until',
                    'Verification valid until {1}',
                    formatDateTime(data().access.validUntil, locale()),
                  )}
                </p>
              </div>
            )}
          </Show>
        </AsyncState>
      </AdminModal>
    </>
  )
}
