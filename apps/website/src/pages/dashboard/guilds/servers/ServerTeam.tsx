import { Component, createEffect, createResource, createSignal, For, Show } from 'solid-js'
import AdminPanel from '../../../../components/AdminPanel'
import { guildRoles } from '../GuildInformations'
import AdminModal from '../../../../components/AdminModal'
import { useI18n } from '../../../../i18n'
import DiscordRole from '../../../../components/discord/DiscordRole'
import MissingRolePermission, { setRolesToCheck } from '../../../../components/popup/MissingRolePermission'
import { premium } from '../../../../utils/premium'
import { fetchAPI } from '../../../../utils/api'
import { TextValue } from '../../../../components/popup/TextValue'

interface RoleSync {
  serverID: string
  roleID: string
  teamName: string
  enable: boolean
}

const ServerTeam: Component = () => {
  const { t } = useI18n()

  const [selectRole, setSelectRole] = createSignal({} as RoleSync)

  const [rolesSync, { mutate: mutateRolesSync }] = createResource('rolesSync', async () => {
    return fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/teams', 'GET').then(async (res) => {
      if (!res.ok)
        throw new Error(
          t('dashboard.server.team_roles.error_occurred', 'An error occurred while fetching the roles sync.'),
        )
      return (await res.json()) || {}
    })
  })

  // when roles list change call setRolesToCheck([roleID<string>])
  createEffect(() => {
    if (rolesSync.loading) return
    const roles = rolesSync().map((role: RoleSync) => role.roleID)
    setRolesToCheck(roles)
  })

  async function addRole(id: string) {
    fetchAPI(`/users/:discordID/guilds/:guildID/servers/:serverID/teams/${id}`, 'POST')
      .then((res) => {
        if (res.ok) {
          return res.json()
        } else {
          throw new Error(t('dashboard.server.team_roles.error_occurred', 'An error occurred while adding the role.'))
        }
      })
      .then((data) => {
        mutateRolesSync((prev) => [...prev, data])
      })
  }

  function editRole() {
    fetchAPI(`/users/:discordID/guilds/:guildID/servers/:serverID/teams/${selectRole().id}`, 'PUT', selectRole())
      .then((res) => {
        if (res.ok) {
          return res.json()
        } else {
          throw new Error(t('dashboard.server.team_roles.error_occurred', 'An error occurred while editing the role.'))
        }
      })
      .then((data) => {
        mutateRolesSync((prev) => prev.map((r) => (r.id === data.id ? data : r)))
      })
  }

  function deleteRole(id: string) {
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
  }

  return (
    <>
      <MissingRolePermission />
      <AdminModal title={t('dashboard.server.team_roles.select_role', 'Select Role')} id="select_role_modal">
        <Show
          when={!guildRoles.loading && !rolesSync.loading}
          fallback={<div>{t('dashboard.server.team_roles.loading', 'Loading...')}</div>}
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
              <option value="0">{t('dashboard.server.team_roles.select_role', 'Select a Role')}</option>
              <For each={guildRoles()}>
                {(role) => {
                  return <option value={role.id}>{role.name}</option>
                }}
              </For>
            </select>
          </div>
        </Show>
      </AdminModal>

      <AdminModal title={t('dashboard.server.team_roles.edit_role_sync', 'Edit Role')} id="edit_role_modal">
        <Show when={!guildRoles.loading && !rolesSync.loading}>
          <div class="fieldset">
            <label class="label">
              <span>{t('dashboard.server.team_roles.role_name', 'Discord Role')}</span>
            </label>
            <select class="select" disabled>
              <option selected>{guildRoles().find((r) => r.id === selectRole().roleID)?.name}</option>
            </select>
          </div>
          <div class="fieldset">
            <label class="label">
              <span>{t('dashboard.server.team_roles.team_name', 'Team Name')}</span>
            </label>
            <input
              type="text"
              class="input"
              disabled={guildRoles.loading || rolesSync.loading}
              value={selectRole().teamName}
              onInput={(e) => {
                selectRole().teamName = e.currentTarget.value
              }}
            />
          </div>
          <div class="fieldset">
            <label class="label">
              <span>{t('dashboard.server.team_roles.enable_sync', 'Active')}</span>
            </label>
            <select
              class="select"
              disabled={guildRoles.loading || rolesSync.loading}
              value={selectRole().enable ? 'true' : 'false'}
              onChange={(e) => {
                selectRole().enable = e.currentTarget.value === 'true'
              }}
            >
              <option value="true">{t('dashboard.server.team_roles.yes', 'Yes')}</option>
              <option value="false">{t('dashboard.server.team_roles.no', 'No')}</option>
            </select>
          </div>
          <button
            disabled={guildRoles.loading || rolesSync.loading}
            class="btn btn-base-200 mt-2"
            onClick={async () => {
              // @ts-expect-error -- intentional: legacy typing gap
              edit_role_modal.close()
              editRole()
            }}
          >
            {t('dashboard.server.team_roles.save_changes', 'Save')}
          </button>
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
      >
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
                      <TextValue value={roleSync.teamName} />
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
                        <div
                          class="tooltip tooltip-info"
                          data-tip={t('dashboard.server.team_roles.edit_role_sync', 'Edit')}
                        >
                          <i
                            class="hover:cursor-pointer fa-solid fa-edit"
                            onClick={() => {
                              // @ts-expect-error -- intentional: legacy typing gap
                              edit_role_modal.showModal()
                              setSelectRole(roleSync)
                            }}
                          ></i>
                        </div>
                        <div
                          class="tooltip tooltip-error"
                          data-tip={t('dashboard.server.team_roles.delete_role_sync', 'Delete')}
                        >
                          <i
                            class="hover:cursor-pointer fa-solid fa-trash text-error"
                            onClick={() => deleteRole(roleSync.id)}
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
          <button
            class="btn btn-base-200"
            onClick={() => {
              // @ts-expect-error -- intentional: legacy typing gap
              select_role_modal.showModal()
            }}
            disabled={!premium()}
          >
            {t('dashboard.server.team_roles.add_role_sync', 'Add Team Role')}
          </button>
        </div>
      </AdminPanel>
    </>
  )
}

export default ServerTeam
