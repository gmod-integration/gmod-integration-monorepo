import { closeDialog, showDialog } from '../../../utils/dialog.js'
import { type Component, createEffect, createResource, createSignal, For, Show } from 'solid-js'
import { guildChannelsRefetch, guildRoles, guildRolesRefetch } from './GuildInformations'
import AdminPanel from '../../../components/AdminPanel'
import AdminModal from '../../../components/AdminModal'
import AdminRoleSelector from '../../../components/AdminRoleSelector.js'
import {
  Button,
  IconButton,
  FormActions,
  FormField,
  TableState,
  Icon,
  SettingGroup,
  SettingRow,
  AsyncState,
} from '../../../components/ui/index.js'
import { createAsyncAction } from '../../../hooks/createAsyncAction.js'
import AdminChannelSelector from '../../../components/AdminChannelSelector'
import { useI18n } from '../../../i18n'
import DiscordMessage from '../../../components/discord/DiscordMessage'
import DiscordRole from '../../../components/discord/DiscordRole'
import MissingRolePermission, { setRolesToCheck } from '../../../components/popup/MissingRolePermission'
import { BuyPremiumBtn, premium, PremiumBadge } from '../../../utils/premium'
import { fetchAPI } from '../../../utils/api'

type VerificationRole = { roleID: string; enabled: boolean; isGiveRole: boolean }

