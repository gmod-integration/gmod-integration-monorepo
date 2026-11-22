import { createSignal, For, Show } from 'solid-js'
import { AdminUserRowSchema, type AdminUserRow } from '@gmod/schema/admin/AdminDashboardSchema.js'
import AdminPanel from '../../../components/AdminPanel.js'
import AdminModal from '../../../components/AdminModal.js'
import ConfirmActionDialog from '../../../components/ConfirmActionDialog.js'
import Pagination from '../../../components/Pagination.js'
import {
  Button,
  ButtonLink,
  CopyableValue,
  FormActions,
  FormField,
  StatusBadge,
  TableState,
} from '../../../components/ui/index.js'
import { createDraftForm } from '../../../hooks/createDraftForm.js'
import { useI18n } from '../../../i18n.js'
import { authSession } from '../../../utils/authClient.js'
import { closeDialog, showDialog } from '../../../utils/dialog.js'
import { adminMutate, createAdminList } from './adminApi.js'
import AdminUserIdentity from './AdminUserIdentity.js'
import AdminListToolbar from './AdminListToolbar.js'

export default function UserList() {
  const { t, locale } = useI18n()
  const list = createAdminList<AdminUserRow>('/users', {}, AdminUserRowSchema)
  const [search, setSearch] = createSignal('')
  const [editing, setEditing] = createSignal<AdminUserRow>()
  const [revoking, setRevoking] = createSignal<AdminUserRow>()
  const [reason, setReason] = createSignal('')
  const [notice, setNotice] = createSignal('')
  const editor = createDraftForm({
    initial: { rank: 'user', reason: '' },
    validate: (draft) => ({
      ...(!['user', 'developer'].includes(draft.rank)
        ? { rank: t('admin_v6.rank_invalid', 'Choose User or Developer.') }
        : {}),
      ...(draft.reason.trim().length < 5 || draft.reason.trim().length > 500
        ? { reason: t('admin_v6.reason_invalid', 'Enter a reason between 5 and 500 characters.') }
        : {}),
    }),
    errorMessage: () => t('admin_v6.rank_save_error', 'Unable to update this role. Your changes are preserved.'),
  })
  const canManage = (user: AdminUserRow) => user.id !== authSession()?.user.id
  const date = (value: string | null) =>
    value ? new Date(value).toLocaleString(locale()) : t('admin_v6.never_seen', 'No recorded activity')
  const openEditor = (user: AdminUserRow) => {
    if (!canManage(user) || editor.pending()) return
    editor.reset({ rank: user.rank, reason: '' })
    setEditing(user)
    showDialog('admin-user-rank')
  }
  const discard = () => {
    if (editor.pending()) return
    editor.discard()
    setEditing(undefined)
  }
  const saveRank = async () => {
    const target = editing()
    if (!target || !canManage(target) || editor.draft().rank === target.rank) return
    if (
      await editor.save(async (draft) => {
        const acknowledgement = await adminMutate(`/users/${encodeURIComponent(target.id)}/rank`, 'PUT', {
          rank: draft.rank,
          reason: draft.reason.trim(),
        })
        if (
          !acknowledgement ||
          typeof acknowledgement !== 'object' ||
          Array.isArray(acknowledgement) ||
          !('rank' in acknowledgement) ||
          acknowledgement.rank !== draft.rank ||
          !('changed' in acknowledgement) ||
          typeof acknowledgement.changed !== 'boolean'
        )
          throw new Error('Invalid role acknowledgement')
      })
    ) {
      setNotice(t('admin_v6.rank_saved', 'Role updated for {1}.', target.username || target.id))
      closeDialog('admin-user-rank')
      discard()
      void list.refetch()
    }
  }
  const openRevoke = (user: AdminUserRow) => {
    if (!canManage(user)) return
    setRevoking(user)
    setReason('')
    showDialog('admin-user-revoke')
  }
  return (
    <>
      <AdminPanel
        title={t('admin_v6.users_title', 'User accounts')}
        description={t(
          'admin_v6.users_description',
          'Find Discord accounts, review linked Steam identities and manage platform access. Administrative actions require a reason.',
        )}
        icon="users"
        type="none"
        footer={
          <Show when={!list.results.loading && !list.results.error && list.results()}>
            <Pagination standalone query={list.query()} total={list.results()?.total ?? 0} onChange={list.paginate} />
          </Show>
        }
      >
        <Show when={notice()}>
          <p role="status" class="px-4 pt-4 text-sm text-success">
            {notice()}
          </p>
        </Show>
        <AdminListToolbar
          id="admin-users"
          search={search()}
          onSearchInput={setSearch}
          onSearch={() => list.change({ search: search().trim() })}
          sort={list.query().sort}
          onSort={(sort) => list.change({ sort })}
          sorts={[
            { value: 'createdAt', label: t('admin_v6.registered', 'Registered') },
            { value: 'username', label: t('admin_v6.name', 'Name') },
            { value: 'updatedAt', label: t('admin_v6.updated', 'Updated') },
          ]}
          orderBy={list.query().orderBy}
          onOrder={(orderBy) => list.change({ orderBy })}
          loading={list.results.loading}
          onRefresh={() => void list.refetch()}
        >
          <FormField id="admin-users-rank" label={t('admin_v6.role', 'Role')}>
            <select
              id="admin-users-rank"
              class="select"
              value={String(list.query().rank ?? '')}
              onChange={(event) => list.change({ rank: event.currentTarget.value })}
            >
              <option value="">{t('admin_v6.all_roles', 'All roles')}</option>
              <option value="user">{t('admin_v6.role_user', 'User')}</option>
              <option value="developer">{t('admin_v6.role_developer', 'Developer')}</option>
            </select>
          </FormField>
        </AdminListToolbar>
        <p class="px-4 pb-3 text-xs text-base-content/60">
          {t(
            'admin_v6.own_access_hint',
            'Another developer must change your role. Manage your own sessions from your account. Support access uses the selected user’s permissions.',
          )}
        </p>
        <div class="min-w-0 w-full overflow-x-auto">
          <table class="table admin-users-table">
            <thead>
              <tr>
                <th>{t('admin_v6.account', 'Account')}</th>
                <th>{t('admin_v6.steam_link', 'Steam link')}</th>
                <th>{t('admin_v6.role', 'Role')}</th>
                <th>{t('admin_v6.sessions', 'Active sessions')}</th>
                <th>{t('admin_v6.last_activity', 'Last activity')}</th>
                <th>{t('ui.actions', 'Actions')}</th>
              </tr>
            </thead>
            <tbody>
              <TableState
                colSpan={6}
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
                        <Show
                          when={user.steamID64}
                          fallback={<StatusBadge>{t('admin_v6.not_linked', 'Not linked')}</StatusBadge>}
                        >
                          <CopyableValue
                            value={user.steamID64!}
                            label={t('admin_v6.copy_steam_id', 'Copy SteamID64')}
                          />
                        </Show>
                      </td>
                      <td>
                        <StatusBadge tone={user.rank === 'developer' ? 'info' : 'neutral'}>
                          {user.rank === 'developer'
                            ? t('admin_v6.role_developer', 'Developer')
                            : user.rank === 'user'
                              ? t('admin_v6.role_user', 'User')
                              : user.rank}
                        </StatusBadge>
                      </td>
                      <td>{user.activeSessions.toLocaleString(locale())}</td>
                      <td>{date(user.lastSeenAt)}</td>
                      <td>
                        <div class="flex flex-wrap gap-2">
                          <Button size="sm" disabled={!canManage(user)} onClick={() => openEditor(user)}>
                            {t('admin_v6.edit_role', 'Edit role')}
                          </Button>
                          <Button
                            size="sm"
                            variant="warning"
                            disabled={!canManage(user) || user.activeSessions === 0}
                            onClick={() => openRevoke(user)}
                          >
                            {t('admin_v6.revoke_sessions', 'Revoke sessions')}
                          </Button>
                          <Show when={canManage(user)}>
                            <ButtonLink
                              size="sm"
                              href={`/dashboard/admins/impersonate?user=${encodeURIComponent(user.id)}`}
                            >
                              {t('admin_v6.support_access', 'Support access')}
                            </ButtonLink>
                          </Show>
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
      <AdminModal
        id="admin-user-rank"
        title={t('admin_v6.edit_role_for', 'Edit role for {1}', editing()?.username || editing()?.id || '')}
        description={t(
          'admin_v6.role_consequence',
          'Developer access grants platform-wide administration and support access. Save only after checking the target account.',
        )}
        busy={editor.pending()}
        onClose={discard}
        onCancel={discard}
        footer={
          <FormActions
            dirty={editor.dirty()}
            disabled={!editor.valid() || editor.draft().rank === editing()?.rank}
            pending={editor.pending()}
            error={editor.error()}
            onCancel={() => closeDialog('admin-user-rank')}
            onSave={saveRank}
          />
        }
      >
        <Show when={editing()}>{(user) => <AdminUserIdentity user={user()} />}</Show>
        <FormField id="admin-user-role" label={t('admin_v6.role', 'Role')} error={editor.errors().rank}>
          <select
            id="admin-user-role"
            class="select w-full"
            disabled={editor.pending()}
            value={editor.draft().rank}
            onChange={(event) => editor.patch({ rank: event.currentTarget.value })}
          >
            <Show when={!['user', 'developer'].includes(editor.draft().rank)}>
              <option value={editor.draft().rank} disabled>
                {editor.draft().rank}
              </option>
            </Show>
            <option value="user">{t('admin_v6.role_user', 'User')}</option>
            <option value="developer">{t('admin_v6.role_developer', 'Developer')}</option>
          </select>
        </FormField>
        <FormField
          id="admin-user-rank-reason"
          label={t('admin_v6.reason', 'Reason')}
          description={t('admin_v6.reason_help', 'Explain this administrative action in 5 to 500 characters.')}
          error={editor.errors().reason}
          required
        >
          <textarea
            id="admin-user-rank-reason"
            class="textarea w-full"
            rows={3}
            maxLength={500}
            disabled={editor.pending()}
            value={editor.draft().reason}
            aria-describedby="admin-user-rank-reason-description admin-user-rank-reason-error"
            onInput={(event) => editor.patch({ reason: event.currentTarget.value })}
          />
        </FormField>
      </AdminModal>
      <ConfirmActionDialog
        id="admin-user-revoke"
        title={t(
          'admin_v6.revoke_sessions_for',
          'Revoke sessions for {1}?',
          revoking()?.username || revoking()?.id || '',
        )}
        description={t(
          'admin_v6.revoke_sessions_consequence',
          'This signs the selected user out of active sessions, including delegated sessions. They can sign in again with Discord.',
        )}
        confirmLabel={t('admin_v6.revoke_sessions', 'Revoke sessions')}
        variant="warning"
        disabled={reason().trim().length < 5 || reason().trim().length > 500}
        onConfirm={async () => {
          const target = revoking()
          if (!target || !canManage(target)) throw new Error('Invalid target')
          const acknowledgement = await adminMutate(`/users/${encodeURIComponent(target.id)}/revoke-sessions`, 'POST', {
            confirm: target.id,
            reason: reason().trim(),
          })
          if (
            !acknowledgement ||
            typeof acknowledgement !== 'object' ||
            Array.isArray(acknowledgement) ||
            !('revoked' in acknowledgement) ||
            acknowledgement.revoked !== true
          )
            throw new Error('Invalid session revocation acknowledgement')
          setNotice(t('admin_v6.sessions_revoked', 'Sessions revoked for {1}.', target.username || target.id))
          void list.refetch()
        }}
      >
        {(pending) => (
          <FormField
            id="admin-user-revoke-reason"
            label={t('admin_v6.reason', 'Reason')}
            description={t('admin_v6.reason_help', 'Explain this administrative action in 5 to 500 characters.')}
            required
          >
            <textarea
              id="admin-user-revoke-reason"
              class="textarea w-full"
              rows={3}
              maxLength={500}
              aria-describedby="admin-user-revoke-reason-description"
              disabled={pending()}
              value={reason()}
              onInput={(event) => setReason(event.currentTarget.value)}
            />
          </FormField>
        )}
      </ConfirmActionDialog>
    </>
  )
}
