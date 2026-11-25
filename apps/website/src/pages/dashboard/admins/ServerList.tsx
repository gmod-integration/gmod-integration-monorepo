import { createEffect, createSignal, For, on, Show } from 'solid-js'
import { useLocation } from '@solidjs/router'
import { AdminServerRowSchema, type AdminServerRow } from '@gmod/schema/admin/AdminDashboardSchema.js'
import AdminModal from '../../../components/AdminModal.js'
import AdminPanel from '../../../components/AdminPanel.js'
import ConfirmActionDialog from '../../../components/ConfirmActionDialog.js'
import Pagination from '../../../components/Pagination.js'
import {
  BooleanStatus,
  Button,
  ButtonLink,
  CopyableValue,
  DateTime,
  FormActions,
  FormField,
  SettingRow,
  StatusBadge,
  TableState,
} from '../../../components/ui/index.js'
import { createDraftForm } from '../../../hooks/createDraftForm.js'
import { useI18n } from '../../../i18n.js'
import { closeDialog, showDialog } from '../../../utils/dialog.js'
import { adminMutate, createAdminList } from './adminApi.js'
import AdminListToolbar from './AdminListToolbar.js'

type ServerDraft = { name: string; verified: boolean; isPublic: boolean; reason: string }
const emptyDraft = (): ServerDraft => ({ name: '', verified: false, isPublic: false, reason: '' })