const fetchVerifyRoles = async (): Promise<VerificationRole[]> => {
  const res = await fetchAPI('/users/:discordID/guilds/:guildID/verifications/roles', 'GET')
  if (!res.ok) throw new Error('Role list request failed')
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
  const [verifyRoles, { mutate, refetch: refetchRoles }] = createResource('verifyRole', fetchVerifyRoles, {
    initialValue: [],
  })
  createEffect(() => {
    // Bug fix: was `const roles = verifyRoles(); if (roles) { if (roles.loading) return ... }` -
    // `roles.loading` checked the returned array/data, not the resource itself, so it was always
    // undefined and never actually short-circuited; worse, verifyRoles() was being called
    // unconditionally, which re-throws while the resource is in an error state. Check the
    // resource's own .loading/.error before reading it, same as the auto-roles effect above.
    if (verifyRoles.loading || verifyRoles.error) return
    const roles = verifyRoles()
    if (roles) {
      const rolesToCheck = roles.map((role) => role.roleID)
      setRolesToCheck(rolesToCheck)
    }
  })

  const [selectedRole, setSelectedRole] = createSignal<VerificationRole>({
    roleID: '',
    enabled: false,
    isGiveRole: true,
  })
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
  const editAction = createAsyncAction({ errorMessage: () => t('ui.save_error', 'Unable to save. Please try again.') })
  const dmAction = createAsyncAction({ errorMessage: () => t('ui.save_error', 'Unable to save. Please try again.') })
  const supportAction = createAsyncAction({
    errorMessage: () => t('ui.save_error', 'Unable to save. Please try again.'),
  })
  const [originalRole, setOriginalRole] = createSignal<VerificationRole>()
  const roleDirty = () =>
    !!originalRole() &&
    (selectedRole().isGiveRole !== originalRole()!.isGiveRole || selectedRole().enabled !== originalRole()!.enabled)
  const discardRole = () => {
    if (editAction.pending()) return
    if (originalRole()) setSelectedRole({ ...originalRole()! })
    editAction.reset()
  }

  async function deleteVerifyRole(role: VerificationRole) {
    const res = await fetchAPI(`/users/:discordID/guilds/:guildID/verifications/roles/${role.roleID}`, 'DELETE')
    if (!res.ok) {
      return
    }
    mutate((prevVerifyRole) => (prevVerifyRole ? prevVerifyRole.filter((v) => v.roleID !== role.roleID) : []))
    return role
  }

  async function editVerifyRole(role: VerificationRole) {
    const res = await fetchAPI(`/users/:discordID/guilds/:guildID/verifications/roles/${role.roleID}`, 'PUT', {
      isGiveRole: role.isGiveRole,
      enabled: role.enabled,
    })
    if (!res.ok) throw new Error('Role update failed')
    const updatedRole = await res.json()
    mutate((prevVerifyRole) =>
      prevVerifyRole ? prevVerifyRole.map((v) => (v.roleID === updatedRole.roleID ? updatedRole : v)) : [],
    )
    return updatedRole
  }

  async function createVerifyRole(roleID: string) {
    const newLink = await fetchAPI(`/users/:discordID/guilds/:guildID/verifications/roles/${roleID}`, 'POST')
    if (!newLink.ok) throw new Error('Role creation failed')
    const verifyRole = await newLink.json()
    mutate((prevVerifyRole) => (prevVerifyRole ? [...prevVerifyRole, verifyRole] : [verifyRole]))
    return verifyRole
  }

  async function sendVerificationMessage(channelID: string) {
    const res = await fetchAPI(`/users/:discordID/guilds/:guildID/verifications`, 'POST', {
      channelID,
    })
    if (!res.ok) {
      throw new Error('Channel update failed')
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
    if (verificationDontMP.loading || verificationDontMP.error || dmAction.pending() || !premium()) return
    const previous = { ...verificationDontMP() }
    const saved = await dmAction.run(async () => {
      const response = await fetchAPI(`/users/:discordID/guilds/:guildID/settings/verification_dont_mp`, 'PUT', {
        value,
      })
      if (!response.ok) throw new Error('Verification setting update failed')
      verificationDontMPMutate({ value })
    })
    if (!saved) verificationDontMPMutate(previous)
  }

  async function editVerificationDontJoinSupport(value: boolean) {
    if (
      verificationDontJoinSupport.loading ||
      verificationDontJoinSupport.error ||
      supportAction.pending() ||
      !premium()
    )
      return
    const previous = { ...verificationDontJoinSupport() }
    const saved = await supportAction.run(async () => {
      const response = await fetchAPI(
        `/users/:discordID/guilds/:guildID/settings/verification_dont_join_support`,
        'PUT',
        {
          value,
        },
      )
      if (!response.ok) throw new Error('Verification setting update failed')
      verificationDontJoinSupportMutate({ value })
    })
    if (!saved) verificationDontJoinSupportMutate(previous)
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
        title={t('dashboard.guild.verification.select_role_modal_title', 'Select Role')}
        roles={
          !guildRoles.loading && !guildRoles.error && !verifyRoles.loading && !verifyRoles.error
            ? guildRoles().filter((role) => !verifyRoles().some((existing) => existing.roleID === role.id))
            : []
        }
        loading={guildRoles.loading || verifyRoles.loading}
        error={guildRoles.error || verifyRoles.error}
        loadingLabel={t('dashboard.guild.verification.loading', 'Loading...')}
        onConfirm={createVerifyRole}
      />

      <AdminChannelSelector id="select_channel_modal" callback={sendVerificationMessage} />

      <AdminModal
        title={t('dashboard.guild.verification.edit_role_modal_title', 'Edit Role')}
        id="edit_role_modal"
        busy={editAction.pending()}
        onClose={discardRole}
        onCancel={discardRole}
      >
        <Show when={!guildRoles.loading && !guildRoles.error && !verifyRoles.loading && !verifyRoles.error}>
          <FormField id="guildverifications-field-0" label={t('dashboard.guild.verification.role_label', 'Role')}>
            <select id="guildverifications-field-0" class="select" disabled>
              <option selected>{guildRoles().find((r) => r.id === selectedRole().roleID)?.name}</option>
            </select>
          </FormField>
          <FormField
            id="guildverifications-field-1"
            label={t('dashboard.guild.verification.action_on_verification_label', 'Action on Verification')}
          >
            <select
              id="guildverifications-field-1"
              class="select"
              disabled={guildRoles.loading || verifyRoles.loading || editAction.pending()}
              value={selectedRole().isGiveRole ? 'true' : 'false'}
              onChange={(e) => {
                setSelectedRole((previous) => ({ ...previous, isGiveRole: e.currentTarget.value === 'true' }))
              }}
            >
              <option value="true">{t('dashboard.guild.verification.give_role', 'Give Role')}</option>
              <option value="false">{t('dashboard.guild.verification.remove_role', 'Remove Role')}</option>
            </select>
          </FormField>
          <FormField id="guildverifications-field-2" label={t('dashboard.guild.verification.active_label', 'Active')}>
            <select
              id="guildverifications-field-2"
              class="select"
              disabled={guildRoles.loading || verifyRoles.loading || editAction.pending()}
              value={selectedRole().enabled ? 'true' : 'false'}
              onChange={(e) => {
                setSelectedRole((previous) => ({ ...previous, enabled: e.currentTarget.value === 'true' }))
              }}
            >
              <option value="true">{t('dashboard.guild.verification.yes', 'Yes')}</option>
              <option value="false">{t('dashboard.guild.verification.no', 'No')}</option>
            </select>
          </FormField>
          <FormActions
            dirty={roleDirty()}
            pending={editAction.pending()}
            disabled={guildRoles.loading || !!guildRoles.error || verifyRoles.loading || !!verifyRoles.error}
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
        title={t('dashboard.guild.verification.verification_panel_title', 'Verification')}
        description={t(
          'dashboard.guild.verification.verification_panel_description',
          'Set up the verification system for your server, and choose role to give / remove when a user is verified.',
        )}
        icon="shield-check"
        type="none"
      >
        <SettingGroup
          title={t('settings.verification_message', 'Verification entry point')}
          description={t(
            'settings.verification_message_hint',
            'Publish the message members use to link their accounts in a Discord channel.',
          )}
          icon="send"
        >
          <SettingRow title={t('dashboard.guild.verification.verification_message_label', 'Verification Message:')}>
            <AsyncState loading={verifyMessage.loading} error={verifyMessage.error}>
              <Show when={!verifyMessage.loading && !verifyMessage.error}>
                <div class="flex flex-wrap items-center gap-3">
                  <Show
                    when={verifyMessage().messageID}
                    fallback={
                      <span class="text-base-content/60">
                        {t('dashboard.guild.verification.no_verification_message', 'No verification message')}
                      </span>
                    }
                  >
                    <DiscordMessage channelID={verifyMessage().channelID} messageID={verifyMessage().messageID} />
                  </Show>
                  <Show
                    when={!verifyMessage().messageID}
                    fallback={
                      <Button variant="danger" onClick={() => void deleteVerificationMessage()}>
                        {t(
                          'dashboard.guild.verification.delete_verification_message_button',
                          'Delete Verification Message',
                        )}
                      </Button>
                    }
                  >
                    <Button
                      variant="primary"
                      onClick={() => {
                        showDialog('select_channel_modal')
                        guildChannelsRefetch()
                      }}
                    >
                      {t('dashboard.guild.verification.send_verification_message_button', 'Send Verification Message')}
                    </Button>
                  </Show>
                </div>
              </Show>
            </AsyncState>
          </SettingRow>
        </SettingGroup>
        <SettingGroup
          title={t('settings.verification_preferences', 'Member experience')}
          description={t('ui.autosave', 'Changes are saved automatically.')}
          icon="user-round"
        >
          <Show when={!verificationDontMP.loading && !verificationDontMP.error}>
            <SettingRow
              controlId="verification-dm"
              title={t(
                'dashboard.guild.verification.dont_send_verification_message_label',
                "Don't send verification message in DM",
              )}
              feedback={
                <>
                  <Show when={dmAction.error()}>
                    <p id="verification-dm-error" role="alert" class="text-sm text-error">
                      {dmAction.error()}
                    </p>
                  </Show>
                  <Show when={dmAction.pending() || dmAction.success()}>
                    <p role="status" class="text-sm text-base-content/65">
                      {dmAction.pending() ? t('ui.loading', 'Loading…') : t('ui.saved', 'Saved')}
                    </p>
                  </Show>
                </>
              }
            >
              <div class="flex items-center gap-3">
                <PremiumBadge onlyIcon />
                <input
                  id="verification-dm"
                  type="checkbox"
                  class="toggle toggle-md"
                  disabled={!premium() || dmAction.pending()}
                  aria-busy={dmAction.pending() || undefined}
                  aria-invalid={!!dmAction.error()}
                  aria-describedby={dmAction.error() ? 'verification-dm-error' : undefined}
                  checked={verificationDontMP()?.value ?? false}
                  onChange={(event) => void editVerificationDontMP(event.currentTarget.checked)}
                />
              </div>
            </SettingRow>
          </Show>
          <Show when={verificationDontMP.error}>
            <p role="alert" class="p-4 text-error">
              {t('ui.load_error', 'Unable to load this content.')}
            </p>
          </Show>
          <Show when={!verificationDontJoinSupport.loading && !verificationDontJoinSupport.error}>
            <SettingRow
              controlId="verification-support"
              title={t(
                'dashboard.guild.verification.dont_join_support_guild_message_label',
                "Don't made user automatically join support guild",
              )}
              feedback={
                <>
                  <Show when={supportAction.error()}>
                    <p id="verification-support-error" role="alert" class="text-sm text-error">
                      {supportAction.error()}
                    </p>
                  </Show>
                  <Show when={supportAction.pending() || supportAction.success()}>
                    <p role="status" class="text-sm text-base-content/65">
                      {supportAction.pending() ? t('ui.loading', 'Loading…') : t('ui.saved', 'Saved')}
                    </p>
                  </Show>
                </>
              }
            >
              <div class="flex items-center gap-3">
                <PremiumBadge onlyIcon />
                <input
                  id="verification-support"
                  type="checkbox"
                  class="toggle toggle-md"
                  disabled={!premium() || supportAction.pending()}
                  aria-busy={supportAction.pending() || undefined}
                  aria-invalid={!!supportAction.error()}
                  aria-describedby={supportAction.error() ? 'verification-support-error' : undefined}
                  checked={verificationDontJoinSupport()?.value ?? false}
                  onChange={(event) => void editVerificationDontJoinSupport(event.currentTarget.checked)}
                />
              </div>
            </SettingRow>
          </Show>
          <Show when={verificationDontJoinSupport.error}>
            <p role="alert" class="p-4 text-error">
              {t('ui.load_error', 'Unable to load this content.')}
            </p>
          </Show>
        </SettingGroup>
      </AdminPanel>

      <AdminPanel
        title={t('dashboard.guild.verification.verification_roles_panel_title', 'Verification Roles')}
        description={t(
          'dashboard.guild.verification.verification_roles_panel_description',
          'Here you can set up the roles that will be given or removed when a user is verified.',
        )}
        type="none"
        icon="users"
        actions={
          <>
            {/* Bug fix: subCondition below short-circuits before calling verifyRoles() - this
              expression isn't wrapped in any loading/error Show at all, so reading verifyRoles()
              while the resource is errored used to re-throw and crash the render (see the tbody
              fix above for the full explanation). */}
            <BuyPremiumBtn
              subCondition={!verifyRoles.error && verifyRoles()?.length < 2}
              btnText={t('dashboard.guild.verification.premium_limit', 'Limited to 2 roles for free users.')}
              hidden={verifyRoles.loading}
            >
              <Button
                variant="primary"
                disabled={verifyRoles.loading || !!verifyRoles.error || guildRoles.loading || !!guildRoles.error}
                onClick={() => {
                  showDialog('select_role_modal')
                  guildRolesRefetch()
                }}
              >
                {t('dashboard.guild.verification.add_role_button', 'Add Role')}
              </Button>
            </BuyPremiumBtn>
          </>
        }
        footer={
          <SettingRow
            title={t('settings.verification_existing_members', 'Existing members')}
            description={t(
              'dashboard.guild.verification.check',
              'Check all members and execute the verification process. 1000 members max.',
            )}
          >
            <Button
              variant="warning"
              disabled={lastVerify.loading || !!lastVerify.error || lastVerify() === false}
              onClick={async () => {
                const res = await fetchAPI('/users/:discordID/guilds/:guildID/verifications/check', 'POST')
                if (res.ok) lastVerifyMutate(false)
              }}
            >
              {t('dashboard.guild.verification.check_button', 'Check All Roles')}
            </Button>
          </SettingRow>
        }
      >
        <div class="min-w-0 w-full overflow-x-auto">
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
              <TableState
                colSpan={4}
                loading={verifyRoles.loading}
                error={verifyRoles.error}
                empty={!verifyRoles.loading && !verifyRoles.error && verifyRoles().length === 0}
                errorLabel={t('ui.load_error', 'Unable to load this content.')}
                onRetry={() => void refetchRoles()}
              />
              {/* Bug fix: also gate on !verifyRoles.error - `verifyRoles()` is read unguarded below
                (via <For each={verifyRoles()}>), and reading a resource accessor while it's in an
                error state re-throws that error, which crashed the render (leaving it stuck on
                the loading state forever) and made the `Match when={verifyRoles.error}` message
                below unreachable. Mirrors the same fix already applied to ServerPlayers.tsx. */}
              <Show when={!verifyRoles.loading && !verifyRoles.error}>
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
                            <Icon name="check" class="text-success" />
                          ) : (
                            <Icon name="x" class="text-error" />
                          )}
                        </div>
                      </td>
                      <td>
                        <div class="flex gap-2 justify-center">
                          <IconButton
                            label={t('dashboard.guild.verification.edit_tooltip', 'Edit')}
                            icon="pencil"
                            disabled={editAction.pending()}
                            onClick={() => {
                              showDialog('edit_role_modal')
                              setSelectedRole({ ...role })
                              setOriginalRole({ ...role })
                              editAction.reset()
                            }}
                          />
                          <IconButton
                            label={t('dashboard.guild.verification.delete_tooltip', 'Delete')}
                            icon="trash-2"
                            variant="danger"
                            disabled={editAction.pending()}
                            onClick={() => deleteVerifyRole(role)}
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

export default GuildVerification
