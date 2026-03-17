import { Component, createEffect, createResource, createSignal, For, Match, Show, Switch } from 'solid-js'
import { guildChannelsRefetch, guildRoles, guildRolesRefetch } from './GuildInformations'
import AdminPanel from '../../../components/AdminPanel'
import AdminModal from '../../../components/AdminModal'
import AdminChannelSelector from '../../../components/AdminChannelSelector'
import { useI18n } from '../../../i18n'
import DiscordMessage from '../../../components/discord/DiscordMessage'
import DiscordRole from '../../../components/discord/DiscordRole'
import MissingRolePermission, { setRolesToCheck } from '../../../components/popup/MissingRolePermission'
import { BuyPremiumBtn, premium, PremiumBadge } from '../../../utils/premium'
import { fetchAPI } from '../../../utils/api'

const fetchVerifyRoles = async () => {
  const res = await fetchAPI('/users/:discordID/guilds/:guildID/verifications/roles', 'GET')
  if (!res.ok) {
    return {}
  }
  return await res.json()
}

const fetchVerifyMessage = async () => {
  const res = await fetchAPI('/users/:discordID/guilds/:guildID/verifications', 'GET')
  if (!res.ok) {
    return {}
  }
  return await res.json()
}

const fetchVerificationDontMP = async () => {
  const res = await fetchAPI('/users/:discordID/guilds/:guildID/settings/verification_dont_mp', 'GET')
  if (!res.ok) {
    return {}
  }
  return await res.json()
}

const fetchVerificationDontJoinSupport = async () => {
  const res = await fetchAPI('/users/:discordID/guilds/:guildID/settings/verification_dont_join_support', 'GET')
  if (!res.ok) {
    return {}
  }
  return await res.json()
}

const fetchLastVerify = async () => {
  const res = await fetchAPI('/users/:discordID/guilds/:guildID/verifications/check', 'GET')
  if (!res.ok) {
    return {}
  }
  return await res.json()
}

