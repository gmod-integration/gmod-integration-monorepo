import { For, onMount, Show, createSignal } from 'solid-js'
import { useLocation, useNavigate } from '@solidjs/router'
import { AdminUserRowSchema, type AdminUserRow } from '@gmod/schema/admin/AdminDashboardSchema.js'
import AdminPanel from '../../../components/AdminPanel.js'
import ConfirmActionDialog from '../../../components/ConfirmActionDialog.js'
import Pagination from '../../../components/Pagination.js'
import { Button, DateTime, StatusBadge, TableState } from '../../../components/ui/index.js'
import { createAsyncAction } from '../../../hooks/createAsyncAction.js'
import { useI18n } from '../../../i18n.js'
import { authCommand, authSession } from '../../../utils/authClient.js'
import { showDialog } from '../../../utils/dialog.js'
import { createAdminList } from './adminApi.js'
import AdminUserIdentity from './AdminUserIdentity.js'
import AdminListToolbar from './AdminListToolbar.js'

function SupportDirectory() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const location = useLocation()
  const initialSearch = new URLSearchParams(location.search).get('user')?.slice(0, 100) ?? ''
  const list = createAdminList<AdminUserRow>('/users', { search: initialSearch }, AdminUserRowSchema)
  const [search, setSearch] = createSignal(initialSearch)
  const [target, setTarget] = createSignal<AdminUserRow>()
  const choose = (user: AdminUserRow) => {
    if (user.id === authSession()?.user.id) return
    setTarget(user)
    showDialog('admin-support-start')
  }
  return (
    <>
      <AdminPanel
        title={t('admin_v6.support_title', 'Support access')}
        description={t(
          'admin_v6.support_description',
          'Choose an account to use the dashboard with that user’s permissions for up to 15 minutes. Actions made during support affect their account.',
        )}
        icon="user-round-cog"
        type="none"
        footer={
          <Show when={!list.results.loading && !list.results.error && list.results()}>
            <Pagination standalone query={list.query()} total={list.results()?.total ?? 0} onChange={list.paginate} />
          </Show>
        }
      >
        <AdminListToolbar
          id="admin-support"
          search={search()}
          onSearchInput={setSearch}
          onSearch={() => list.change({ search: search().trim() })}
          sort={list.query().sort}
          onSort={(sort) => list.change({ sort })}
          sorts={[
            { value: 'createdAt', label: t('admin_v6.registered', 'Registered') },
            { value: 'username', label: t('admin_v6.name', 'Name') },
          ]}
          orderBy={list.query().orderBy}
          onOrder={(orderBy) => list.change({ orderBy })}
          loading={list.results.loading}
          onRefresh={() => void list.refetch()}
        />
        <div class="min-w-0 w-full overflow-x-auto">
          <table class="table">
            <thead>
              <tr>
                <th>{t('admin_v6.account', 'Account')}</th>
                <th>{t('admin_v6.last_activity', 'Last activity')}</th>
                <th>{t('ui.actions', 'Actions')}</th>
              </tr>
            </thead>
            <tbody>
              <TableState
                colSpan={3}
                loading={list.results.loading}
                error={list.results.error}
                empty={!list.results.loading && !list.results.error && list.results()?.items.length === 0}
                errorLabel={t('admin_v6.users_load_error', 'Unable to load user accounts. Try again.')}
                emptyLabel={t('admin_v6.users_empty', 'No accounts match these filters.')}
                onRetry={() => void list.refetch()}
              >
                <For each={!list.results.error ? list.results()?.items : []}>
                  {(user) => (
                    <tr>
                      <td>
                        <AdminUserIdentity user={user} />
                      </td>
                      <td>
                        {user.lastSeenAt ? (
                          <DateTime value={user.lastSeenAt} />
                        ) : (
                          t('admin_v6.never_seen', 'No recorded activity')
                        )}
                      </td>
                      <td>
                        <Show
                          when={user.id !== authSession()?.user.id}
                          fallback={<StatusBadge>{t('admin_v6.your_account', 'Your account')}</StatusBadge>}
                        >
                          <Button size="sm" onClick={() => choose(user)}>
                            {t('admin_v6.open_account', 'Access {1}', user.username || user.id)}
                          </Button>
                        </Show>
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
        id="admin-support-start"
        title={t(
          'admin_v6.access_account_confirmation',
          'Access {1} for support?',
          target()?.username || target()?.id || '',
        )}
        description={t(
          'admin_v6.support_consequence',
          'You will use this account’s permissions. Changes affect this user’s communities and servers. Use Return to your account when finished.',
        )}
        variant="warning"
        confirmLabel={t('admin_v6.begin_support', 'Begin support access')}
        onConfirm={async () => {
          const user = target()
          if (!user || user.id === authSession()?.user.id) throw new Error('Invalid support target')
          await authCommand('/impersonations', { discordID: user.id })
        }}
        onSuccess={() => navigate('/dashboard/guilds')}
      >
        <Show when={target()}>{(user) => <AdminUserIdentity user={user()} />}</Show>
      </ConfirmActionDialog>
    </>
  )
}

export default function Impersonate() {
  const { t } = useI18n()
  const location = useLocation()
  const navigate = useNavigate()
  const action = createAsyncAction({
    errorMessage: () =>
      t('admin_v6.return_error', 'Unable to return to your account. The current session is preserved; try again.'),
  })
  const returning = () => !!authSession()?.session.actorDiscordID || location.pathname.endsWith('/stop-impersonate')
  const end = async () => {
    if (await action.run(() => authCommand('/impersonations/end'))) navigate('/dashboard/admins/impersonate')
  }
  onMount(() => {
    if (location.pathname.endsWith('/stop-impersonate')) void end()
  })
  return (
    <Show when={returning()} fallback={<SupportDirectory />}>
      <AdminPanel
        title={t('admin_v6.return_title', 'Return to your account')}
        description={t(
          'admin_v6.return_description',
          'End support access to restore your administrator session. A failed request keeps the current session until you can retry.',
        )}
        icon="user-round-cog"
      >
        <Show when={action.error()}>
          <p role="alert" class="text-sm text-error">
            {action.error()}
          </p>
        </Show>
        <Button class="self-start" loading={action.pending()} onClick={() => void end()}>
          {t('auth.stop_impersonation', 'Return to your account')}
        </Button>
      </AdminPanel>
    </Show>
  )
}
