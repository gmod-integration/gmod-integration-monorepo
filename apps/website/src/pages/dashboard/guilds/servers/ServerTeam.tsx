import Pagination from '../../../../components/Pagination.js'
import { createListPagination } from '../../../../hooks/createListPagination.js'
import { closeDialog, showDialog } from '../../../../utils/dialog.js'
import { type Component, createEffect, createResource, createSignal, For } from 'solid-js'
import AdminPanel from '../../../../components/AdminPanel.js'
import AdminModal from '../../../../components/AdminModal.js'
import ConfirmActionDialog from '../../../../components/ConfirmActionDialog.js'
import { guildRoles } from '../GuildInformations.js'
import { Button, IconButton, FormActions, FormField, TableState, Icon } from '../../../../components/ui/index.js'
import { createDraftForm } from '../../../../hooks/createDraftForm.js'
import { useI18n } from '../../../../i18n.js'
import DiscordRole from '../../../../components/discord/DiscordRole.js'
import MissingRolePermission, { setRolesToCheck } from '../../../../components/popup/MissingRolePermission.js'
import { useFeatureAccess } from '../../../../components/AccessProvider.js'
import { FeatureGate, SuspendedFeature } from '../../../../components/FeatureGate.js'
import { fetchAPI } from '../../../../utils/api.js'
import { TextValue } from '../../../../components/popup/TextValue.js'

interface TeamRule {
  id: number
  serverID: string
  roleID: string
  teamName: string
  enable: boolean
}
const URL = '/users/:discordID/guilds/:guildID/servers/:serverID/teams'
const emptyRule = (): TeamRule => ({ id: 0, serverID: '', roleID: '', teamName: '', enable: false })

