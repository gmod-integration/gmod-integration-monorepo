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
import { premium } from '../../../../utils/premium.js'
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
  const canCreate = () => available() && premium()
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
    if (!available() || (creating() && !canCreate())) return
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
      return updated
    })
    if (saved) closeDialog('edit_role_modal')
  }
  return (
    <>
      <MissingRolePermission />

      <AdminModal
        id="edit_role_modal"
        title={
          creating()
            ? t('dashboard.server.team_roles.add_role_sync', 'Add Role')
            : t('dashboard.server.team_roles.edit_role_sync', 'Edit Role')
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
          label={t('dashboard.server.team_roles.team_name', 'Team Name')}
          error={editor.errors().teamName}
        >
          <input
            id="teams-mapping"
            class="input w-full"
            value={editor.draft().teamName}
            disabled={!available() || editor.pending()}
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
            disabled={editor.pending()}
            onChange={(event) => editor.patch({ enable: event.currentTarget.checked })}
          />
        </FormField>
        <FormActions
          dirty={editor.dirty()}
          pending={editor.pending()}
          disabled={!available() || !editor.valid() || (creating() && !canCreate())}
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
        description={removing() ? `${roleName(removing()!.roleID)} — ${removing()!.teamName}` : ''}
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
        title={t('dashboard.server.team_roles.role', 'Team Role')}
        description={t(
          'dashboard.server.team_roles.role_sync_description',
          'Add temporary roles to your Discord members when they join a specific team in your game server.',
        )}
        type="none"
        premium={true}
        icon="users"
        actions={
          <>
            <Button variant="primary" disabled={!canCreate()} onClick={() => begin()}>
              {t('dashboard.server.team_roles.add_role_sync', 'Add Team Role')}
            </Button>
          </>
        }
      >
        <p class="settings-notice">
          <Icon name="info" size={16} />
          {t('settings.rule_setup_help', 'Create a complete rule, then save it to start synchronization.')}
        </p>
        <div class="settings-table">
          <table class="table w-full">
            <thead>
              <tr>
                <th>{t('dashboard.server.team_roles.role_name', 'Discord Role')}</th>
                <th>{t('dashboard.server.team_roles.team_name', 'Team Name')}</th>
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
                <For each={!rules.error ? rules() : []}>
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
                            label={t('dashboard.server.team_roles.edit_role_sync', 'Edit')}
                            icon="pencil"
                            disabled={editor.pending()}
                            onClick={() => begin(row)}
                          />
                          <IconButton
                            label={t('dashboard.server.team_roles.delete_role_sync', 'Delete')}
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
