import Pagination from '../../../components/Pagination.js'
import { createListPagination } from '../../../hooks/createListPagination.js'
import { FeatureGate, SuspendedFeature } from '../../../components/FeatureGate.js'
import { useFeatureAccess } from '../../../components/AccessProvider.js'
import { GuildRolesState, retainGuildRoleSelection } from '../../../components/GuildRolesState.js'
import { closeDialog, showDialog } from '../../../utils/dialog.js'
import { type Component, createEffect, createResource, createSignal, For, on, Show } from 'solid-js'
import { guildChannels, guildChannelsRefetch, guildRoles, guildRolesRefetch } from './GuildInformations.js'
import AdminPanel from '../../../components/AdminPanel.js'
import AdminModal from '../../../components/AdminModal.js'
import ConfirmActionDialog from '../../../components/ConfirmActionDialog.js'
import {
  BooleanStatus,
  Button,
  IconButton,
  FormActions,
  FormField,
  TableState,
  SettingRow,
  AsyncState,
  AutosaveFeedback,
} from '../../../components/ui/index.js'
import { createDraftForm } from '../../../hooks/createDraftForm.js'
import { createAutosave } from '../../../hooks/createAutosave.js'
import { saveDashboardSettings } from '../../../utils/dashboardSettings.js'
import AdminChannelSelector from '../../../components/AdminChannelSelector.js'
import { useI18n } from '../../../i18n.js'
import DiscordMessage from '../../../components/discord/DiscordMessage.js'
import DiscordRole from '../../../components/discord/DiscordRole.js'
import MissingRolePermission, { setRolesToCheck } from '../../../components/popup/MissingRolePermission.js'
import { PremiumBadge } from '../../../utils/premium.js'
import { fetchAPI } from '../../../utils/api.js'
import { getGuild } from '../../../utils/utils.js'

type VerificationRole = { roleID: string; enabled: boolean; isGiveRole: boolean }
type VerificationMessage = { messageID?: string; channelID?: string }
type Preferences = { verification_dont_mp: boolean; verification_dont_join_support: boolean }
const VERIFICATIONS_URL = '/users/:discordID/guilds/:guildID/verifications'
const emptyRole = (): VerificationRole => ({ roleID: '', enabled: true, isGiveRole: true })

async function readJSON<T>(url: string): Promise<T> {
  const response = await fetchAPI(url, 'GET')
  if (!response.ok) throw new Error('Verification request failed')
  return await response.json()
}

