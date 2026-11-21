import { closeDialog, showDialog } from '../../../utils/dialog.js'
import { type Component, createEffect, createResource, createSignal, For, Show } from 'solid-js'
import { guildRoles, guildRolesRefetch } from './GuildInformations'
import AdminPanel from '../../../components/AdminPanel'
import AdminModal from '../../../components/AdminModal'
import AdminRoleSelector from '../../../components/AdminRoleSelector.js'
import { Button, IconButton, FormActions, FormField, TableState, Icon } from '../../../components/ui/index.js'
import { createAsyncAction } from '../../../hooks/createAsyncAction.js'
import AdminChannelSelector from '../../../components/AdminChannelSelector'
import { useI18n } from '../../../i18n'
import DiscordRole from '../../../components/discord/DiscordRole'
import MissingRolePermission, { setRolesToCheck } from '../../../components/popup/MissingRolePermission'
import { BuyPremiumBtn } from '../../../utils/premium'
import { fetchAPI } from '../../../utils/api'

type AutoRole = { roleID: string; enabled: boolean }

const fetchVerifyRoles = async (): Promise<AutoRole[]> => {
  const res = await fetchAPI('/users/:discordID/guilds/:guildID/auto-roles', 'GET')
  if (!res.ok) throw new Error('Role list request failed')
  return await res.json()
}