const GuildVerification: Component = () => {
  const [verifyRoles, { mutate }] = createResource('verifyRole', fetchVerifyRoles)
  createEffect(() => {
    const roles = verifyRoles()
    if (roles) {
      if (roles.loading) return
      const rolesToCheck = roles.map((role) => role.roleID)
      setRolesToCheck(rolesToCheck)
    }
  })

  const [selectedRole, setSelectedRole] = createSignal({})
  const [verifyMessage, { mutate: verifyMessageMutate }] = createResource('verifyMessage', fetchVerifyMessage)
  const [lastVerify, { mutate: lastVerifyMutate }] = createResource('lastVerify', fetchLastVerify)
  const [verificationDontMP, { mutate: verificationDontMPMutate }] = createResource(
    'verificationDontMP',
    fetchVerificationDontMP,
  )
  const [verificationDontJoinSupport, { mutate: verificationDontJoinSupportMutate }] = createResource(
    'verificationDontJoinSupport',
    fetchVerificationDontJoinSupport,
  )

  const { t } = useI18n()

  async function deleteVerifyRole(role: string) {
    const res = await fetchAPI(`/users/:discordID/guilds/:guildID/verifications/roles/${role.roleID}`, 'DELETE')
    if (!res.ok) {
      return
    }
    mutate((prevVerifyRole) => (prevVerifyRole ? prevVerifyRole.filter((v) => v.roleID !== role.roleID) : []))
    return role
  }

  async function editVerifyRole(role: string) {
    const res = await fetchAPI(`/users/:discordID/guilds/:guildID/verifications/roles/${role.roleID}`, 'PUT', {
      isGiveRole: role.isGiveRole,
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

  async function createVerifyRole(roleID: string) {
    const newLink = await fetchAPI(`/users/:discordID/guilds/:guildID/verifications/roles/${roleID}`, 'POST')
    if (!newLink.ok) {
      return
    }
    const verifyRole = await newLink.json()
    mutate((prevVerifyRole) => (prevVerifyRole ? [...prevVerifyRole, verifyRole] : [verifyRole]))
    return verifyRole
  }

  async function sendVerificationMessage(channelID: string) {
    const res = await fetchAPI(`/users/:discordID/guilds/:guildID/verifications`, 'POST', {
      channelID,
    })
    if (!res.ok) {
      return
    }
    const verificationMessage = await res.json()
    verifyMessageMutate(verificationMessage)
    return verificationMessage
  }

  async function deleteVerificationMessage() {
    const res = await fetchAPI(`/users/:discordID/guilds/:guildID/verifications`, 'DELETE')
    if (!res.ok) {
      return
    }
    verifyMessageMutate({})
    return {}
  }

  async function editVerificationDontMP(value: boolean) {
    const res = await fetchAPI(`/users/:discordID/guilds/:guildID/settings/verification_dont_mp`, 'PUT', {
      value,
    })
    if (!res.ok) {
      verificationDontMPMutate({})
    }
  }

  async function editVerificationDontJoinSupport(value: boolean) {
    const res = await fetchAPI(`/users/:discordID/guilds/:guildID/settings/verification_dont_join_support`, 'PUT', {
      value,
    })
    if (!res.ok) {
      verificationDontJoinSupportMutate({})
    }
  }

  return (
    <>
      <MissingRolePermission />
      <AdminModal
        title={t('dashboard.guild.verification.select_role_modal_title', 'Select Role')}
        id="select_role_modal"
      >
        <Show
          when={!guildRoles.loading && !verifyRoles.loading}
          fallback={<div>{t('dashboard.guild.verification.loading', 'Loading...')}</div>}
        >
          <div class="fieldset">
            <select
              class="select"
              disabled={guildRoles.loading || verifyRoles.loading}
              onchange="select_role_modal.close()"
              onChange={async (e) => {
                await createVerifyRole(e.currentTarget.value)
              }}
            >
              <option value="0">{t('dashboard.guild.verification.select_role', 'Select a Role')}</option>
              <For each={guildRoles()}>
                {(role) => {
                  if (!verifyRoles().find((v) => v.roleID === role.id)) {
                    return <option value={role.id}>{role.name}</option>
                  }
                }}
              </For>
            </select>
          </div>
        </Show>
      </AdminModal>

      <AdminChannelSelector id="select_channel_modal" callback={sendVerificationMessage} />

      <AdminModal title={t('dashboard.guild.verification.edit_role_modal_title', 'Edit Role')} id="edit_role_modal">
        <Show when={!guildRoles.loading && !verifyRoles.loading}>
          <div class="fieldset">
            <label class="label">
              <span>{t('dashboard.guild.verification.role_label', 'Role')}</span>
            </label>
            <select class="select" disabled>
              <option selected>{guildRoles().find((r) => r.id === selectedRole().roleID)?.name}</option>
            </select>
          </div>
          <div class="fieldset">
            <label class="label">
              <span>{t('dashboard.guild.verification.action_on_verification_label', 'Action on Verification')}</span>
            </label>
            <select
              class="select"
              disabled={guildRoles.loading || verifyRoles.loading}
              value={selectedRole().isGiveRole ? 'true' : 'false'}
              onChange={(e) => {
                selectedRole().isGiveRole = e.currentTarget.value === 'true'
              }}
            >
              <option value="true">{t('dashboard.guild.verification.give_role', 'Give Role')}</option>
              <option value="false">{t('dashboard.guild.verification.remove_role', 'Remove Role')}</option>
            </select>
          </div>
          <div class="fieldset">
            <label class="label">
              <span>{t('dashboard.guild.verification.active_label', 'Active')}</span>
            </label>
            <select
              class="select"
              disabled={guildRoles.loading || verifyRoles.loading}
              value={selectedRole().enabled ? 'true' : 'false'}
              onChange={(e) => {
                selectedRole().enabled = e.currentTarget.value === 'true'
              }}
            >
              <option value="true">{t('dashboard.guild.verification.yes', 'Yes')}</option>
              <option value="false">{t('dashboard.guild.verification.no', 'No')}</option>
            </select>
          </div>
          <button
            disabled={guildRoles.loading || verifyRoles.loading}
            class="btn btn-base-200 mt-2"
            onclick="edit_role_modal.close()"
            onClick={async () => {
              await editVerifyRole(selectedRole())
            }}
          >
            {t('dashboard.guild.verification.save_button', 'Save')}
          </button>
        </Show>
      </AdminModal>

      <AdminPanel
        title={t('dashboard.guild.verification.verification_panel_title', 'Verification')}
        description={t(
          'dashboard.guild.verification.verification_panel_description',
          'Set up the verification system for your server, and choose role to give / remove when a user is verified.',
        )}
      >
        <div class="flex w-fit items-center">
          <span class="mr-2">
            {t('dashboard.guild.verification.verification_message_label', 'Verification Message:')}
          </span>
          <Show
            when={!verifyMessage.loading && verifyMessage().messageID}
            fallback={
              <span>{t('dashboard.guild.verification.no_verification_message', 'No verification message')}</span>
            }
          >
            <DiscordMessage channelID={verifyMessage().channelID} messageID={verifyMessage().messageID} />
          </Show>
        </div>
        <Show when={!verificationDontMP.loading}>
          <div class="flex w-fit items-center">
            <PremiumBadge onlyIcon={true} />
            <span class="mr-2">
              {t(
                'dashboard.guild.verification.dont_send_verification_message_label',
                "Don't send verification message in DM",
              )}
              :
            </span>
            <input
              type="checkbox"
              class="toggle toggle || verificationDontMP.loading-md"
              disabled={!premium()}
              checked={verificationDontMP() ? verificationDontMP().value : false}
              onChange={async (e) => {
                await editVerificationDontMP(e.currentTarget.checked)
              }}
            />
          </div>
        </Show>
        <Show when={!verificationDontJoinSupport.loading}>
          <div class="flex w-fit items-center">
            <PremiumBadge onlyIcon={true} />
            <span class="mr-2">
              {t(
                'dashboard.guild.verification.dont_join_support_guild_message_label',
                "Don't made user automatically join support guild",
              )}
              :
            </span>
            <input
              type="checkbox"
              class="toggle toggle || verificationDontJoinSupport.loading-md"
              disabled={!premium()}
              checked={verificationDontJoinSupport() ? verificationDontJoinSupport().value : false}
              onChange={async (e) => {
                await editVerificationDontJoinSupport(e.currentTarget.checked)
              }}
            />
          </div>
        </Show>
        <div class="flex gap-4">
          <Show when={verifyMessage.loading || !verifyMessage().messageID}>
            <button
              class="btn btn-base-200"
              onClick={() => {
                // @ts-ignore
                select_channel_modal.showModal()
                guildChannelsRefetch()
              }}
            >
              {t('dashboard.guild.verification.send_verification_message_button', 'Send Verification Message')}
            </button>
          </Show>
          <Show when={!verifyMessage.loading && verifyMessage().messageID}>
            <button
              class="btn btn-warning"
              onClick={async () => {
                await deleteVerificationMessage()
              }}
            >
              {t('dashboard.guild.verification.delete_verification_message_button', 'Delete Verification Message')}
            </button>
          </Show>
          <button
            class={`btn btn-warning tooltip tooltip-info ${lastVerify.loading || lastVerify() === false ? 'btn-disabled' : ''}`}
            data-tip={t(
              'dashboard.guild.verification.check',
              'Check all members and execute the verification process. 1000 members max.',
            )}
            onClick={async () => {
              const res = await fetchAPI(`/users/:discordID/guilds/:guildID/verifications/check`, 'POST')
              if (!res.ok) {
                return
              }
              //   set to false
              lastVerifyMutate(false)
            }}
          >
            {t('dashboard.guild.verification.check_button', 'Check All Roles')}
          </button>
        </div>
      </AdminPanel>

      <AdminPanel
        title={t('dashboard.guild.verification.verification_roles_panel_title', 'Verification Roles')}
        description={t(
          'dashboard.guild.verification.verification_roles_panel_description',
          'Here you can set up the roles that will be given or removed when a user is verified.',
        )}
        type="none"
      >
        <table class="table border-b border-base-300 rounded-none">
          <thead>
            <tr class="text-l">
              <th>{t('dashboard.guild.verification.role_column', 'Role')}</th>
              <th>{t('dashboard.guild.verification.action_on_verification_column', 'Action on Verification')}</th>
              <th class="w-1/6 text-center">{t('dashboard.guild.verification.active_column', 'Active')}</th>
              <th class="w-1/6 text-center">{t('dashboard.guild.verification.actions_column', 'Actions')}</th>
            </tr>
          </thead>
          <tbody>
            <Show when={!verifyRoles.loading}>
              <For each={verifyRoles()}>
                {(role) => (
                  <tr>
                    <td>
                      <DiscordRole roleID={role.roleID} />
                    </td>
                    <td>
                      {role.isGiveRole
                        ? t('dashboard.guild.verification.give_role', 'Give Role')
                        : t('dashboard.guild.verification.remove_role', 'Remove Role')}
                    </td>
                    <td>
                      <div class="flex gap-2 justify-center">
                        {role.enabled ? (
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
                          data-tip={t('dashboard.guild.verification.edit_tooltip', 'Edit')}
                        >
                          <i
                            class="hover:cursor-pointer fa-solid fa-edit"
                            onClick={() => {
                              // @ts-ignore
                              edit_role_modal.showModal()
                              setSelectedRole(role)
                            }}
                          ></i>
                        </div>
                        <div
                          class="tooltip tooltip-error"
                          data-tip={t('dashboard.guild.verification.delete_tooltip', 'Delete')}
                        >
                          <i
                            class="hover:cursor-pointer fa-solid fa-trash text-error"
                            onClick={() => deleteVerifyRole(role)}
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
          <Match when={verifyRoles.loading}>
            <div class="flex justify-center h-36">
              <div class="loading loading-spinner loading-lg"></div>
            </div>
          </Match>
          <Match when={verifyRoles.error}>
            <tr>
              <td colspan="4">{t('dashboard.guild.verification.failed_to_load_links', 'Failed to load the links')}</td>
            </tr>
          </Match>
        </Switch>

        <div class="flex gap-4 p-4">
          <BuyPremiumBtn
            subCondition={verifyRoles()?.length < 2}
            btnText={t('dashboard.guild.verification.premium_limit', 'Limited to 2 roles for free users.')}
            hidden={verifyRoles.loading}
          >
            <button
              class="btn btn-base-200"
              onClick={() => {
                // @ts-ignore
                select_role_modal.showModal()
                guildRolesRefetch()
              }}
            >
              {t('dashboard.guild.verification.add_role_button', 'Add Role')}
            </button>
          </BuyPremiumBtn>
        </div>
      </AdminPanel>
    </>
  )
}

export default GuildVerification

function mutate(arg0: (prevVerifyRole: any) => any[]) {
  throw new Error('Function not implemented.')
}
