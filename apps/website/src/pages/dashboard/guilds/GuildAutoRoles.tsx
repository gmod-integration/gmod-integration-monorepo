import Pagination from '../../../components/Pagination.js'
import { createListPagination } from '../../../hooks/createListPagination.js'
import { FeatureGate } from '../../../components/FeatureGate.js'
import { GuildRolesState } from '../../../components/GuildRolesState.js'
import { useFeatureAccess } from '../../../components/AccessProvider.js'
import { showDialog } from '../../../utils/dialog.js'
import { type Component, createEffect, createResource, createSignal, For, Show } from 'solid-js'
import { guildRoles, guildRolesRefetch } from './GuildInformations.js'
import AdminPanel from '../../../components/AdminPanel.js'
import ConfirmActionDialog from '../../../components/ConfirmActionDialog.js'
import AdminRoleSelector from '../../../components/AdminRoleSelector.js'
import { BooleanStatus, Button, IconButton, TableState } from '../../../components/ui/index.js'
import { useI18n } from '../../../i18n.js'
import DiscordRole from '../../../components/discord/DiscordRole.js'
import MissingRolePermission, { setRolesToCheck } from '../../../components/popup/MissingRolePermission.js'
import { fetchAPI } from '../../../utils/api.js'

type AutoRole = { roleID: string }

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
    if (autoRoles.loading || autoRoles.error) return
    const roles = autoRoles().map((role) => role.roleID)
    setRolesToCheck(roles)
  })

  const { t } = useI18n()
  const quotaAccess = useFeatureAccess('guild.auto_roles')
  const [deleteTarget, setDeleteTarget] = createSignal<AutoRole>()
  const roleName = (roleID: string) =>
    !guildRoles.loading && !guildRoles.error
      ? (guildRoles().find((role) => role.id === roleID)?.name ?? roleID)
      : roleID
  const deleteAutoRole = async (role: AutoRole) => {
    const res = await fetchAPI(`/users/:discordID/guilds/:guildID/auto-roles/${role.roleID}`, 'DELETE')
    if (!res.ok) throw new Error('Role deletion failed')
    mutate((previous) => previous.filter((existing) => existing.roleID !== role.roleID))
  }

  const createVerifyRole = async (roleID: string) => {
    if (!quotaAccess.canCreate(autoRoles().length)) throw new Error('Role limit reached')
    const newLink = await fetchAPI(`/users/:discordID/guilds/:guildID/auto-roles/${roleID}`, 'POST')
    if (!newLink.ok) throw new Error('Role creation failed')
    const verifyRole = await newLink.json()
    mutate((prevVerifyRole) => (prevVerifyRole ? [...prevVerifyRole, verifyRole] : [verifyRole]))
    pagination.onChange({ ...pagination.query(), offset: pagination.total() - 1 })
    return verifyRole
  }

  const pagination = createListPagination<AutoRole>(() => (!autoRoles.error ? autoRoles() : undefined))

  return (
    <>
      <MissingRolePermission />
      <AdminRoleSelector
        id="select_role_modal"
        title={t('dashboard.guild.auto_role.modal_title', 'Add an automatic role')}
        roles={
          !guildRoles.loading && !guildRoles.error && !autoRoles.loading && !autoRoles.error
            ? guildRoles().filter((role) => !autoRoles().some((existing) => existing.roleID === role.id))
            : []
        }
        loading={guildRoles.loading || autoRoles.loading}
        error={guildRoles.error || autoRoles.error}
        loadingLabel={t('dashboard.guild.auto_role.loading', 'Loading...')}
        confirmDisabled={!quotaAccess.canCreate(!autoRoles.error ? autoRoles().length : 0)}
        onConfirm={createVerifyRole}
      >
        <GuildRolesState />
        <p class="text-sm text-base-content/70">
          {t(
            'dashboard.guild.auto_role.modal_description',
            'Choose a role and save to assign it to future members when they join. Existing members are not changed by adding this rule.',
          )}
        </p>
        <FeatureGate
          capability="guild.auto_roles"
          used={!autoRoles.loading && !autoRoles.error ? autoRoles().length : undefined}
          loading={autoRoles.loading}
          error={autoRoles.error}
          showQuota={false}
        />
      </AdminRoleSelector>

      <ConfirmActionDialog
        id="delete_auto_role"
        title={t('ui.delete_target', 'Delete {1}?', roleName(deleteTarget()?.roleID ?? ''))}
        description={t(
          'dashboard.guild.auto_role.delete_confirmation',
          'New members will no longer receive this role automatically. Existing members keep their role.',
        )}
        confirmLabel={t('dashboard.guild.auto_role.delete', 'Delete')}
        onConfirm={async () => {
          if (deleteTarget()) await deleteAutoRole(deleteTarget()!)
        }}
      />

      <AdminPanel
        title={t('dashboard.guild.auto_role.title', 'Auto Roles')}
        description={t(
          'dashboard.guild.auto_role.description',
          'Choose the Discord roles assigned automatically when a new member joins this Discord server.',
        )}
        type="none"
        footer={
          !autoRoles.loading && !autoRoles.error && pagination.visible() ? (
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
            <FeatureGate
              capability="guild.auto_roles"
              used={!autoRoles.loading && !autoRoles.error ? autoRoles().length : undefined}
              loading={autoRoles.loading}
              error={autoRoles.error}
            >
              <Button
                variant="primary"
                disabled={
                  autoRoles.loading ||
                  !!autoRoles.error ||
                  guildRoles.loading ||
                  !!guildRoles.error ||
                  !quotaAccess.canCreate(autoRoles().length)
                }
                onClick={() => {
                  showDialog('select_role_modal')
                  guildRolesRefetch()
                }}
              >
                {t('dashboard.guild.auto_role.add_role', 'Add Role')}
              </Button>
            </FeatureGate>
          </>
        }
      >
        <GuildRolesState />
        <p class="settings-notice">
          {t(
            'dashboard.guild.auto_role.active_help',
            'Every role listed here is automatically assigned to new members.',
          )}
        </p>
        <div class="min-w-0 w-full overflow-x-auto">
          <table class="table rounded-none">
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
                emptyLabel={t(
                  'dashboard.guild.auto_role.no_roles',
                  'No automatic roles yet. Add a role to assign it to new members.',
                )}
                onRetry={() => void refetchRoles()}
              />
              <Show when={!autoRoles.loading && !autoRoles.error}>
                <For each={pagination.items()}>
                  {(role) => (
                    <tr>
                      <td>
                        <DiscordRole roleID={role.roleID} />
                      </td>
                      <td class="text-center">
                        <BooleanStatus value={true} />
                      </td>
                      <td>
                        <div class="flex gap-2 justify-center">
                          <IconButton
                            label={t('dashboard.guild.auto_role.delete', 'Delete')}
                            icon="trash-2"
                            variant="danger"
                            onClick={() => {
                              setDeleteTarget(role)
                              showDialog('delete_auto_role')
                            }}
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
