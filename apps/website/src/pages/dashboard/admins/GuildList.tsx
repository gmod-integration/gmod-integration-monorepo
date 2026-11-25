import { createResource, createSignal, For, Show } from 'solid-js'
import {
  AdminGuildDetailSchema,
  AdminGuildRowSchema,
  AdminPartnerMutationResultSchema,
  AdminPartnerUpdateSchema,
  type AdminGuildRow,
} from '@gmod/schema/admin/AdminDashboardSchema.js'
import AdminModal from '../../../components/AdminModal.js'
import AdminPanel from '../../../components/AdminPanel.js'
import ConfirmActionDialog from '../../../components/ConfirmActionDialog.js'
import Pagination from '../../../components/Pagination.js'
import {
  AsyncState,
  BooleanStatus,
  Button,
  ButtonLink,
  CopyableValue,
  DateTime,
  FormField,
  StatusBadge,
  TableState,
} from '../../../components/ui/index.js'
import { useI18n } from '../../../i18n.js'
import { closeDialog, showDialog } from '../../../utils/dialog.js'
import { formatDateTime } from '../../../utils/dateTime.js'
import { adminGet, adminMutate, createAdminList } from './adminApi.js'
import AdminListToolbar from './AdminListToolbar.js'

export default function GuildList() {
  const { t, locale } = useI18n()
  const list = createAdminList<AdminGuildRow>('/guilds', { sort: 'members', premium: 'all' }, AdminGuildRowSchema)
  const [search, setSearch] = createSignal('')
  const [selected, setSelected] = createSignal<AdminGuildRow>()
  const [partnerTarget, setPartnerTarget] = createSignal<AdminGuildRow>()
  const [partnerEnabled, setPartnerEnabled] = createSignal(false)
  const [partnerReason, setPartnerReason] = createSignal('')
  const [partnerPending, setPartnerPending] = createSignal(false)
  const [partnerSaved, setPartnerSaved] = createSignal(false)
  const [detail, { refetch: refetchDetail }] = createResource(
    () => selected()?.id,
    async (id) => AdminGuildDetailSchema.parse(await adminGet(`/guilds/${encodeURIComponent(id)}`)),
  )
  const page = () => (list.results.error ? undefined : list.results())
  const inspection = () => (detail.error ? undefined : detail())
  const inspect = (guild: AdminGuildRow) => {
    setSelected(guild)
    showDialog('admin-community-details')
  }
  const changePartner = (guild: AdminGuildRow) => {
    if (partnerPending()) return
    setPartnerTarget(guild)
    setPartnerEnabled(!guild.partner)
    setPartnerReason('')
    setPartnerSaved(false)
    showDialog('admin-community-partner')
  }
  return (
    <>
      <AdminPanel
        title={t('admin_v6.communities', 'Communities')}
        description={t(
          'admin_v6.communities_description',
          'Find registered Discord communities and inspect their current access sources.',
        )}
        icon="users"
        type="none"
        footer={
          <Show when={!list.results.loading && page()}>
            <Pagination standalone query={list.query()} total={page()?.total ?? 0} onChange={list.paginate} />
          </Show>
        }
      >
        <Show when={partnerSaved()}>
          <p role="status" class="px-4 pt-4 text-sm text-success">
            {t('admin_v6.partner_saved', 'Partner status was updated.')}
          </p>
        </Show>
        <AdminListToolbar
          id="admin-communities"
          search={search()}
          onSearchInput={setSearch}
          onSearch={() => list.change({ search: search().trim() })}
          sort={list.query().sort}
          onSort={(sort) => list.change({ sort })}
          sorts={[
            { value: 'members', label: t('admin_v6.members', 'Members') },
            { value: 'name', label: t('admin_v6.name', 'Name') },
            { value: 'createdAt', label: t('admin_v6.registered', 'Registered') },
          ]}
          orderBy={list.query().orderBy}
          onOrder={(orderBy) => list.change({ orderBy })}
          loading={list.results.loading}
          onRefresh={() => void list.refetch()}
        >
          <FormField id="admin-communities-premium" label={t('admin_v6.access_source', 'Access source')}>
            <select
              id="admin-communities-premium"
              class="select"
              value={String(list.query().premium)}
              onChange={(event) => list.change({ premium: event.currentTarget.value })}
            >
              <option value="all">{t('admin_v6.all_sources', 'All sources')}</option>
              <option value="manual">{t('admin_v6.manual_grant', 'Manual grant')}</option>
              <option value="gmodstore">GmodStore</option>
              <option value="none">{t('admin_v6.no_recorded_grant', 'No active recorded grant')}</option>
            </select>
          </FormField>
        </AdminListToolbar>
        <Show when={!list.results.loading && page()}>
          <p class="px-4 pb-3 text-sm text-base-content/65">
            {t('admin_v6.results', '{1} results', (page()?.total ?? 0).toLocaleString(locale()))}
          </p>
        </Show>
        <div class="min-w-0 w-full overflow-x-auto">
          <table class="table">
            <thead>
              <tr>
                <th>{t('admin_v6.community', 'Community')}</th>
                <th>{t('admin_v6.members', 'Members')}</th>
                <th>{t('admin_v6.game_servers', 'Game servers')}</th>
                <th>{t('admin_v6.access_sources', 'Premium access sources')}</th>
                <th>{t('admin_v6.partner', 'Partner')}</th>
                <th>{t('admin_v6.bot_language', 'Bot language')}</th>
                <th>{t('ui.actions', 'Actions')}</th>
              </tr>
            </thead>
            <tbody>
              <TableState
                colSpan={7}
                loading={list.results.loading}
                error={list.results.error}
                empty={!page()?.items.length}
                emptyLabel={t('admin_v6.communities_empty', 'No communities match these filters.')}
                errorLabel={t('admin_v6.communities_failed', 'The communities could not be loaded. Try again.')}
                onRetry={() => void list.refetch()}
              >
                <For each={page()?.items ?? []}>
                  {(guild) => (
                    <tr>
                      <td>
                        <div class="flex min-w-0 flex-col items-start gap-2">
                          <strong class="max-w-72 break-words">{guild.name || guild.id}</strong>
                          <CopyableValue
                            value={guild.id}
                            label={t('admin_v6.copy_community_id', 'Copy community ID')}
                          />
                        </div>
                      </td>
                      <td class="tabular-nums">{guild.members.toLocaleString(locale())}</td>
                      <td>
                        <ButtonLink
                          size="sm"
                          variant="ghost"
                          href={`/dashboard/admins/servers?guildID=${encodeURIComponent(guild.id)}`}
                        >
                          {guild.serverCount.toLocaleString(locale())}
                        </ButtonLink>
                      </td>
                      <td>
                        <div class="flex flex-wrap gap-2">
                          <Show when={guild.manualPremium}>
                            <StatusBadge tone="info">{t('admin_v6.manual_grant', 'Manual grant')}</StatusBadge>
                          </Show>
                          <Show when={guild.gmodstore}>
                            <StatusBadge tone="success">GmodStore</StatusBadge>
                          </Show>
                          <Show when={!guild.manualPremium && !guild.gmodstore}>
                            <StatusBadge>{t('admin_v6.no_recorded_grant', 'No active recorded grant')}</StatusBadge>
                          </Show>
                        </div>
                      </td>
                      <td>
                        <BooleanStatus
                          value={guild.partner}
                          trueLabel={t('admin_v6.partner', 'Partner')}
                          falseLabel={t('admin_v6.not_partner', 'Not a partner')}
                        />
                      </td>
                      <td>{guild.language.toUpperCase()}</td>
                      <td>
                        <div class="flex flex-wrap gap-2">
                          <Button size="sm" onClick={() => inspect(guild)}>
                            {t('admin_v6.inspect', 'Inspect')}
                          </Button>
                          <Button
                            size="sm"
                            variant={guild.partner ? 'warning' : 'primary'}
                            disabled={partnerPending()}
                            onClick={() => changePartner(guild)}
                          >
                            {guild.partner
                              ? t('admin_v6.partner_remove', 'Remove partner')
                              : t('admin_v6.partner_add', 'Add partner')}
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
        id="admin-community-partner"
        title={
          partnerEnabled()
            ? t(
                'admin_v6.partner_add_for',
                'Mark {1} as a partner?',
                partnerTarget()?.name || partnerTarget()?.id || '',
              )
            : t(
                'admin_v6.partner_remove_for',
                'Remove partner status from {1}?',
                partnerTarget()?.name || partnerTarget()?.id || '',
              )
        }
        description={t(
          'admin_v6.partner_consequence',
          'This changes the public Partner badge for this community’s listed servers. Premium access is unchanged.',
        )}
        variant={partnerEnabled() ? 'primary' : 'warning'}
        confirmLabel={
          partnerEnabled() ? t('admin_v6.partner_add', 'Add partner') : t('admin_v6.partner_remove', 'Remove partner')
        }
        disabled={partnerReason().trim().length < 5 || partnerReason().trim().length > 500}
        onConfirm={async () => {
          const guild = partnerTarget()
          if (!guild) throw new Error('Missing community')
          const command = AdminPartnerUpdateSchema.parse({ enabled: partnerEnabled(), reason: partnerReason() })
          setPartnerPending(true)
          try {
            const accepted = AdminPartnerMutationResultSchema.parse(
              await adminMutate(`/guilds/${encodeURIComponent(guild.id)}/partner`, 'PATCH', command),
            )
            if (accepted.guildID !== guild.id || accepted.partner !== command.enabled)
              throw new Error('Invalid partner acknowledgement')
            setPartnerSaved(true)
            void Promise.resolve()
              .then(() => list.refetch())
              .catch(() => undefined)
            if (selected()?.id === guild.id)
              void Promise.resolve()
                .then(() => refetchDetail())
                .catch(() => undefined)
          } finally {
            setPartnerPending(false)
          }
        }}
      >
        {(pending) => (
          <FormField
            id="admin-partner-reason"
            label={t('admin_v6.reason', 'Reason')}
            description={t('admin_v6.reason_help', 'Explain this administrative action in 5 to 500 characters.')}
            required
          >
            <textarea
              id="admin-partner-reason"
              class="textarea w-full"
              rows={3}
              maxLength={500}
              value={partnerReason()}
              disabled={pending()}
              aria-describedby="admin-partner-reason-description"
              onInput={(event) => setPartnerReason(event.currentTarget.value)}
            />
          </FormField>
        )}
      </ConfirmActionDialog>
      <AdminModal
        id="admin-community-details"
        title={t('admin_v6.community_details', 'Community details')}
        size="wide"
        onClose={() => setSelected(undefined)}
        footer={<Button onClick={() => closeDialog('admin-community-details')}>{t('ui.close', 'Close')}</Button>}
      >
        <AsyncState loading={detail.loading} error={detail.error} onRetry={() => void refetchDetail()}>
          <Show when={inspection()}>
            {(value) => (
              <div class="settings-card-grid">
                <AdminPanel title={value().guild.name || value().guild.id} icon="users">
                  <CopyableValue
                    value={value().guild.id}
                    label={t('admin_v6.copy_community_id', 'Copy community ID')}
                  />
                  <dl class="flex flex-col gap-3">
                    <div>
                      <dt class="text-sm text-base-content/65">{t('admin_v6.members', 'Members')}</dt>
                      <dd>{value().guild.members.toLocaleString(locale())}</dd>
                    </div>
                    <div>
                      <dt class="text-sm text-base-content/65">{t('admin_v6.partner', 'Partner')}</dt>
                      <dd>
                        <BooleanStatus
                          value={value().guild.partner}
                          trueLabel={t('admin_v6.partner', 'Partner')}
                          falseLabel={t('admin_v6.not_partner', 'Not a partner')}
                        />
                      </dd>
                    </div>
                    <div>
                      <dt class="text-sm text-base-content/65">{t('admin_v6.registered', 'Registered')}</dt>
                      <dd>
                        <DateTime value={value().guild.createdAt} />
                      </dd>
                    </div>
                    <div>
                      <dt class="text-sm text-base-content/65">{t('admin_v6.updated', 'Updated')}</dt>
                      <dd>
                        <DateTime value={value().guild.updatedAt} />
                      </dd>
                    </div>
                  </dl>
                  <ButtonLink href={`/dashboard/admins/servers?guildID=${encodeURIComponent(value().guild.id)}`}>
                    {t('admin_v6.view_community_servers', 'View this community’s servers')}
                  </ButtonLink>
                </AdminPanel>
                <AdminPanel
                  title={t('admin_v6.effective_access', 'Effective access')}
                  icon="shield-check"
                  description={t(
                    'admin_v6.effective_access_description',
                    'Resolved access can include several sources. An unavailable provider is shown as unknown.',
                  )}
                >
                  <Show when={value().access.state !== 'ready'}>
                    <StatusBadge tone="warning">
                      {t('admin_v6.access_unknown', 'Access verification unavailable')}
                    </StatusBadge>
                  </Show>
                  <div class="flex flex-wrap items-center justify-between gap-3">
                    <span class="ui-value-label">Premium</span>
                    <BooleanStatus value={value().access.state === 'ready' ? value().access.premium : undefined} />
                  </div>
                  <div class="flex flex-wrap items-center justify-between gap-3">
                    <span class="ui-value-label">{t('admin_v6.custom_bot', 'Custom bot access')}</span>
                    <BooleanStatus value={value().access.state === 'ready' ? value().access.customBot : undefined} />
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <For each={value().access.sources}>
                      {(source) => (
                        <StatusBadge tone="info">
                          {source === 'legacy'
                            ? t('admin_v6.manual_grant', 'Manual grant')
                            : source === 'gmodstore'
                              ? 'GmodStore'
                              : 'Discord'}
                        </StatusBadge>
                      )}
                    </For>
                  </div>
                  <p class="text-xs text-base-content/60">
                    {t(
                      'admin_v6.access_valid_until',
                      'Snapshot valid until {1}',
                      formatDateTime(value().access.validUntil, locale()),
                    )}
                  </p>
                </AdminPanel>
              </div>
            )}
          </Show>
        </AsyncState>
      </AdminModal>
    </>
  )
}