const GuildVerification: Component = () => {
  const { t } = useI18n()
  const quotaAccess = useFeatureAccess('verification.roles')
  const preferenceAccess = useFeatureAccess('verification.preferences')
  const [verifyRoles, { mutate, refetch: refetchRoles }] = createResource(
    () => readJSON<VerificationRole[]>(`${VERIFICATIONS_URL}/roles`),
    { initialValue: [] },
  )
  const [verifyMessage, { mutate: verifyMessageMutate, refetch: refetchMessage }] = createResource(() =>
    readJSON<VerificationMessage>(VERIFICATIONS_URL),
  )
  const [lastVerify, { mutate: lastVerifyMutate }] = createResource(() =>
    readJSON<boolean>(`${VERIFICATIONS_URL}/check`),
  )
  const [preferences, { refetch: refetchPreferences }] = createResource(async (): Promise<Preferences> => {
    const [dm, support] = await Promise.all([
      readJSON<{ value: boolean }>('/users/:discordID/guilds/:guildID/settings/verification_dont_mp'),
      readJSON<{ value: boolean }>('/users/:discordID/guilds/:guildID/settings/verification_dont_join_support'),
    ])
    return { verification_dont_mp: dm.value === true, verification_dont_join_support: support.value === true }
  })
  const [syncPending, setSyncPending] = createSignal(false)
  const prefs = createDraftForm<Preferences>({
    allowPendingEdits: true,
    initial: { verification_dont_mp: false, verification_dont_join_support: false },
    errorMessage: () => t('ui.save_error', 'Unable to save. Please try again.'),
  })
  createEffect(
    on(
      () => (!preferences.loading && !preferences.error ? preferences() : undefined),
      (value) => {
        if (value) prefs.reset(value)
      },
    ),
  )
  const preferencesUnavailable = () => preferences.loading || !!preferences.error
  async function savePreferences() {
    if (
      preferencesUnavailable() ||
      (!preferenceAccess.allowed() &&
        Object.entries(prefs.draft()).some(
          ([key, value]) => value && value !== prefs.saved()[key as keyof Preferences],
        ))
    )
      return
    await prefs.save(async (draft) => {
      const changed = Object.fromEntries(
        Object.entries(draft).filter(([key, value]) => value !== prefs.saved()[key as keyof Preferences]),
      )
      const result = await saveDashboardSettings('guild', changed)
      setSyncPending(result.sync === 'pending')
      return { ...draft, ...result.settings } as Preferences
    })
  }

  const preferencesAutosave = createAutosave({
    form: prefs,
    save: savePreferences,
    enabled: () =>
      !preferencesUnavailable() &&
      (preferenceAccess.allowed() ||
        !Object.entries(prefs.draft()).some(
          ([key, value]) => value && value !== prefs.saved()[key as keyof Preferences],
        )),
  })

  const [editingRoleID, setEditingRoleID] = createSignal('')
  const roleForm = createDraftForm<VerificationRole>({
    initial: emptyRole(),
    errorMessage: () => t('ui.save_error', 'Unable to save. Please try again.'),
    validate: (draft) => ({
      roleID:
        draft.roleID &&
        !guildRoles.loading &&
        !guildRoles.error &&
        guildRoles().some((role) => role.id === draft.roleID)
          ? undefined
          : t('ui.invalid_value', 'Enter a valid value.'),
    }),
  })
  const selectedRole = roleForm.draft
  const availableRoles = () =>
    !guildRoles.loading && !guildRoles.error && !verifyRoles.loading && !verifyRoles.error
      ? guildRoles().filter(
          (role) => role.id === editingRoleID() || !verifyRoles().some((existing) => existing.roleID === role.id),
        )
      : []
  const roleName = (roleID: string) =>
    !guildRoles.loading && !guildRoles.error
      ? (guildRoles().find((role) => role.id === roleID)?.name ?? roleID)
      : roleID
  const channelName = (channelID: string) =>
    !guildChannels.loading && !guildChannels.error
      ? (guildChannels().find((channel) => channel.id === channelID)?.name ?? channelID)
      : channelID
  const [deleteRoleTarget, setDeleteRoleTarget] = createSignal<VerificationRole>()
  const [publishTarget, setPublishTarget] = createSignal('')
  const openRole = (role?: VerificationRole) => {
    if (roleForm.pending() || (!role && !quotaAccess.canCreate(verifyRoles().length))) return
    setEditingRoleID(role?.roleID ?? '')
    roleForm.reset(role ?? emptyRole())
    showDialog('edit_role_modal')
    if (!role) void guildRolesRefetch()
  }
  async function saveRole() {
    if (
      verifyRoles.loading ||
      verifyRoles.error ||
      guildRoles.loading ||
      guildRoles.error ||
      (!editingRoleID() && !quotaAccess.canCreate(verifyRoles().length))
    )
      return
    if (
      await roleForm.save(async (draft) => {
        const response = await fetchAPI(
          `${VERIFICATIONS_URL}/roles/${draft.roleID}`,
          editingRoleID() ? 'PUT' : 'POST',
          {
            isGiveRole: draft.isGiveRole,
            enabled: draft.enabled,
          },
        )
        if (!response.ok) throw new Error('Verification role save failed')
        const updated: VerificationRole = await response.json()
        mutate((previous) =>
          editingRoleID()
            ? previous.map((role) => (role.roleID === updated.roleID ? updated : role))
            : [...previous, updated],
        )
        if (!editingRoleID()) pagination.onChange({ ...pagination.query(), offset: pagination.total() - 1 })
        return updated
      })
    )
      closeDialog('edit_role_modal')
  }
  async function deleteVerifyRole() {
    const target = deleteRoleTarget()
    if (!target) return
    const response = await fetchAPI(`${VERIFICATIONS_URL}/roles/${target.roleID}`, 'DELETE')
    if (!response.ok) throw new Error('Verification role deletion failed')
    mutate((previous) => previous.filter((role) => role.roleID !== target.roleID))
  }
  async function sendVerificationMessage() {
    const response = await fetchAPI(VERIFICATIONS_URL, 'POST', { channelID: publishTarget() })
    if (!response.ok) throw new Error('Verification publication failed')
    verifyMessageMutate(await response.json())
  }
  async function deleteVerificationMessage() {
    const response = await fetchAPI(VERIFICATIONS_URL, 'DELETE')
    if (!response.ok) throw new Error('Verification message deletion failed')
    verifyMessageMutate({})
  }
  async function checkAllRoles() {
    if (lastVerify.loading || lastVerify.error || lastVerify() === false) return
    const response = await fetchAPI(`${VERIFICATIONS_URL}/check`, 'POST')
    if (!response.ok) throw new Error('Verification check failed')
    lastVerifyMutate(false)
  }
  createEffect(() => {
    if (!verifyRoles.loading && !verifyRoles.error) setRolesToCheck(verifyRoles().map((role) => role.roleID))
  })

  const pagination = createListPagination<VerificationRole>(() => (!verifyRoles.error ? verifyRoles() : undefined))

  return (
    <>
      <MissingRolePermission />
      <AdminChannelSelector
        id="select_channel_modal"
        title={t('dashboard.guild.verification.send_verification_message_button', 'Send Verification Message')}
        callback={(channelID) => {
          setPublishTarget(channelID)
          showDialog('publish_verification')
        }}
      />
      <ConfirmActionDialog
        id="publish_verification"
        title={t(
          'dashboard.guild.verification.publish_confirmation',
          'Publish verification in #{1}?',
          channelName(publishTarget()),
        )}
        description={t(
          'dashboard.guild.verification.publish_consequence',
          'Members will use this message to link their Steam and Discord accounts. Enabled verification rules can then give or remove their Discord roles.',
        )}
        confirmLabel={t('ui.publish', 'Publish')}
        variant="primary"
        onConfirm={sendVerificationMessage}
      />
      <ConfirmActionDialog
        id="delete_verification_message"
        title={t(
          'dashboard.guild.verification.delete_message_confirmation',
          'Delete verification in #{1}?',
          !verifyMessage.loading && !verifyMessage.error ? channelName(verifyMessage()?.channelID ?? '') : '',
        )}
        description={t(
          'dashboard.guild.verification.delete_message_consequence',
          'Members will no longer be able to start verification from this message. Existing account links and assigned roles are kept.',
        )}
        confirmLabel={t('ui.delete', 'Delete')}
        onConfirm={deleteVerificationMessage}
      />
      <ConfirmActionDialog
        id="delete_verification_role"
        title={t('ui.delete_target', 'Delete {1}?', roleName(deleteRoleTarget()?.roleID ?? ''))}
        description={t(
          'dashboard.guild.verification.delete_role_consequence',
          'This role will no longer be given or removed by verification. Existing members keep their current roles.',
        )}
        confirmLabel={t('ui.delete', 'Delete')}
        onConfirm={deleteVerifyRole}
      />
      <ConfirmActionDialog
        id="check_verification_roles"
        title={t(
          'dashboard.guild.verification.check_confirmation',
          'Check roles for members of {1}?',
          getGuild().name ?? getGuild().id ?? '',
        )}
        description={t(
          'dashboard.guild.verification.check',
          'Apply automatic roles to existing members and verification role rules to members with linked Steam and Discord accounts. Available once every 24 hours on Discord servers with up to 1,000 members.',
        )}
        confirmLabel={t('dashboard.guild.verification.check_button', 'Apply roles to existing members')}
        variant="warning"
        onConfirm={checkAllRoles}
      />
      <AdminModal
        title={
          editingRoleID()
            ? t('dashboard.guild.verification.edit_role_modal_title', 'Edit Role')
            : t('dashboard.guild.verification.add_role_button', 'Add Role')
        }
        id="edit_role_modal"
        busy={roleForm.pending()}
        onClose={roleForm.discard}
        onCancel={roleForm.discard}
      >
        <GuildRolesState />
        <FormField
          id="guildverifications-field-0"
          label={t('dashboard.guild.verification.role_label', 'Role')}
          description={t(
            'dashboard.guild.verification.role_hint',
            'Choose the Discord role this rule will give or remove after account verification.',
          )}
          required
        >
          <select
            ref={(select) => retainGuildRoleSelection(select, () => selectedRole().roleID)}
            id="guildverifications-field-0"
            aria-describedby="guildverifications-field-0-description"
            class="select w-full"
            disabled={!!editingRoleID() || guildRoles.loading || !!guildRoles.error || roleForm.pending()}
            value={selectedRole().roleID}
            onChange={(event) => roleForm.patch({ roleID: event.currentTarget.value })}
          >
            <option value="">{t('dashboard.guild.verification.select_role_modal_title', 'Select Role')}</option>
            <For each={availableRoles()}>{(role) => <option value={role.id}>{role.name}</option>}</For>
          </select>
        </FormField>
        <FormField
          id="guildverifications-field-1"
          label={t('dashboard.guild.verification.action_on_verification_label', 'Action on Verification')}
          description={t(
            'dashboard.guild.verification.action_hint',
            'Give Role adds this role to verified members. Remove Role removes it, for example an Unverified role.',
          )}
        >
          <select
            id="guildverifications-field-1"
            aria-describedby="guildverifications-field-1-description"
            class="select w-full"
            disabled={roleForm.pending()}
            value={selectedRole().isGiveRole ? 'true' : 'false'}
            onChange={(event) => roleForm.patch({ isGiveRole: event.currentTarget.value === 'true' })}
          >
            <option value="true">{t('dashboard.guild.verification.give_role', 'Give Role')}</option>
            <option value="false">{t('dashboard.guild.verification.remove_role', 'Remove Role')}</option>
          </select>
        </FormField>
        <FormField
          id="guildverifications-field-2"
          label={t('dashboard.guild.verification.active_label', 'Active')}
          description={t(
            'dashboard.guild.verification.active_hint',
            'Choose No to keep this rule saved without giving or removing its role. This does not undo roles already assigned.',
          )}
        >
          <select
            id="guildverifications-field-2"
            aria-describedby="guildverifications-field-2-description"
            class="select w-full"
            disabled={roleForm.pending()}
            value={selectedRole().enabled ? 'true' : 'false'}
            onChange={(event) => roleForm.patch({ enabled: event.currentTarget.value === 'true' })}
          >
            <option value="true">{t('dashboard.guild.verification.yes', 'Yes')}</option>
            <option value="false">{t('dashboard.guild.verification.no', 'No')}</option>
          </select>
        </FormField>
        <Show when={!editingRoleID()}>
          <FeatureGate
            capability="verification.roles"
            used={!verifyRoles.loading && !verifyRoles.error ? verifyRoles().length : undefined}
            loading={verifyRoles.loading}
            error={verifyRoles.error}
            showQuota={false}
          />
        </Show>
        <FormActions
          dirty={roleForm.dirty()}
          pending={roleForm.pending()}
          disabled={
            !roleForm.valid() ||
            guildRoles.loading ||
            !!guildRoles.error ||
            verifyRoles.loading ||
            !!verifyRoles.error ||
            (!editingRoleID() && !quotaAccess.canCreate(verifyRoles().length))
          }
          saveLabel={editingRoleID() ? t('ui.save', 'Save') : t('ui.create', 'Create')}
          error={roleForm.error()}
          onSave={saveRole}
          onCancel={() => {
            roleForm.discard()
            closeDialog('edit_role_modal')
          }}
        />
      </AdminModal>

      <p class="text-sm leading-relaxed text-base-content/60">
        {t(
          'dashboard.guild.verification.verification_panel_description',
          'Help members link their Steam and Discord accounts. Publish the verification message, choose their experience and configure which Discord roles verification gives or removes.',
        )}
      </p>
      <div class="settings-card-grid">
        <AdminPanel
          title={t('settings.verification_message', 'Verification entry point')}
          description={t(
            'settings.verification_message_hint',
            'Publish the message members use to link their accounts in a Discord channel.',
          )}
          icon="send"
        >
          <SettingRow title={t('dashboard.guild.verification.verification_message_label', 'Verification Message:')}>
            <AsyncState
              loading={verifyMessage.loading}
              error={verifyMessage.error}
              onRetry={() => void refetchMessage()}
            >
              <Show when={!verifyMessage.loading && !verifyMessage.error}>
                <div class="flex flex-wrap items-center gap-3">
                  <Show
                    when={verifyMessage()?.messageID}
                    fallback={
                      <span class="text-base-content/60">
                        {t('dashboard.guild.verification.no_verification_message', 'No verification message')}
                      </span>
                    }
                  >
                    <DiscordMessage channelID={verifyMessage()?.channelID} messageID={verifyMessage()!.messageID!} />
                  </Show>
                  <Show
                    when={!verifyMessage()?.messageID}
                    fallback={
                      <Button variant="danger" onClick={() => showDialog('delete_verification_message')}>
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
        </AdminPanel>
        <AdminPanel
          title={t('settings.verification_preferences', 'Member experience')}
          icon="user-round"
          footer={
            <AutosaveFeedback
              state={preferencesAutosave}
              message={
                syncPending() && !prefs.dirty() ? t('ui.sync_pending', 'Saved. Synchronization is pending.') : undefined
              }
            />
          }
        >
          <FeatureGate
            capability="verification.preferences"
            loading={preferences.loading}
            error={preferences.error}
            showQuota={false}
          />
          <SuspendedFeature capability="verification.preferences" active={Object.values(prefs.saved()).some(Boolean)} />
          <AsyncState loading={preferences.loading} error={preferences.error} onRetry={() => void refetchPreferences()}>
            <SettingRow
              controlId="verification-dm"
              title={t(
                'dashboard.guild.verification.dont_send_verification_message_label',
                'Disable private verification reminders',
              )}
              description={t(
                'dashboard.guild.verification.dm_hint',
                "When enabled, new members with unlinked accounts will not receive the bot's verification reminder in a private message. Members can still use a published verification message.",
              )}
            >
              <div class="flex items-center gap-3">
                <PremiumBadge onlyIcon />
                <input
                  id="verification-dm"
                  aria-describedby="verification-dm-description"
                  type="checkbox"
                  class="toggle toggle-md"
                  disabled={
                    preferencesUnavailable() || (!preferenceAccess.allowed() && !prefs.draft().verification_dont_mp)
                  }
                  checked={prefs.draft().verification_dont_mp}
                  onChange={(event) => prefs.patch({ verification_dont_mp: event.currentTarget.checked })}
                />
              </div>
            </SettingRow>
            <SettingRow
              controlId="verification-support"
              title={t(
                'dashboard.guild.verification.dont_join_support_guild_message_label',
                'Disable automatic joining of the support server',
              )}
              description={t(
                'dashboard.guild.verification.support_hint',
                'When enabled, sign-in started from this Discord server will not automatically add the user to the Gmod Integration support server. It does not remove existing support-server members.',
              )}
            >
              <div class="flex items-center gap-3">
                <PremiumBadge onlyIcon />
                <input
                  id="verification-support"
                  aria-describedby="verification-support-description"
                  type="checkbox"
                  class="toggle toggle-md"
                  disabled={
                    preferencesUnavailable() ||
                    (!preferenceAccess.allowed() && !prefs.draft().verification_dont_join_support)
                  }
                  checked={prefs.draft().verification_dont_join_support}
                  onChange={(event) => prefs.patch({ verification_dont_join_support: event.currentTarget.checked })}
                />
              </div>
            </SettingRow>
          </AsyncState>
        </AdminPanel>
      </div>

      <AdminPanel
        title={t('dashboard.guild.verification.verification_roles_panel_title', 'Verification Roles')}
        description={t(
          'dashboard.guild.verification.verification_roles_panel_description',
          'Each active rule gives or removes a Discord role when a member has linked their Steam and Discord accounts. To apply the current rules to existing members, use the action below.',
        )}
        type="none"
        icon="users"
        actions={
          <>
            {/* Bug fix: subCondition below short-circuits before calling verifyRoles() - this
              expression isn't wrapped in any loading/error Show at all, so reading verifyRoles()
              while the resource is errored used to re-throw and crash the render (see the tbody
              fix above for the full explanation). */}
            <FeatureGate
              capability="verification.roles"
              used={!verifyRoles.loading && !verifyRoles.error ? verifyRoles().length : undefined}
              loading={verifyRoles.loading}
              error={verifyRoles.error}
            >
              <Button
                variant="primary"
                disabled={
                  verifyRoles.loading ||
                  !!verifyRoles.error ||
                  guildRoles.loading ||
                  !!guildRoles.error ||
                  !quotaAccess.canCreate(verifyRoles().length)
                }
                onClick={() => {
                  openRole()
                }}
              >
                {t('dashboard.guild.verification.add_role_button', 'Add Role')}
              </Button>
            </FeatureGate>
          </>
        }
        footer={
          <>
            {!verifyRoles.loading && !verifyRoles.error && pagination.visible() ? (
              <Pagination
                standalone
                query={pagination.query()}
                total={pagination.total()}
                onChange={pagination.onChange}
              />
            ) : undefined}
            <SettingRow
              title={t('settings.verification_existing_members', 'Existing members')}
              description={t(
                'dashboard.guild.verification.check',
                'Apply automatic roles to existing members and verification role rules to members with linked Steam and Discord accounts. Available once every 24 hours on Discord servers with up to 1,000 members.',
              )}
            >
              <Button
                variant="warning"
                disabled={lastVerify.loading || !!lastVerify.error || lastVerify() === false}
                onClick={() => showDialog('check_verification_roles')}
              >
                {t('dashboard.guild.verification.check_button', 'Apply roles to existing members')}
              </Button>
            </SettingRow>
          </>
        }
      >
        <GuildRolesState />
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
                emptyLabel={t(
                  'dashboard.guild.verification.empty_roles',
                  'No verification role rules yet. Add a role and choose whether verification should give or remove it.',
                )}
                onRetry={() => void refetchRoles()}
              />
              {/* Bug fix: also gate on !verifyRoles.error - `verifyRoles()` is read unguarded below
                (via <For each={pagination.items()}>), and reading a resource accessor while it's in an
                error state re-throws that error, which crashed the render (leaving it stuck on
                the loading state forever) and made the `Match when={verifyRoles.error}` message
                below unreachable. Mirrors the same fix already applied to ServerPlayers.tsx. */}
              <Show when={!verifyRoles.loading && !verifyRoles.error}>
                <For each={pagination.items()}>
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
                          <BooleanStatus value={role.enabled} />
                        </div>
                      </td>
                      <td>
                        <div class="flex gap-2 justify-center">
                          <IconButton
                            label={t('dashboard.guild.verification.edit_tooltip', 'Edit')}
                            icon="pencil"
                            disabled={roleForm.pending()}
                            onClick={() => {
                              openRole(role)
                            }}
                          />
                          <IconButton
                            label={t('dashboard.guild.verification.delete_tooltip', 'Delete')}
                            icon="trash-2"
                            variant="danger"
                            disabled={roleForm.pending()}
                            onClick={() => {
                              setDeleteRoleTarget(role)
                              showDialog('delete_verification_role')
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

export default GuildVerification
