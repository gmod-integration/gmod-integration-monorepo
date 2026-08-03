import { Component, createEffect, createResource, createSignal, For, Match, Show, Switch } from 'solid-js'
import { guildRoles, guildRolesRefetch } from './GuildInformations'
import AdminPanel from '../../../components/AdminPanel'
import AdminModal from '../../../components/AdminModal'
import AdminChannelSelector from '../../../components/AdminChannelSelector'
import { useI18n } from '../../../i18n'
import DiscordRole from '../../../components/discord/DiscordRole'
import MissingRolePermission, { setRolesToCheck } from '../../../components/popup/MissingRolePermission'
import { BuyPremiumBtn } from '../../../utils/premium'
import { fetchAPI } from '../../../utils/api'

const fetchVerifyRoles = async () => {
  const res = await fetchAPI('/users/:discordID/guilds/:guildID/auto-roles', 'GET')
  if (!res.ok) {
    // Bug fix: was `return {}` - the result is always treated as an array below (`.map`,
    // `.find`, `<For each>`), and `{}` doesn't support those, so a non-ok response used to crash
    // the render the same way an error-state resource did (see fixes further down this file).
    return []
  }
  return await res.json()
}

const fetchNotVerifyRoles = async () => {
  const res = await fetchAPI('/users/:discordID/guilds/:guildID/verifications/roles/', 'GET')
  if (!res.ok) {
    return {}
  }
  return await res.json()
}

