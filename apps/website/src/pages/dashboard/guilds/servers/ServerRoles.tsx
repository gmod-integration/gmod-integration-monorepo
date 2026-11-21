import { closeDialog, showDialog } from '../../../../utils/dialog.js'
import { type Component, createEffect, createResource, createSignal, For, Show } from 'solid-js'
import AdminPanel from '../../../../components/AdminPanel'
import { guildRoles } from '../GuildInformations'
import AdminModal from '../../../../components/AdminModal'
import AdminRoleSelector from '../../../../components/AdminRoleSelector.js'
import {
  Button,
  IconButton,
  FormActions,
  FormField,
  TableState,
  Icon,
  SettingGroup,
  SettingRow,
} from '../../../../components/ui/index.js'
import { createAsyncAction } from '../../../../hooks/createAsyncAction.js'
import { useI18n } from '../../../../i18n'
import DiscordRole from '../../../../components/discord/DiscordRole'
import MissingRolePermission, { setRolesToCheck } from '../../../../components/popup/MissingRolePermission'
import { NeedWebsocket } from '../../../../components/popup/NeedWebsocket'
import { BuyPremiumBtn, premium } from '../../../../utils/premium'
import { PremiumOnly } from '../../../../components/PremiumOnly'
import { fetchAPI } from '../../../../utils/api'
import { TextValue } from '../../../../components/popup/TextValue'

interface RoleSync {
  serverID: string
  roleID: string
  userGroup: string
  enable: boolean
}