export default function ServerList() {
  const { t, locale } = useI18n()
  const location = useLocation()
  const initialGuild = new URLSearchParams(location.search).get('guildID') || ''
  const list = createAdminList<AdminServerRow>(
    '/servers',
    { guildID: initialGuild || undefined, verified: 'all', visibility: 'all' },
    AdminServerRowSchema,
  )
  const [search, setSearch] = createSignal('')
  const [guildFilter, setGuildFilter] = createSignal(initialGuild)
  createEffect(
    on(
      () => location.search,
      (search) => {
        const guildID = new URLSearchParams(search).get('guildID') || ''
        setGuildFilter(guildID)
        list.change({ guildID: guildID || undefined })
      },
      { defer: true },
    ),
  )
  const [editing, setEditing] = createSignal<AdminServerRow>()
  const [command, setCommand] = createSignal<{ kind: 'delete' | 'reset-token'; server: AdminServerRow }>()
  const [confirmation, setConfirmation] = createSignal('')
  const [reason, setReason] = createSignal('')
  const [notice, setNotice] = createSignal('')
  const reasonValid = (value: string) => value.trim().length >= 5 && value.trim().length <= 500
  const form = createDraftForm<ServerDraft>({
    initial: emptyDraft(),
    validate: (draft) => ({
      name:
        draft.name.trim().length > 0 && draft.name.trim().length <= 255
          ? undefined
          : t('admin_v6.server_name_required', 'Enter a server name of 1 to 255 characters.'),
      reason: reasonValid(draft.reason)
        ? undefined
        : t('admin_v6.reason_required', 'Enter a reason of 5 to 500 characters.'),
    }),
    errorMessage: () =>
      t('admin_v6.server_save_failed', 'The server could not be updated. Your changes are preserved.'),
  })
  const page = () => (list.results.error ? undefined : list.results())
  const hasChanges = () => {
    const original = editing()
    const draft = form.draft()
    return (
      !!original &&
      (draft.name.trim() !== original.name ||
        draft.verified !== original.verified ||
        draft.isPublic !== original.isPublic)
    )
  }
  const clearEdit = () => {
    form.reset(emptyDraft())
    setEditing(undefined)
  }
  const openEdit = (server: AdminServerRow) => {
    form.reset({ name: server.name, verified: server.verified, isPublic: server.isPublic, reason: '' })
    setEditing(server)
    showDialog('admin-server-edit')
  }
  async function saveServer() {
    const original = editing()
    if (!original || !hasChanges()) return
    const saved = await form.save(async (draft) => {
      const accepted = AdminServerRowSchema.parse(
        await adminMutate(`/servers/${encodeURIComponent(original.id)}`, 'PATCH', {
          ...(draft.name.trim() !== original.name ? { name: draft.name.trim() } : {}),
          ...(draft.verified !== original.verified ? { verified: draft.verified } : {}),
          ...(draft.isPublic !== original.isPublic ? { isPublic: draft.isPublic } : {}),
          reason: draft.reason.trim(),
        }),
      )
      if (accepted.id !== original.id || accepted.guildID !== original.guildID)
        throw new Error('Unexpected server acknowledgement')
      return { name: accepted.name, verified: accepted.verified, isPublic: accepted.isPublic, reason: draft.reason }
    })
    if (saved) {
      closeDialog('admin-server-edit')
      clearEdit()
      setNotice(t('admin_v6.server_saved', 'Server changes saved.'))
      void list.refetch()
    }
  }
  const openCommand = (kind: 'delete' | 'reset-token', server: AdminServerRow) => {
    setCommand({ kind, server })
    setConfirmation('')
    setReason('')
    showDialog('admin-server-command')
  }
  return (
    <>
      <AdminPanel
        title={t('admin_v6.game_servers', 'Game servers')}
        description={t(
          'admin_v6.servers_description',
          'Inspect registered game servers, manage their platform flags and handle support actions with an audit reason.',
        )}
        icon="server"
        type="none"
        footer={
          <Show when={!list.results.loading && page()}>
            <Pagination standalone query={list.query()} total={page()?.total ?? 0} onChange={list.paginate} />
          </Show>
        }
      >
        <Show when={notice()}>
          <p role="status" class="p-4 text-sm text-success">
            {notice()}
          </p>
        </Show>
        <AdminListToolbar
          id="admin-servers"
          search={search()}
          onSearchInput={setSearch}
          onSearch={() => list.change({ search: search().trim(), guildID: guildFilter().trim() || undefined })}
          sort={list.query().sort}
          onSort={(sort) => list.change({ sort })}
          sorts={[
            { value: 'createdAt', label: t('admin_v6.registered', 'Registered') },
            { value: 'updatedAt', label: t('admin_v6.updated', 'Updated') },
            { value: 'name', label: t('admin_v6.name', 'Name') },
          ]}
          orderBy={list.query().orderBy}
          onOrder={(orderBy) => list.change({ orderBy })}
          loading={list.results.loading}
          onRefresh={() => void list.refetch()}
        >
          <FormField id="admin-servers-community" label={t('admin_v6.community_id', 'Community ID')}>
            <input
              id="admin-servers-community"
              class="input w-full"
              maxLength={255}
              pattern="[a-zA-Z0-9_-]*"
              value={guildFilter()}
              onInput={(event) => setGuildFilter(event.currentTarget.value)}
            />
          </FormField>
          <FormField id="admin-servers-verified" label={t('admin_v6.verification', 'Verification')}>
            <select
              id="admin-servers-verified"
              class="select"
              value={String(list.query().verified)}
              onChange={(event) => list.change({ verified: event.currentTarget.value })}
            >
              <option value="all">{t('admin_v6.all_servers', 'All servers')}</option>
              <option value="verified">{t('admin_v6.verified', 'Verified')}</option>
              <option value="unverified">{t('admin_v6.unverified', 'Unverified')}</option>
            </select>
          </FormField>
          <FormField id="admin-servers-visibility" label={t('admin_v6.visibility', 'Visibility')}>
            <select
              id="admin-servers-visibility"
              class="select"
              value={String(list.query().visibility)}
              onChange={(event) => list.change({ visibility: event.currentTarget.value })}
            >
              <option value="all">{t('admin_v6.all_visibility', 'Public and private')}</option>
              <option value="public">{t('admin_v6.public', 'Public')}</option>
              <option value="private">{t('admin_v6.private', 'Private')}</option>
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
                <th>{t('admin_v6.server', 'Server')}</th>
                <th>{t('admin_v6.platform_flags', 'Platform flags')}</th>
                <th>{t('admin_v6.addon_activity', 'Addon activity')}</th>
                <th>{t('admin_v6.registered', 'Registered')}</th>
                <th>{t('ui.actions', 'Actions')}</th>
              </tr>
            </thead>
            <tbody>
              <TableState
                colSpan={5}
                loading={list.results.loading}
                error={list.results.error}
                empty={!page()?.items.length}
                emptyLabel={t('admin_v6.servers_empty', 'No game servers match these filters.')}
                errorLabel={t('admin_v6.servers_failed', 'The game servers could not be loaded. Try again.')}
                onRetry={() => void list.refetch()}
              >
                <For each={page()?.items ?? []}>
                  {(server) => (
                    <tr>
                      <td>
                        <div class="flex min-w-0 flex-col items-start gap-2">
                          <strong class="max-w-72 break-words">{server.name}</strong>
                          <CopyableValue value={server.id} label={t('admin_v6.copy_server_id', 'Copy server ID')} />
                          <span class="max-w-72 break-words text-sm text-base-content/60">
                            {server.guildName || server.guildID}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div class="flex flex-wrap gap-2">
                          <BooleanStatus
                            value={server.verified}
                            trueLabel={t('admin_v6.verified', 'Verified')}
                            falseLabel={t('admin_v6.unverified', 'Unverified')}
                          />
                          <StatusBadge tone={server.isPublic ? 'info' : 'neutral'}>
                            {server.isPublic ? t('admin_v6.public', 'Public') : t('admin_v6.private', 'Private')}
                          </StatusBadge>
                        </div>
                      </td>
                      <td>
                        <div class="flex flex-col items-start gap-2">
                          <StatusBadge
                            tone={
                              server.recentlyActive === null ? 'warning' : server.recentlyActive ? 'success' : 'neutral'
                            }
                          >
                            {server.recentlyActive === null
                              ? t('ui.unknown', 'Unknown')
                              : server.recentlyActive
                                ? t('admin_v6.recent_activity', 'Seen recently')
                                : t('admin_v6.no_recent_activity', 'No recent activity')}
                          </StatusBadge>
                          <span class="text-xs text-base-content/65">
                            {server.lastSeenAt ? (
                              <DateTime value={server.lastSeenAt} />
                            ) : (
                              t('admin_v6.not_reported', 'Not reported')
                            )}
                          </span>
                          <span class="text-xs text-base-content/65">
                            {t('admin_v6.addon_version', 'Addon version')}:{' '}
                            {server.addonVersion || t('admin_v6.not_reported', 'Not reported')}
                          </span>
                        </div>
                      </td>
                      <td>
                        <DateTime value={server.createdAt} />
                      </td>
                      <td>
                        <div class="flex flex-wrap gap-2">
                          <ButtonLink
                            size="sm"
                            href={`/dashboard/admins/previews?serverID=${encodeURIComponent(server.id)}`}
                          >
                            {t('admin_previews.preview', 'Preview')}
                          </ButtonLink>
                          <Button size="sm" onClick={() => openEdit(server)}>
                            {t('admin_v6.edit', 'Edit')}
                          </Button>
                          <Button size="sm" onClick={() => openCommand('reset-token', server)}>
                            {t('admin_v6.reset_token', 'Reset token')}
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => openCommand('delete', server)}>
                            {t('admin_v6.delete', 'Delete')}
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
      <AdminModal
        id="admin-server-edit"
        title={t('admin_v6.edit_server', 'Edit game server')}
        description={t(
          'admin_v6.edit_server_description',
          'Save the server name and platform flags together. Provide a reason for the audit trail.',
        )}
        busy={form.pending()}
        onClose={clearEdit}
        onCancel={clearEdit}
        footer={
          <FormActions
            dirty={form.dirty()}
            disabled={!form.valid() || !hasChanges()}
            pending={form.pending()}
            error={form.error()}
            onSave={() => void saveServer()}
            onCancel={() => {
              closeDialog('admin-server-edit')
              clearEdit()
            }}
          />
        }
      >
        <FormField
          id="admin-server-name"
          label={t('admin_v6.server_name', 'Server name')}
          error={form.dirty() ? form.errors().name : undefined}
          required
        >
          <input
            id="admin-server-name"
            class="input w-full"
            maxLength={255}
            value={form.draft().name}
            disabled={form.pending()}
            onInput={(event) => form.patch({ name: event.currentTarget.value })}
            aria-invalid={(form.dirty() && !!form.errors().name) || undefined}
            aria-describedby={form.dirty() && form.errors().name ? 'admin-server-name-error' : undefined}
          />
        </FormField>
        <SettingRow
          controlId="admin-server-is-verified"
          title={t('admin_v6.verified', 'Verified')}
          description={t('admin_v6.verified_description', 'Mark this server as verified by the platform team.')}
        >
          <input
            id="admin-server-is-verified"
            type="checkbox"
            class="toggle toggle-sm"
            checked={form.draft().verified}
            disabled={form.pending()}
            aria-describedby="admin-server-is-verified-description"
            onChange={(event) => form.patch({ verified: event.currentTarget.checked })}
          />
        </SettingRow>
        <SettingRow
          controlId="admin-server-is-public"
          title={t('admin_v6.public_directory', 'Public server directory')}
          description={t('admin_v6.public_description', 'Allow this server to appear in the public server directory.')}
        >
          <input
            id="admin-server-is-public"
            type="checkbox"
            class="toggle toggle-sm"
            checked={form.draft().isPublic}
            disabled={form.pending()}
            aria-describedby="admin-server-is-public-description"
            onChange={(event) => form.patch({ isPublic: event.currentTarget.checked })}
          />
        </SettingRow>
        <FormField
          id="admin-server-edit-reason"
          label={t('admin_v6.audit_reason', 'Reason for this action')}
          description={t('admin_v6.audit_reason_hint', 'Use 5 to 500 characters to explain the administrative change.')}
          error={form.dirty() ? form.errors().reason : undefined}
          required
        >
          <textarea
            id="admin-server-edit-reason"
            class="textarea w-full"
            maxLength={500}
            value={form.draft().reason}
            disabled={form.pending()}
            onInput={(event) => form.patch({ reason: event.currentTarget.value })}
            aria-describedby={`admin-server-edit-reason-description${form.dirty() && form.errors().reason ? ' admin-server-edit-reason-error' : ''}`}
            aria-invalid={(form.dirty() && !!form.errors().reason) || undefined}
          />
        </FormField>
      </AdminModal>
      <ConfirmActionDialog
        id="admin-server-command"
        title={
          command()?.kind === 'delete'
            ? t('admin_v6.delete_server_title', 'Delete {1}?', command()?.server.name || '')
            : t('admin_v6.reset_server_token_title', 'Reset the token for {1}?', command()?.server.name || '')
        }
        description={
          command()?.kind === 'delete'
            ? t(
                'admin_v6.delete_server_consequence',
                'This removes the registered server and its settings. The action cannot be undone.',
              )
            : t(
                'admin_v6.reset_token_consequence',
                'This invalidates the current server token. An administrator must configure the addon with its replacement from the community dashboard.',
              )
        }
        confirmLabel={
          command()?.kind === 'delete'
            ? t('admin_v6.delete_server', 'Delete server')
            : t('admin_v6.reset_token', 'Reset token')
        }
        variant={command()?.kind === 'delete' ? 'danger' : 'warning'}
        disabled={!command() || confirmation() !== command()?.server.id || !reasonValid(reason())}
        onConfirm={async () => {
          const target = command()
          if (!target) throw new Error('Missing server')
          const result = await adminMutate(
            `/servers/${encodeURIComponent(target.server.id)}${target.kind === 'reset-token' ? '/reset-token' : ''}`,
            target.kind === 'delete' ? 'DELETE' : 'POST',
            { confirm: confirmation(), reason: reason().trim() },
          )
          const outcome = target.kind === 'delete' ? 'deleted' : 'reset'
          if (
            !result ||
            typeof result !== 'object' ||
            Array.isArray(result) ||
            Object.keys(result).length !== 1 ||
            (result as Record<string, unknown>)[outcome] !== true
          )
            throw new Error('Invalid command acknowledgement')
        }}
        onSuccess={() => {
          setNotice(
            command()?.kind === 'delete'
              ? t('admin_v6.server_deleted', 'Server deleted.')
              : t(
                  'admin_v6.token_reset',
                  'Server token reset. Update the addon connection from the community dashboard.',
                ),
          )
          setCommand(undefined)
          void list.refetch()
        }}
      >
        {(pending) => (
          <>
            <CopyableValue value={command()?.server.id || ''} label={t('admin_v6.copy_server_id', 'Copy server ID')} />
            <FormField
              id="admin-server-command-confirmation"
              label={t('admin_v6.confirm_server_id', 'Type the server ID to confirm')}
              required
            >
              <input
                id="admin-server-command-confirmation"
                class="input w-full"
                value={confirmation()}
                disabled={pending()}
                autocomplete="off"
                spellcheck={false}
                onInput={(event) => setConfirmation(event.currentTarget.value)}
              />
            </FormField>
            <FormField
              id="admin-server-command-reason"
              label={t('admin_v6.audit_reason', 'Reason for this action')}
              description={t(
                'admin_v6.audit_reason_hint',
                'Use 5 to 500 characters to explain the administrative change.',
              )}
              required
            >
              <textarea
                id="admin-server-command-reason"
                class="textarea w-full"
                maxLength={500}
                value={reason()}
                disabled={pending()}
                aria-describedby="admin-server-command-reason-description"
                onInput={(event) => setReason(event.currentTarget.value)}
              />
            </FormField>
          </>
        )}
      </ConfirmActionDialog>
    </>
  )
}