const GuildAutoRole: Component = () => {
  const [autoRoles, { mutate }] = createResource('verifyRole', fetchVerifyRoles)
  createEffect(() => {
    // Bug fix: also bail out on autoRoles.error - reading autoRoles() while errored re-throws.
    if (autoRoles.loading || autoRoles.error) return
    const roles = autoRoles().map((role) => role.roleID)
    setRolesToCheck(roles)
  })

  const [selectedRole, setSelectedRole] = createSignal({})
  const { t } = useI18n()

  const deleteAutoRole = async (role: string) => {
    const res = await fetchAPI(`/users/:discordID/guilds/:guildID/auto-roles/${role.roleID}`, 'DELETE')
    if (!res.ok) {
      return
    }
    mutate((prevVerifyRole) => (prevVerifyRole ? prevVerifyRole.filter((v) => v.roleID !== role.roleID) : []))
    return role
  }

  const createVerifyRole = async (roleID: string) => {
    const newLink = await fetchAPI(`/users/:discordID/guilds/:guildID/auto-roles/${roleID}`, 'POST')
    if (!newLink.ok) {
      return
    }
    const verifyRole = await newLink.json()
    mutate((prevVerifyRole) => (prevVerifyRole ? [...prevVerifyRole, verifyRole] : [verifyRole]))
    return verifyRole
  }

  // Bug fix: the Save button below called an `editVerifyRole` that was never defined anywhere in
  // this file (a leftover from copying GuildVerifications.tsx, which does define one), throwing a
  // ReferenceError. Added the missing function, mirroring the PUT-and-mutate pattern used by
  // deleteAutoRole/createVerifyRole above and by GuildVerifications.tsx's own editVerifyRole.
  const editVerifyRole = async (role: string) => {
    const res = await fetchAPI(`/users/:discordID/guilds/:guildID/auto-roles/${role.roleID}`, 'PUT', {
      enabled: role.enabled,
    })
    if (!res.ok) {
      return
    }
    const updatedRole = await res.json()
    mutate((prevVerifyRole) =>
      prevVerifyRole ? prevVerifyRole.map((v) => (v.roleID === updatedRole.roleID ? updatedRole : v)) : [],
    )
    return updatedRole
  }

  return (
    <>
      <MissingRolePermission />
      <AdminModal title={t('dashboard.guild.auto_role.modal_title', 'Select Role')} id="select_role_modal">
        {/* Bug fix: also gate on !autoRoles.error - autoRoles() is read unguarded below (via the
            <For each={guildRoles()}> body calling autoRoles().find(...)), so reading it while
            errored used to re-throw and crash the render (see the tbody fix further down). */}
        <Show
          when={!guildRoles.loading && !autoRoles.loading && !autoRoles.error}
          fallback={<div>{t('dashboard.guild.auto_role.loading', 'Loading...')}</div>}
        >
          <div class="fieldset">
            <select
              class="select"
              disabled={guildRoles.loading || autoRoles.loading}
              onchange="select_role_modal.close()"
              onChange={async (e) => {
                await createVerifyRole(e.currentTarget.value)
              }}
            >
              <option value="0">{t('dashboard.guild.auto_role.no_roles', 'Select a Role')}</option>
              <For each={guildRoles()}>
                {(role) => {
                  if (!autoRoles().find((v) => v.roleID === role.id)) {
                    return <option value={role.id}>{role.name}</option>
                  }
                }}
              </For>
            </select>
          </div>
        </Show>
      </AdminModal>

      <AdminChannelSelector id="select_channel_modal" />

      <AdminModal title={t('dashboard.guild.auto_role.modal_title', 'Edit Role')} id="edit_role_modal">
        <Show when={!guildRoles.loading && !autoRoles.loading}>
          <div class="fieldset">
            <label class="label">
              <span>{t('dashboard.guild.auto_role.role_name', 'Role')}</span>
            </label>
            <select class="select" disabled>
              <option selected>{guildRoles().find((r) => r.id === selectedRole().roleID)?.name}</option>
            </select>
          </div>
          <div class="fieldset">
            <label class="label">
              <span>{t('dashboard.guild.auto_role.modal_description', 'Active')}</span>
            </label>
            <select
              class="select"
              disabled={guildRoles.loading || autoRoles.loading}
              value={selectedRole().enabled ? 'true' : 'false'}
              onChange={(e) => {
                selectedRole().enabled = e.currentTarget.value === 'true'
              }}
            >
              <option value="true">{t('dashboard.guild.auto_role.yes', 'Yes')}</option>
              <option value="false">{t('dashboard.guild.auto_role.no', 'No')}</option>
            </select>
          </div>
          <button
            class="btn btn-base-200 mt-2"
            disabled={guildRoles.loading || autoRoles.loading}
            onclick="edit_role_modal.close()"
            onClick={async () => {
              await editVerifyRole(selectedRole())
            }}
          >
            {t('dashboard.guild.auto_role.save_button', 'Save')}
          </button>
        </Show>
      </AdminModal>

      <AdminPanel
        title={t('dashboard.guild.auto_role.title', 'Auto Roles')}
        description={t(
          'dashboard.guild.auto_role.description',
          'Here you can set roles to give by default for new members.',
        )}
        type="none"
      >
        <table class="table border-b border-base-300 rounded-none">
          <thead>
            <tr class="text-l">
              <th>{t('dashboard.guild.auto_role.role_name', 'Role')}</th>
              <th class="w-1/6 text-center">{t('dashboard.guild.auto_role.actions', 'Actions')}</th>
            </tr>
          </thead>
          <tbody>
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
                    <td>
                      <div class="flex gap-2 justify-center">
                        <div class="tooltip tooltip-error" data-tip={t('dashboard.guild.auto_role.delete', 'Delete')}>
                          <i
                            class="hover:cursor-pointer fa-solid fa-trash text-error"
                            onClick={() => deleteAutoRole(role)}
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

        <Switch>
          <Match when={autoRoles.loading}>
            <div class="flex justify-center h-36">
              <div class="loading loading-spinner loading-lg"></div>
            </div>
          </Match>
          <Match when={autoRoles.error}>
            <tr>
              <td colspan="4">{t('dashboard.guild.auto_role.failed_to_load', 'Failed to load the links')}</td>
            </tr>
          </Match>
        </Switch>

        <div class="flex gap-4 p-4">
          {/* Bug fix: subCondition below short-circuits before calling autoRoles() - this
              expression isn't wrapped in any loading/error Show at all, so reading autoRoles()
              while the resource is errored used to re-throw and crash the render (see the tbody
              fix above for the full explanation). */}
          <BuyPremiumBtn
            subCondition={!autoRoles.error && autoRoles()?.length < 3}
            btnText={t('dashboard.guild.auto_role.premium', 'Limited to 3 auto roles for free users.')}
            hidden={autoRoles.loading}
          >
            <button
              class="btn btn-base-200"
              onClick={() => {
                // @ts-expect-error -- intentional: legacy typing gap
                select_role_modal.showModal()
                guildRolesRefetch()
              }}
            >
              {t('dashboard.guild.auto_role.add_role', 'Add Role')}
            </button>
          </BuyPremiumBtn>
        </div>
      </AdminPanel>
    </>
  )
}

export default GuildAutoRole
