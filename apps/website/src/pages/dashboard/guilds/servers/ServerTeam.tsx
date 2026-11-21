import { closeDialog, showDialog } from '../../../../utils/dialog.js'
import { type Component, createEffect, createResource, createSignal, For, Show } from 'solid-js'
import AdminPanel from '../../../../components/AdminPanel'
import { guildRoles } from '../GuildInformations'
import AdminModal from '../../../../components/AdminModal'
import AdminRoleSelector from '../../../../components/AdminRoleSelector.js'
import { Button, IconButton, FormActions, FormField, TableState, Icon } from '../../../../components/ui/index.js'
import { createAsyncAction } from '../../../../hooks/createAsyncAction.js'
import { useI18n } from '../../../../i18n'
import DiscordRole from '../../../../components/discord/DiscordRole'
import MissingRolePermission, { setRolesToCheck } from '../../../../components/popup/MissingRolePermission'
import { premium } from '../../../../utils/premium'
import { fetchAPI } from '../../../../utils/api'
import { TextValue } from '../../../../components/popup/TextValue'

interface RoleSync {
  id: number
  serverID: string
  roleID: string
  teamName: string
  enable: boolean
}

const ServerTeam: Component = () => {
  const { t } = useI18n()
  const editAction = createAsyncAction({ errorMessage: () => t('ui.save_error', 'Unable to save. Please try again.') })
  const [originalRole, setOriginalRole] = createSignal<RoleSync>()
  const roleDirty = () =>
    !!originalRole() &&
    (selectRole().teamName !== originalRole()!.teamName || selectRole().enable !== originalRole()!.enable)
  const discardRole = () => {
    if (editAction.pending()) return
    if (originalRole()) setSelectRole({ ...originalRole()! })
    editAction.reset()
  }

  const [selectRole, setSelectRole] = createSignal<RoleSync>({
    id: 0,
    serverID: '',
    roleID: '',
    teamName: '',
    enable: false,
  })

  const [rolesSync, { mutate: mutateRolesSync, refetch: refetchRoles }] = createResource(
    'rolesSync',
    async (): Promise<RoleSync[]> => {
      return fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/teams', 'GET').then(async (res) => {
        if (!res.ok)
          throw new Error(
            t('dashboard.server.team_roles.error_occurred', 'An error occurred while fetching the roles sync.'),
          )
        return (await res.json()) || []
      })
    },
    { initialValue: [] },
  )

  // when roles list change call setRolesToCheck([roleID<string>])
  createEffect(() => {
    if (rolesSync.loading || rolesSync.error) return
    const roles = rolesSync().map((role: RoleSync) => role.roleID)
    setRolesToCheck(roles)
  })

  async function addRole(roleID: string) {
    const response = await fetchAPI(`/users/:discordID/guilds/:guildID/servers/:serverID/teams/${roleID}`, 'POST')
    if (!response.ok) throw new Error('Role creation failed')
    const created = await response.json()
    mutateRolesSync((previous) => [...previous, created])
  }

  async function editRole() {
    if (!roleDirty()) return
    const draft = { ...selectRole() }
    const saved = await editAction.run(async () => {
      const response = await fetchAPI(
        `/users/:discordID/guilds/:guildID/servers/:serverID/teams/${draft.id}`,
        'PUT',
        draft,
      )
      if (!response.ok) throw new Error('Role update failed')
      const updated = await response.json()
      mutateRolesSync((previous) => previous.map((role) => (role.id === updated.id ? updated : role)))
      setOriginalRole({ ...updated })
    })
    if (saved) closeDialog('edit_role_modal')
  }

  function deleteRole(id: number) {
    fetchAPI(`/users/:discordID/guilds/:guildID/servers/:serverID/teams/${id}`, 'DELETE')
      .then((res) => {
        if (res.ok) {
          return res.json()
        } else {
          throw new Error(t('dashboard.server.team_roles.error_occurred', 'An error occurred while deleting the role.'))
        }
      })
      .then((data) => {
        mutateRolesSync((prev) => prev.filter((r) => r.id !== data.id))
      })
      .catch((error) => console.error(error))
  }

  return (
    <>
      <MissingRolePermission />
      <AdminRoleSelector
        id="select_role_modal"
        title={t('dashboard.server.team_roles.select_role', 'Select Role')}
        roles={!guildRoles.loading && !guildRoles.error && !rolesSync.loading && !rolesSync.error ? guildRoles() : []}
        loading={guildRoles.loading || rolesSync.loading}
        error={guildRoles.error || rolesSync.error}
        loadingLabel={t('dashboard.server.team_roles.loading', 'Loading...')}
        onConfirm={addRole}
      />

      <AdminModal
        title={t('dashboard.server.team_roles.edit_role_sync', 'Edit Role')}
        id="edit_role_modal"
        busy={editAction.pending()}
        onClose={discardRole}
        onCancel={discardRole}
      >
        <Show when={!guildRoles.loading && !guildRoles.error && !rolesSync.loading && !rolesSync.error}>
          <FormField id="serverteam-field-0" label={t('dashboard.server.team_roles.role_name', 'Discord Role')}>
            <select id="serverteam-field-0" class="select" disabled>
              <option selected>{guildRoles().find((r) => r.id === selectRole().roleID)?.name}</option>
            </select>
          </FormField>
          <FormField id="serverteam-field-1" label={t('dashboard.server.team_roles.team_name', 'Team Name')}>
            <input
              id="serverteam-field-1"
              type="text"
              class="input"
              disabled={guildRoles.loading || rolesSync.loading || editAction.pending()}
              value={selectRole().teamName}
              onInput={(e) => {
                setSelectRole((previous) => ({ ...previous, teamName: e.currentTarget.value }))
              }}
            />
          </FormField>
          <FormField id="serverteam-field-2" label={t('dashboard.server.team_roles.enable_sync', 'Active')}>
            <select
              id="serverteam-field-2"
              class="select"
              disabled={guildRoles.loading || rolesSync.loading || editAction.pending()}
              value={selectRole().enable ? 'true' : 'false'}
              onChange={(e) => {
                setSelectRole((previous) => ({ ...previous, enable: e.currentTarget.value === 'true' }))
              }}
            >
              <option value="true">{t('dashboard.server.team_roles.yes', 'Yes')}</option>
              <option value="false">{t('dashboard.server.team_roles.no', 'No')}</option>
            </select>
          </FormField>
          <FormActions
            dirty={roleDirty()}
            pending={editAction.pending()}
            disabled={guildRoles.loading || !!guildRoles.error || rolesSync.loading || !!rolesSync.error}
            error={editAction.error()}
            onSave={editRole}
            onCancel={() => {
              discardRole()
              closeDialog('edit_role_modal')
            }}
          />
        </Show>
      </AdminModal>

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
          <Button
            variant="primary"
            onClick={() => {
              showDialog('select_role_modal')
            }}
            disabled={!premium()}
          >
            {t('dashboard.server.team_roles.add_role_sync', 'Add Team Role')}
          </Button>
        }
      >
        <p class="settings-notice px-5 py-4">
          <Icon name="info" size={16} />
          {t('settings.rule_setup_help', 'Choose a Discord role, then edit its game mapping and enable the rule.')}
        </p>
        <div class="min-w-0 w-full overflow-x-auto">
          <table class="table border-b border-base-300 rounded-none">
            <thead>
              <tr class="text-l">
                <th>{t('dashboard.server.team_roles.role_name', 'Discord Role')}</th>
                <th>{t('dashboard.server.team_roles.team_name', 'Team Name')}</th>
                <th class="w-1/6 text-center">{t('dashboard.server.team_roles.status', 'Active')}</th>
                <th class="w-1/6 text-center">{t('dashboard.server.team_roles.actions', 'Actions')}</th>
              </tr>
            </thead>
            <tbody>
              <TableState
                colSpan={4}
                loading={rolesSync.loading}
                error={rolesSync.error}
                empty={!rolesSync.loading && !rolesSync.error && rolesSync().length === 0}
                errorLabel={t('ui.load_error', 'Unable to load this content.')}
                onRetry={() => void refetchRoles()}
              />
              <Show when={!rolesSync.loading && !rolesSync.error && !guildRoles.error}>
                <For each={rolesSync()}>
                  {(roleSync) => (
                    <tr>
                      <td>
                        <DiscordRole roleID={roleSync.roleID} />
                      </td>
                      <td>
                        <TextValue value={roleSync.teamName} />
                      </td>
                      <td>
                        <div class="flex gap-2 justify-center">
                          {roleSync.enable ? (
                            <Icon name="check" class="text-success" />
                          ) : (
                            <Icon name="x" class="text-error" />
                          )}
                        </div>
                      </td>
                      <td>
                        <div class="flex gap-2 justify-center">
                          <IconButton
                            label={t('dashboard.server.team_roles.edit_role_sync', 'Edit')}
                            icon="pencil"
                            disabled={editAction.pending()}
                            onClick={() => {
                              showDialog('edit_role_modal')
                              setSelectRole({ ...roleSync })
                              setOriginalRole({ ...roleSync })
                              editAction.reset()
                            }}
                          />
                          <IconButton
                            label={t('dashboard.server.team_roles.delete_role_sync', 'Delete')}
                            icon="trash-2"
                            variant="danger"
                            disabled={editAction.pending()}
                            onClick={() => deleteRole(roleSync.id)}
                          />
                        </div>
                      </td>
                    </tr>
                  )}
                </For>
              </Show>
            </tbody>
          </table>
        </div>
      </AdminPanel>
    </>
  )
}

export default ServerTeam