const ServerRoles: Component = () => {
  const { t } = useI18n()
  const editAction = createAsyncAction({ errorMessage: () => t('ui.save_error', 'Unable to save. Please try again.') })
  const directionAction = createAsyncAction({
    errorMessage: () => t('ui.save_error', 'Unable to save. Please try again.'),
  })
  const [directionDraft, setDirectionDraft] = createSignal('disable')
  const [originalRole, setOriginalRole] = createSignal<RoleSync>()
  const roleDirty = () =>
    !!originalRole() &&
    (selectRole().userGroup !== originalRole()!.userGroup || selectRole().enable !== originalRole()!.enable)
  const discardRole = () => {
    if (editAction.pending()) return
    if (originalRole()) setSelectRole({ ...originalRole()! })
    editAction.reset()
  }
  const [pseudoDirection, { mutate: mutatePseudoDirection }] = createResource('pseudoDirection', async () => {
    return fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/settings/sync_role_direction', 'GET').then(
      async (res) => {
        if (!res.ok)
          throw new Error(
            t('dashboard.server.roles.error_occurred', 'An error occurred while fetching the pseudo direction.'),
          )
        return (await res.json()) || {}
      },
    )
  })

  createEffect(() => {
    if (!pseudoDirection.loading && !pseudoDirection.error) setDirectionDraft(pseudoDirection().value ?? 'disable')
  })

  const [selectRole, setSelectRole] = createSignal<RoleSync>({ serverID: '', roleID: '', userGroup: '', enable: false })

  const [rolesSync, { mutate: mutateRolesSync, refetch: refetchRoles }] = createResource(
    'rolesSync',
    async (): Promise<RoleSync[]> => {
      return fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/roles', 'GET').then(async (res) => {
        if (!res.ok)
          throw new Error(
            t('dashboard.server.roles.error_occurred', 'An error occurred while fetching the roles sync.'),
          )
        return (await res.json()) || []
      })
    },
    { initialValue: [] },
  )

  createEffect(() => {
    if (rolesSync.loading || rolesSync.error) return
    const roles = rolesSync()?.map((role) => role.roleID) ?? []
    setRolesToCheck(roles)
  })

  function getSelectorClassList(direction: string) {
    return !pseudoDirection.loading && !pseudoDirection.error ? pseudoDirection().value === direction : false
  }

  async function updateSyncPseudoDirection(direction: string) {
    if (pseudoDirection.loading || pseudoDirection.error || directionAction.pending()) return
    const previous = pseudoDirection().value
    setDirectionDraft(direction)
    const saved = await directionAction.run(async () => {
      const response = await fetchAPI(
        '/users/:discordID/guilds/:guildID/servers/:serverID/settings/sync_role_direction',
        'PUT',
        {
          value: direction,
        },
      )
      if (!response.ok) throw new Error('Role synchronization update failed')
      mutatePseudoDirection(await response.json())
    })
    if (!saved) setDirectionDraft(previous ?? 'disable')
  }

  async function addRole(roleID: string) {
    const response = await fetchAPI(`/users/:discordID/guilds/:guildID/servers/:serverID/roles/${roleID}`, 'POST')
    if (!response.ok) throw new Error('Role creation failed')
    const created = await response.json()
    mutateRolesSync((previous) => [...previous, created])
  }

  async function editRole() {
    if (!roleDirty()) return
    const draft = { ...selectRole() }
    const saved = await editAction.run(async () => {
      const response = await fetchAPI(
        `/users/:discordID/guilds/:guildID/servers/:serverID/roles/${draft.roleID}`,
        'PUT',
        draft,
      )
      if (!response.ok) throw new Error('Role update failed')
      const updated = await response.json()
      mutateRolesSync((previous) => previous.map((role) => (role.roleID === updated.roleID ? updated : role)))
      setOriginalRole({ ...updated })
    })
    if (saved) closeDialog('edit_role_modal')
  }

  function deleteRole(roleID: string) {
    fetchAPI(`/users/:discordID/guilds/:guildID/servers/:serverID/roles/${roleID}`, 'DELETE')
      .then((res) => {
        if (res.ok) {
          return res.json()
        } else {
          throw new Error(t('dashboard.server.roles.error_occurred', 'An error occurred while deleting the role.'))
        }
      })
      .then((data) => {
        mutateRolesSync((prev) => prev.filter((r) => r.roleID !== data.roleID))
      })
      .catch((error) => console.error(error))
  }

  return (
    <>
      <MissingRolePermission />
      <NeedWebsocket />

      <AdminRoleSelector
        id="select_role_modal"
        title={t('dashboard.server.roles.select_role', 'Select Role')}
        roles={
          !guildRoles.loading && !guildRoles.error && !rolesSync.loading && !rolesSync.error
            ? guildRoles().filter((role) => !rolesSync().some((existing) => existing.roleID === role.id))
            : []
        }
        loading={guildRoles.loading || rolesSync.loading}
        error={guildRoles.error || rolesSync.error}
        loadingLabel={t('dashboard.server.roles.loading', 'Loading...')}
        onConfirm={addRole}
      />

      <AdminModal
        title={t('dashboard.server.roles.edit_role_sync', 'Edit Role')}
        id="edit_role_modal"
        busy={editAction.pending()}
        onClose={discardRole}
        onCancel={discardRole}
      >
        <Show when={!guildRoles.loading && !guildRoles.error && !rolesSync.loading && !rolesSync.error}>
          <FormField id="serverroles-field-0" label={t('dashboard.server.roles.role_name', 'Discord Role')}>
            <select id="serverroles-field-0" class="select" disabled>
              <option selected>{guildRoles().find((r) => r.id === selectRole().roleID)?.name}</option>
            </select>
          </FormField>
          <FormField id="serverroles-field-1" label={t('dashboard.server.roles.select_user_group', 'User Group')}>
            <input
              id="serverroles-field-1"
              type="text"
              class="input"
              disabled={guildRoles.loading || rolesSync.loading || editAction.pending()}
              value={selectRole().userGroup}
              onInput={(e) => {
                setSelectRole((previous) => ({ ...previous, userGroup: e.currentTarget.value }))
              }}
            />
          </FormField>
          <FormField id="serverroles-field-2" label={t('dashboard.server.roles.enable_sync', 'Active')}>
            <select
              id="serverroles-field-2"
              class="select"
              disabled={guildRoles.loading || rolesSync.loading || editAction.pending()}
              value={selectRole().enable ? 'true' : 'false'}
              onChange={(e) => {
                setSelectRole((previous) => ({ ...previous, enable: e.currentTarget.value === 'true' }))
              }}
            >
              <option value="true">{t('dashboard.server.roles.yes', 'Yes')}</option>
              <option value="false">{t('dashboard.server.roles.no', 'No')}</option>
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
        title={t('dashboard.server.roles.title', 'Roles')}
        description={t(
          'dashboard.server.roles.description',
          'Define the roles that are synchronized with your Discord server.',
        )}
      >
        <SettingGroup title={t('settings.sync_behavior', 'Synchronization behavior')} icon="arrow-left-right">
          <SettingRow
            controlId="server-roles-direction"
            title={t('dashboard.server.roles.sync_direction', 'Roles Synchronization Direction')}
            description={t(
              'settings.sync_direction_help',
              'This direction applies to every rule below. Changes are saved automatically.',
            )}
            feedback={
              <>
                <Show when={directionAction.error() || pseudoDirection.error}>
                  <p role="alert" class="text-error">
                    {directionAction.error() || t('ui.load_error', 'Unable to load this content.')}
                  </p>
                </Show>
                <Show when={directionAction.pending()}>
                  <p role="status">{t('ui.loading', 'Loading…')}</p>
                </Show>
                <Show when={directionAction.success()}>
                  <p role="status" class="text-success">
                    {t('ui.saved', 'Changes saved.')}
                  </p>
                </Show>
              </>
            }
          >
            <select
              id="server-roles-direction"
              aria-describedby="server-roles-direction-description"
              class="select w-full max-w-xs"
              value={directionDraft()}
              disabled={pseudoDirection.loading || !!pseudoDirection.error || directionAction.pending()}
              onChange={(e) => {
                updateSyncPseudoDirection(e.currentTarget.value)
              }}
            >
              <option value="discord-to-gmod" selected={getSelectorClassList('discord-to-gmod')} disabled={!premium()}>
                {t('dashboard.server.roles.discord_to_server', 'From Discord to Gmod')} <PremiumOnly />
              </option>
              <option value="gmod-to-discord" selected={getSelectorClassList('gmod-to-discord')}>
                {t('dashboard.server.roles.server_to_discord', 'From Gmod to Discord')}
              </option>
              <option value="both" selected={getSelectorClassList('both')} disabled={!premium()}>
                {t('dashboard.server.roles.both_directions', 'Both Ways')} <PremiumOnly />
              </option>
            </select>
          </SettingRow>
          <Show when={!premium()}>
            <p class="settings-notice">
              <Icon name="crown" size={16} />
              {t('settings.sync_premium_help', 'Discord to game and two-way synchronization require Premium.')}
            </p>
          </Show>
        </SettingGroup>
      </AdminPanel>

      <AdminPanel
        title={t('dashboard.server.roles.role_sync', 'Roles Syncronized')}
        description={t(
          'dashboard.server.roles.role_sync_description',
          'Define the roles that are synchronized with your Discord server.',
        )}
        type="none"
        icon="shield-check"
        actions={
          <BuyPremiumBtn
            subCondition={!rolesSync.error && rolesSync()?.length < 3}
            btnText={t(
              'dashboard.server.roles.premium_feature_3',
              'Limited to 3 synchronized roles for free users.',
              3,
            )}
            hidden={rolesSync.loading}
          >
            <Button
              variant="primary"
              disabled={rolesSync.loading || guildRoles.loading}
              onClick={() => {
                showDialog('select_role_modal')
              }}
            >
              {t('dashboard.server.roles.add_role_sync', 'Add Role')}
            </Button>
          </BuyPremiumBtn>
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
                <th>{t('dashboard.server.roles.role_name', 'Discord Role')}</th>
                <th>{t('dashboard.server.roles.user_group', 'User Group')}</th>
                <th class="w-1/6 text-center">{t('dashboard.server.roles.status', 'Active')}</th>
                <th class="w-1/6 text-center">{t('dashboard.server.roles.actions', 'Actions')}</th>
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
                        <TextValue value={roleSync.userGroup} />
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
                            label={t('dashboard.server.roles.edit_role_sync', 'Edit')}
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
                            label={t('dashboard.server.roles.delete_role_sync', 'Delete')}
                            icon="trash-2"
                            variant="danger"
                            disabled={editAction.pending()}
                            onClick={() => deleteRole(roleSync.roleID)}
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

export default ServerRoles