const GuildAutoRole: Component = () => {
  const [autoRoles, { mutate, refetch: refetchRoles }] = createResource('verifyRole', fetchVerifyRoles, {
    initialValue: [],
  })
  createEffect(() => {
    // Bug fix: also bail out on autoRoles.error - reading autoRoles() while errored re-throws.
    if (autoRoles.loading || autoRoles.error) return
    const roles = autoRoles().map((role) => role.roleID)
    setRolesToCheck(roles)
  })

  const [selectedRole, setSelectedRole] = createSignal<AutoRole>({ roleID: '', enabled: false })
  const { t } = useI18n()
  const editAction = createAsyncAction({ errorMessage: () => t('ui.save_error', 'Unable to save. Please try again.') })
  const [originalRole, setOriginalRole] = createSignal<AutoRole>()
  const roleDirty = () => !!originalRole() && selectedRole().enabled !== originalRole()!.enabled
  const discardRole = () => {
    if (editAction.pending()) return
    if (originalRole()) setSelectedRole({ ...originalRole()! })
    editAction.reset()
  }

  const deleteAutoRole = async (role: AutoRole) => {
    const res = await fetchAPI(`/users/:discordID/guilds/:guildID/auto-roles/${role.roleID}`, 'DELETE')
    if (!res.ok) {
      return
    }
    mutate((prevVerifyRole) => (prevVerifyRole ? prevVerifyRole.filter((v) => v.roleID !== role.roleID) : []))
    return role
  }

  const createVerifyRole = async (roleID: string) => {
    const newLink = await fetchAPI(`/users/:discordID/guilds/:guildID/auto-roles/${roleID}`, 'POST')
    if (!newLink.ok) throw new Error('Role creation failed')
    const verifyRole = await newLink.json()
    mutate((prevVerifyRole) => (prevVerifyRole ? [...prevVerifyRole, verifyRole] : [verifyRole]))
    return verifyRole
  }

  // Bug fix: the Save button below called an `editVerifyRole` that was never defined anywhere in
  // this file (a leftover from copying GuildVerifications.tsx, which does define one), throwing a
  // ReferenceError. Added the missing function, mirroring the PUT-and-mutate pattern used by
  // deleteAutoRole/createVerifyRole above and by GuildVerifications.tsx's own editVerifyRole.
  const editVerifyRole = async (role: AutoRole) => {
    if (!role.roleID) return
    const res = await fetchAPI(`/users/:discordID/guilds/:guildID/auto-roles/${role.roleID}`, 'PUT', {
      enabled: role.enabled,
    })
    if (!res.ok) throw new Error('Role update failed')
    const updatedRole = await res.json()
    mutate((prevVerifyRole) =>
      prevVerifyRole ? prevVerifyRole.map((v) => (v.roleID === updatedRole.roleID ? updatedRole : v)) : [],
    )
    return updatedRole
  }

  async function saveRole() {
    if (!roleDirty()) return
    const draft = { ...selectedRole() }
    if (await editAction.run(() => editVerifyRole(draft))) closeDialog('edit_role_modal')
  }

  return (
    <>
      <MissingRolePermission />
      <AdminRoleSelector
        id="select_role_modal"
        title={t('dashboard.guild.auto_role.modal_title', 'Select Role')}
        roles={
          !guildRoles.loading && !guildRoles.error && !autoRoles.loading && !autoRoles.error
            ? guildRoles().filter((role) => !autoRoles().some((existing) => existing.roleID === role.id))
            : []
        }
        loading={guildRoles.loading || autoRoles.loading}
        error={guildRoles.error || autoRoles.error}
        loadingLabel={t('dashboard.guild.auto_role.loading', 'Loading...')}
        onConfirm={createVerifyRole}
      />

      <AdminChannelSelector id="select_channel_modal" />

      <AdminModal
        title={t('dashboard.guild.auto_role.modal_title', 'Edit Role')}
        id="edit_role_modal"
        busy={editAction.pending()}
        onClose={discardRole}
        onCancel={discardRole}
      >
        <Show when={!guildRoles.loading && !guildRoles.error && !autoRoles.loading && !autoRoles.error}>
          <FormField id="guildautoroles-field-0" label={t('dashboard.guild.auto_role.role_name', 'Role')}>
            <select id="guildautoroles-field-0" class="select" disabled>
              <option selected>{guildRoles().find((r) => r.id === selectedRole().roleID)?.name}</option>
            </select>
          </FormField>
          <FormField id="guildautoroles-field-1" label={t('dashboard.guild.links.active', 'Active')}>
            <select
              id="guildautoroles-field-1"
              class="select"
              disabled={guildRoles.loading || autoRoles.loading || editAction.pending()}
              value={selectedRole().enabled ? 'true' : 'false'}
              onChange={(e) => {
                setSelectedRole((previous) => ({ ...previous, enabled: e.currentTarget.value === 'true' }))
              }}
            >
              <option value="true">{t('dashboard.guild.auto_role.yes', 'Yes')}</option>
              <option value="false">{t('dashboard.guild.auto_role.no', 'No')}</option>
            </select>
          </FormField>
          <FormActions
            dirty={roleDirty()}
            pending={editAction.pending()}
            disabled={guildRoles.loading || !!guildRoles.error || autoRoles.loading || !!autoRoles.error}
            error={editAction.error()}
            onSave={saveRole}
            onCancel={() => {
              discardRole()
              closeDialog('edit_role_modal')
            }}
          />
        </Show>
      </AdminModal>

      <AdminPanel
        title={t('dashboard.guild.auto_role.title', 'Auto Roles')}
        description={t(
          'dashboard.guild.auto_role.description',
          'Here you can set roles to give by default for new members.',
        )}
        type="none"
        icon="users"
        actions={
          <>
            {/* Bug fix: subCondition below short-circuits before calling autoRoles() - this
              expression isn't wrapped in any loading/error Show at all, so reading autoRoles()
              while the resource is errored used to re-throw and crash the render (see the tbody
              fix above for the full explanation). */}
            <BuyPremiumBtn
              subCondition={!autoRoles.error && autoRoles()?.length < 3}
              btnText={t('dashboard.guild.auto_role.premium', 'Limited to 3 auto roles for free users.')}
              hidden={autoRoles.loading}
            >
              <Button
                variant="primary"
                disabled={autoRoles.loading || !!autoRoles.error || guildRoles.loading || !!guildRoles.error}
                onClick={() => {
                  showDialog('select_role_modal')
                  guildRolesRefetch()
                }}
              >
                {t('dashboard.guild.auto_role.add_role', 'Add Role')}
              </Button>
            </BuyPremiumBtn>
          </>
        }
      >
        <div class="min-w-0 w-full overflow-x-auto">
          <table class="table border-b border-base-300 rounded-none">
            <thead>
              <tr class="text-l">
                <th>{t('dashboard.guild.auto_role.role_name', 'Role')}</th>
                <th class="text-center">{t('dashboard.guild.links.active', 'Active')}</th>
                <th class="w-1/6 text-center">{t('dashboard.guild.auto_role.actions', 'Actions')}</th>
              </tr>
            </thead>
            <tbody>
              <TableState
                colSpan={3}
                loading={autoRoles.loading}
                error={autoRoles.error}
                empty={!autoRoles.loading && !autoRoles.error && autoRoles().length === 0}
                errorLabel={t('dashboard.guild.auto_role.failed_to_load', 'Unable to load this content.')}
                onRetry={() => void refetchRoles()}
              />
              {/* Bug fix: also gate on !autoRoles.error - `autoRoles()` is read unguarded below
                (via <For each={autoRoles()}>), and reading a resource accessor while it's in an
                error state re-throws that error, which crashed the render (leaving it stuck on
                the loading state forever) and made the `Match when={autoRoles.error}` message
                below unreachable. Mirrors the same fix already applied to ServerPlayers.tsx. */}
              <Show when={!autoRoles.loading && !autoRoles.error}>
                <For each={autoRoles()}>
                  {(role) => (
                    <tr>
                      <td>
                        <DiscordRole roleID={role.roleID} />
                      </td>
                      <td class="text-center">
                        <span
                          class="inline-flex items-center gap-2"
                          classList={{ 'text-success': role.enabled, 'text-base-content/50': !role.enabled }}
                        >
                          <Icon name={role.enabled ? 'check' : 'x'} size={15} />
                          {role.enabled ? t('ui.enabled', 'Enabled') : t('ui.disabled', 'Disabled')}
                        </span>
                      </td>
                      <td>
                        <div class="flex gap-2 justify-center">
                          <IconButton
                            label={t('dashboard.guild.links.edit', 'Edit')}
                            icon="pencil"
                            disabled={editAction.pending()}
                            onClick={() => {
                              setSelectedRole({ ...role })
                              setOriginalRole({ ...role })
                              editAction.reset()
                              showDialog('edit_role_modal')
                            }}
                          />
                          <IconButton
                            label={t('dashboard.guild.auto_role.delete', 'Delete')}
                            icon="trash-2"
                            variant="danger"
                            disabled={editAction.pending()}
                            onClick={() => deleteAutoRole(role)}
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

export default GuildAutoRole