const ServerTeam: Component = () => {
  const { t } = useI18n()
  const featureAccess = useFeatureAccess('sync.teams')
  const [creating, setCreating] = createSignal(false)
  const [removing, setRemoving] = createSignal<TeamRule>()
  const editor = createDraftForm<TeamRule>({
    initial: emptyRule(),
    validate: (draft) => ({
      ...(!draft.roleID ? { roleID: t('ui.required', 'This field is required.') } : {}),
      ...(!draft.teamName.trim() ? { teamName: t('ui.required', 'This field is required.') } : {}),
    }),
    errorMessage: () => t('ui.save_error', 'Unable to save. Please try again.'),
  })
  const [rules, { mutate, refetch }] = createResource(
    async (): Promise<TeamRule[]> => {
      const response = await fetchAPI(URL, 'GET')
      if (!response.ok) throw new Error('Role mappings unavailable')
      const data = await response.json()
      if (!Array.isArray(data)) throw new Error('Invalid role mappings')
      return data
    },
    { initialValue: [] },
  )
  const available = () => !guildRoles.loading && !guildRoles.error && !rules.loading && !rules.error
  const canCreate = () => available() && featureAccess.allowed()
  createEffect(() => {
    if (!rules.loading && !rules.error) setRolesToCheck(rules().map((rule) => rule.roleID))
  })
  const roleName = (id: string) => (!guildRoles.error ? guildRoles()?.find((role) => role.id === id)?.name || id : id)
  function begin(row?: TeamRule) {
    if (!available() || editor.pending() || (!row && !canCreate())) return
    setCreating(!row)
    editor.reset(row ? { ...row } : emptyRule())
    showDialog('edit_role_modal')
  }
  async function submit() {
    if (!available() || (creating() && !canCreate()) || (!featureAccess.allowed() && editor.draft().enable)) return
    const isNew = creating()
    const saved = await editor.save(async (snapshot) => {
      const response = await fetchAPI(`${URL}/${isNew ? snapshot.roleID : snapshot.id}`, isNew ? 'POST' : 'PUT', {
        teamName: snapshot.teamName.trim(),
        enable: snapshot.enable,
      })
      if (!response.ok) throw new Error('Role mapping save failed')
      const updated: TeamRule = await response.json()
      mutate((previous) =>
        isNew ? [...previous, updated] : previous.map((row) => (row.id === updated.id ? updated : row)),
      )
      if (isNew) pagination.onChange({ ...pagination.query(), offset: pagination.total() - 1 })
      return updated
    })
    if (saved) closeDialog('edit_role_modal')
  }
  const pagination = createListPagination<TeamRule>(() => (!rules.error ? rules() : undefined))

  return (
    <>
      <MissingRolePermission />

      <AdminModal
        id="edit_role_modal"
        title={
          creating()
            ? t('dashboard.server.team_roles.add_role_sync', 'Add Role')
            : t('dashboard.server.team_roles.edit_role_sync', 'Edit team role mapping')
        }
        busy={editor.pending()}
        onClose={editor.discard}
        onCancel={editor.discard}
      >
        <FormField
          id="teams-role"
          label={t('dashboard.server.team_roles.role_name', 'Discord Role')}
          error={editor.errors().roleID}
        >
          <select
            id="teams-role"
            class="select w-full"
            value={editor.draft().roleID}
            disabled={!creating() || !available() || editor.pending()}
            aria-invalid={!!editor.errors().roleID}
            onChange={(event) => editor.patch({ roleID: event.currentTarget.value })}
          >
            <option value="">{t('dashboard.server.team_roles.select_role', 'Select Role')}</option>
            <For each={!guildRoles.error ? guildRoles() : []}>
              {(role) => <option value={role.id}>{role.name}</option>}
            </For>
          </select>
        </FormField>
        <FormField
          id="teams-mapping"
          label={t('dashboard.server.team_roles.team_name', 'Game team or job name')}
          description={t(
            'dashboard.server.team_roles.team_help',
            'Enter the exact team or job name reported by the game server. It must match the name used in game.',
          )}
          error={editor.errors().teamName}
        >
          <input
            id="teams-mapping"
            aria-describedby={`teams-mapping-description${editor.errors().teamName ? ' teams-mapping-error' : ''}`}
            class="input w-full"
            value={editor.draft().teamName}
            disabled={!available() || editor.pending() || !featureAccess.allowed()}
            aria-invalid={!!editor.errors().teamName}
            onInput={(event) => editor.patch({ teamName: event.currentTarget.value })}
          />
        </FormField>
        <FormField id="teams-enabled" label={t('dashboard.server.team_roles.enable_sync', 'Active')}>
          <input
            id="teams-enabled"
            type="checkbox"
            class="toggle"
            checked={editor.draft().enable}
            disabled={editor.pending() || (!featureAccess.allowed() && !editor.draft().enable)}
            onChange={(event) => editor.patch({ enable: event.currentTarget.checked })}
          />
        </FormField>
        <FeatureGate capability="sync.teams" loading={rules.loading} error={rules.error} showQuota={false} />
        <FormActions
          dirty={editor.dirty()}
          pending={editor.pending()}
          disabled={
            !available() ||
            !editor.valid() ||
            (creating() && !canCreate()) ||
            (!featureAccess.allowed() && editor.draft().enable)
          }
          error={editor.error()}
          saveLabel={creating() ? t('ui.create', 'Create') : t('ui.save', 'Save')}
          onSave={() => void submit()}
          onCancel={() => {
            editor.discard()
            closeDialog('edit_role_modal')
          }}
        />
      </AdminModal>
      <ConfirmActionDialog
        id="delete-role-sync"
        title={t('ui.confirm_delete', 'Delete this item?')}
        description={
          removing()
            ? `${roleName(removing()!.roleID)} — ${removing()!.teamName} — ${t('dashboard.server.team_roles.remove_rule_help', 'Delete this team-to-role mapping. The Discord role and the team in game are kept.')}`
            : ''
        }
        confirmLabel={t('ui.delete', 'Delete')}
        onConfirm={async () => {
          const target = removing()
          if (!target) throw new Error('No role selected')
          const response = await fetchAPI(`${URL}/${target.id}`, 'DELETE')
          if (!response.ok) throw new Error('Role removal failed')
          mutate((previous) => previous.filter((row) => row.id !== target.id))
        }}
      />
      <AdminPanel
        title={t('dashboard.server.team_roles.role', 'Discord roles by game team')}
        description={t(
          'dashboard.server.team_roles.role_sync_description',
          'Assign a Discord role while a linked player is in a specific game team or job. The role is removed when the player changes team or leaves the game.',
        )}
        type="none"
        footer={
          !rules.loading && !rules.error && pagination.visible() ? (
            <Pagination
              standalone
              query={pagination.query()}
              total={pagination.total()}
              onChange={pagination.onChange}
            />
          ) : undefined
        }
        icon="users"
        actions={
          <>
            <FeatureGate capability="sync.teams" loading={rules.loading} error={rules.error} showQuota={false}>
              <Button variant="primary" disabled={!canCreate()} onClick={() => begin()}>
                {t('dashboard.server.team_roles.add_role_sync', 'Add Team Role')}
              </Button>
            </FeatureGate>
          </>
        }
      >
        <p class="settings-notice">
          <Icon name="info" size={16} />
          {t(
            'dashboard.server.team_roles.rule_setup_help',
            'Choose an existing Discord role and a game team. Enable the rule before saving to use it for linked players.',
          )}
        </p>
        <SuspendedFeature
          capability="sync.teams"
          active={!rules.loading && !rules.error && rules().some((row) => row.enable)}
        />
        <div class="settings-table">
          <table class="table w-full">
            <thead>
              <tr>
                <th>{t('dashboard.server.team_roles.role_name', 'Discord Role')}</th>
                <th>{t('dashboard.server.team_roles.team_name', 'Game team or job name')}</th>
                <th>{t('dashboard.server.team_roles.status', 'Active')}</th>
                <th>{t('dashboard.server.team_roles.actions', 'Actions')}</th>
              </tr>
            </thead>
            <tbody>
              <TableState
                colSpan={4}
                loading={rules.loading}
                error={rules.error}
                empty={!rules.loading && !rules.error && rules().length === 0}
                onRetry={() => void refetch()}
              >
                <For each={pagination.items()}>
                  {(row) => (
                    <tr>
                      <td>
                        <DiscordRole roleID={row.roleID} />
                      </td>
                      <td>
                        <TextValue value={row.teamName} />
                      </td>
                      <td>
                        <Icon name={row.enable ? 'check' : 'x'} class={row.enable ? 'text-success' : 'text-error'} />
                      </td>
                      <td>
                        <div class="flex gap-2">
                          <IconButton
                            label={t('dashboard.server.team_roles.edit_role_sync', 'Edit team role mapping')}
                            icon="pencil"
                            disabled={editor.pending()}
                            onClick={() => begin(row)}
                          />
                          <IconButton
                            label={t('dashboard.server.team_roles.delete_role_sync', 'Delete team role mapping')}
                            icon="trash-2"
                            variant="danger"
                            onClick={() => {
                              setRemoving(row)
                              showDialog('delete-role-sync')
                            }}
                          />
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
    </>
  )
}
export default ServerTeam
