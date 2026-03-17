import { Component, createEffect, createResource, createSignal, For, Show } from 'solid-js'
import AdminPanel from '../../../../components/AdminPanel'
import { guildRoles } from '../GuildInformations'
import AdminModal from '../../../../components/AdminModal'
import { useI18n } from '../../../../i18n'
import DiscordRole from '../../../../components/discord/DiscordRole'
import MissingRolePermission, { setRolesToCheck } from '../../../../components/popup/MissingRolePermission'
import { NeedWebsocket } from '../../../../components/popup/NeedWebsocket'
import { BuyPremiumBtn, premium, PremiumBadge } from '../../../../utils/premium'
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

  const [selectRole, setSelectRole] = createSignal({} as RoleSync)

  const [rolesSync, { mutate: mutateRolesSync }] = createResource('rolesSync', async () => {
    return fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/roles', 'GET').then(async (res) => {
      if (!res.ok)
        throw new Error(t('dashboard.server.roles.error_occurred', 'An error occurred while fetching the roles sync.'))
      return (await res.json()) || {}
    })
  })

  createEffect(() => {
    if (rolesSync.loading) return
    const roles = rolesSync()?.map((role) => role.roleID) ?? []
    setRolesToCheck(roles)
  })

  function getSelectorClassList(direction: string) {
    return !pseudoDirection.loading ? pseudoDirection().value === direction : false
  }

  function updateSyncPseudoDirection(direction: string) {
    fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/settings/sync_role_direction', 'PUT', {
      value: direction,
    })
      .then((res) => {
        if (res.ok) {
          return res.json()
        } else {
          throw new Error(
            t('dashboard.server.roles.error_occurred', 'An error occurred while updating the pseudo direction.'),
          )
        }
      })
      .then((data) => {
        mutatePseudoDirection(data)
      })
  }

  async function addRole(roleID: string) {
    fetchAPI(`/users/:discordID/guilds/:guildID/servers/:serverID/roles/${roleID}`, 'POST')
      .then((res) => {
        if (res.ok) {
          return res.json()
        } else {
          throw new Error(t('dashboard.server.roles.error_occurred', 'An error occurred while adding the role.'))
        }
      })
      .then((data) => {
        mutateRolesSync((prev) => [...prev, data])
      })
  }

  function editRole() {
    fetchAPI(`/users/:discordID/guilds/:guildID/servers/:serverID/roles/${selectRole().roleID}`, 'PUT', selectRole())
      .then((res) => {
        if (res.ok) {
          return res.json()
        } else {
          throw new Error(t('dashboard.server.roles.error_occurred', 'An error occurred while editing the role.'))
        }
      })
      .then((data) => {
        mutateRolesSync((prev) => prev.map((r) => (r.roleID === data.roleID ? data : r)))
      })
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
  }

  return (
    <>
      <MissingRolePermission />
      <NeedWebsocket />

      <AdminModal title={t('dashboard.server.roles.select_role', 'Select Role')} id="select_role_modal">
        <Show
          when={!guildRoles.loading && !rolesSync.loading}
          fallback={<div>{t('dashboard.server.roles.loading', 'Loading...')}</div>}
        >
          <div class="fieldset">
            <select
              class="select"
              disabled={guildRoles.loading || rolesSync.loading}
              onchange="select_role_modal.close()"
              onChange={async (e) => {
                await addRole(e.currentTarget.value)
              }}
            >
              <option value="0">{t('dashboard.server.roles.select_role', 'Select a Role')}</option>
              <For each={guildRoles()}>
                {(role) => {
                  if (!rolesSync().find((v) => v.roleID === role.id)) {
                    return <option value={role.id}>{role.name}</option>
                  }
                }}
              </For>
            </select>
          </div>
        </Show>
      </AdminModal>

      <AdminModal title={t('dashboard.server.roles.edit_role_sync', 'Edit Role')} id="edit_role_modal">
        <Show when={!guildRoles.loading && !rolesSync.loading}>
          <div class="fieldset">
            <label class="label">
              <span>{t('dashboard.server.roles.role_name', 'Discord Role')}</span>
            </label>
            <select class="select" disabled>
              <option selected>{guildRoles().find((r) => r.id === selectRole().roleID)?.name}</option>
            </select>
          </div>
          <div class="fieldset">
            <label class="label">
              <span>{t('dashboard.server.roles.select_user_group', 'User Group')}</span>
            </label>
            <input
              type="text"
              class="input"
              disabled={guildRoles.loading || rolesSync.loading}
              value={selectRole().userGroup}
              onInput={(e) => {
                selectRole().userGroup = e.currentTarget.value
              }}
            />
          </div>
          <div class="fieldset">
            <label class="label">
              <span>{t('dashboard.server.roles.enable_sync', 'Active')}</span>
            </label>
            <select
              class="select"
              disabled={guildRoles.loading || rolesSync.loading}
              value={selectRole().enable ? 'true' : 'false'}
              onChange={(e) => {
                selectRole().enable = e.currentTarget.value === 'true'
              }}
            >
              <option value="true">{t('dashboard.server.roles.yes', 'Yes')}</option>
              <option value="false">{t('dashboard.server.roles.no', 'No')}</option>
            </select>
          </div>
          <button
            class="btn btn-base-200 mt-2"
            disabled={guildRoles.loading || rolesSync.loading}
            onClick={async () => {
              // @ts-ignore
              edit_role_modal.close()
              editRole()
            }}
          >
            {t('dashboard.server.roles.save_changes', 'Save')}
          </button>
        </Show>
      </AdminModal>

      <AdminPanel
        title={t('dashboard.server.roles.title', 'Roles')}
        description={t(
          'dashboard.server.roles.description',
          'Define the roles that are synchronized with your Discord server.',
        )}
      >
        <div class="flex w-fit items-center">
          <PremiumBadge onlyIcon={true} />
          <span class="mr-2 text-nowrap">
            {t('dashboard.server.roles.sync_direction', 'Roles Synchronization Direction') + ' : '}
          </span>
          <select
            class="select w-full max-w-xs"
            disabled={pseudoDirection.loading}
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
        </div>
      </AdminPanel>

      <AdminPanel
        title={t('dashboard.server.roles.role_sync', 'Roles Syncronized')}
        description={t(
          'dashboard.server.roles.role_sync_description',
          'Define the roles that are synchronized with your Discord server.',
        )}
        type="none"
      >
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
            <Show
              when={!rolesSync.loading}
              fallback={
                <div class="flex justify-center h-36">
                  <div class="loading loading-spinner loading-lg"></div>
                </div>
              }
            >
              <For each={rolesSync()}>
                {(roleSync) => (
                  <tr>
                    <td>
                      <DiscordRole role={guildRoles().find((r) => r.id === roleSync.roleID)} />
                    </td>
                    <td>
                      <TextValue value={roleSync.userGroup} />
                    </td>
                    <td>
                      <div class="flex gap-2 justify-center">
                        {roleSync.enable ? (
                          <i class="fa-solid fa-check text-success"></i>
                        ) : (
                          <i class="fa-solid fa-times text-error"></i>
                        )}
                      </div>
                    </td>
                    <td>
                      <div class="flex gap-2 justify-center">
                        <div class="tooltip tooltip-info" data-tip={t('dashboard.server.roles.edit_role_sync', 'Edit')}>
                          <i
                            class="hover:cursor-pointer fa-solid fa-edit"
                            onClick={() => {
                              // @ts-ignore
                              edit_role_modal.showModal()
                              setSelectRole(roleSync)
                            }}
                          ></i>
                        </div>
                        <div
                          class="tooltip tooltip-error"
                          data-tip={t('dashboard.server.roles.delete_role_sync', 'Delete')}
                        >
                          <i
                            class="hover:cursor-pointer fa-solid fa-trash text-error"
                            onClick={() => deleteRole(roleSync.roleID)}
                          ></i>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </For>
            </Show>
          </tbody>
        </table>

        <div class="flex gap-4 p-4">
          <BuyPremiumBtn
            subCondition={rolesSync()?.length < 3}
            btnText={t(
              'dashboard.server.roles.premium_feature_3',
              'Limited to 3 synchronized roles for free users.',
              3,
            )}
            hidden={rolesSync.loading}
          >
            <button
              class="btn btn-base-200"
              disabled={rolesSync.loading || guildRoles.loading}
              onClick={() => {
                // @ts-ignore
                select_role_modal.showModal()
              }}
            >
              {t('dashboard.server.roles.add_role_sync', 'Add Role')}
            </button>
          </BuyPremiumBtn>
        </div>
      </AdminPanel>
    </>
  )
}

export default ServerRoles
