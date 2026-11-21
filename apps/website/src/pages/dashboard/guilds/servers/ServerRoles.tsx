import { closeDialog, showDialog } from '../../../../utils/dialog.js'
import { type Component, createEffect, createResource, createSignal, For, Show } from 'solid-js'
import AdminPanel from '../../../../components/AdminPanel.js'
import AdminModal from '../../../../components/AdminModal.js'
import ConfirmActionDialog from '../../../../components/ConfirmActionDialog.js'
import { guildRoles } from '../GuildInformations.js'
import {
  Button,
  IconButton,
  FormActions,
  FormField,
  TableState,
  AsyncState,
  Icon,
  SettingGroup,
  SettingRow,
} from '../../../../components/ui/index.js'
import { createDraftForm } from '../../../../hooks/createDraftForm.js'
import { saveDashboardSettings } from '../../../../utils/dashboardSettings.js'
import { useI18n } from '../../../../i18n.js'
import DiscordRole from '../../../../components/discord/DiscordRole.js'
import MissingRolePermission, { setRolesToCheck } from '../../../../components/popup/MissingRolePermission.js'
import { NeedWebsocket } from '../../../../components/popup/NeedWebsocket.js'
import { BuyPremiumBtn, premium } from '../../../../utils/premium.js'
import { fetchAPI } from '../../../../utils/api.js'
import { TextValue } from '../../../../components/popup/TextValue.js'

interface RoleRule {
  serverID: string
  roleID: string
  userGroup: string
  enable: boolean
}
const URL = '/users/:discordID/guilds/:guildID/servers/:serverID/roles'
const emptyRule = (): RoleRule => ({ serverID: '', roleID: '', userGroup: '', enable: false })

const ServerRoles: Component = () => {
  const { t } = useI18n()
  const [creating, setCreating] = createSignal(false)
  const [removing, setRemoving] = createSignal<RoleRule>()
  const [syncPending, setSyncPending] = createSignal(false)
  const editor = createDraftForm<RoleRule>({
    initial: emptyRule(),
    validate: (draft) => ({
      ...(!draft.roleID ? { roleID: t('ui.required', 'This field is required.') } : {}),
      ...(!draft.userGroup.trim() ? { userGroup: t('ui.required', 'This field is required.') } : {}),
    }),
    errorMessage: () => t('ui.save_error', 'Unable to save. Please try again.'),
  })
  const [rules, { mutate, refetch }] = createResource(
    async (): Promise<RoleRule[]> => {
      const response = await fetchAPI(URL, 'GET')
      if (!response.ok) throw new Error('Role mappings unavailable')
      const data = await response.json()
      if (!Array.isArray(data)) throw new Error('Invalid role mappings')
      return data
    },
    { initialValue: [] },
  )
  const available = () => !guildRoles.loading && !guildRoles.error && !rules.loading && !rules.error
  const canCreate = () => available() && (premium() || rules().length < 3)
  createEffect(() => {
    if (!rules.loading && !rules.error) setRolesToCheck(rules().map((rule) => rule.roleID))
  })
  const roleName = (id: string) => (!guildRoles.error ? guildRoles()?.find((role) => role.id === id)?.name || id : id)
  function begin(row?: RoleRule) {
    if (!available() || editor.pending() || (!row && !canCreate())) return
    setCreating(!row)
    editor.reset(row ? { ...row } : emptyRule())
    showDialog('edit_role_modal')
  }
  async function submit() {
    if (!available() || (creating() && !canCreate())) return
    const isNew = creating()
    const saved = await editor.save(async (snapshot) => {
      const response = await fetchAPI(`${URL}/${snapshot.roleID}`, isNew ? 'POST' : 'PUT', {
        userGroup: snapshot.userGroup.trim(),
        enable: snapshot.enable,
      })
      if (!response.ok) throw new Error('Role mapping save failed')
      const updated: RoleRule = await response.json()
      mutate((previous) =>
        isNew ? [...previous, updated] : previous.map((row) => (row.roleID === updated.roleID ? updated : row)),
      )
      return updated
    })
    if (saved) closeDialog('edit_role_modal')
  }
  const direction = createDraftForm({
    initial: { value: 'gmod-to-discord' },
    validate: (draft) =>
      !['discord-to-gmod', 'gmod-to-discord', 'both'].includes(draft.value) ||
      (!premium() && draft.value !== 'gmod-to-discord')
        ? { value: t('ui.invalid_value', 'Check this value.') }
        : {},
    errorMessage: () => t('ui.save_error', 'Unable to save. Please try again.'),
  })
  const [storedDirection, { refetch: refetchDirection }] = createResource(async () => {
    const response = await fetchAPI(
      '/users/:discordID/guilds/:guildID/servers/:serverID/settings/sync_role_direction',
      'GET',
    )
    if (!response.ok) throw new Error('Direction unavailable')
    return await response.json()
  })
  createEffect(() => {
    if (!storedDirection.loading && !storedDirection.error)
      direction.reset({ value: storedDirection()?.value || 'gmod-to-discord' })
  })
  async function saveDirection() {
    if (storedDirection.loading || storedDirection.error) return
    await direction.save(async (snapshot) => {
      const result = await saveDashboardSettings('server', { sync_role_direction: snapshot.value })
      setSyncPending(result.sync === 'pending')
      return {
        value:
          typeof result.settings.sync_role_direction === 'string'
            ? result.settings.sync_role_direction
            : snapshot.value,
      }
    })
  }
  return (
    <>
      <MissingRolePermission />
      <NeedWebsocket />
      <AdminModal
        id="edit_role_modal"
        title={
          creating()
            ? t('dashboard.server.roles.add_role_sync', 'Add Role')
            : t('dashboard.server.roles.edit_role_sync', 'Edit Role')
        }
        busy={editor.pending()}
        onClose={editor.discard}
        onCancel={editor.discard}
      >
        <FormField
          id="roles-role"
          label={t('dashboard.server.roles.role_name', 'Discord Role')}
          error={editor.errors().roleID}
        >
          <select
            id="roles-role"
            class="select w-full"
            value={editor.draft().roleID}
            disabled={!creating() || !available() || editor.pending()}
            aria-invalid={!!editor.errors().roleID}
            onChange={(event) => editor.patch({ roleID: event.currentTarget.value })}
          >
            <option value="">{t('dashboard.server.roles.select_role', 'Select Role')}</option>
            <For each={!guildRoles.error ? guildRoles() : []}>
              {(role) => (
                <Show when={!creating() || !rules().some((existing) => existing.roleID === role.id)}>
                  <option value={role.id}>{role.name}</option>
                </Show>
              )}
            </For>
          </select>
        </FormField>
        <FormField
          id="roles-mapping"
          label={t('dashboard.server.roles.select_user_group', 'User Group')}
          error={editor.errors().userGroup}
        >
          <input
            id="roles-mapping"
            class="input w-full"
            value={editor.draft().userGroup}
            disabled={!available() || editor.pending()}
            aria-invalid={!!editor.errors().userGroup}
            onInput={(event) => editor.patch({ userGroup: event.currentTarget.value })}
          />
        </FormField>
        <FormField id="roles-enabled" label={t('dashboard.server.roles.enable_sync', 'Active')}>
          <input
            id="roles-enabled"
            type="checkbox"
            class="toggle"
            checked={editor.draft().enable}
            disabled={editor.pending()}
            onChange={(event) => editor.patch({ enable: event.currentTarget.checked })}
          />
        </FormField>
        <FormActions
          dirty={editor.dirty()}
          pending={editor.pending()}
          disabled={!available() || !editor.valid() || (creating() && !canCreate())}
          error={editor.error()}
          saveLabel={creating() ? t('ui.create', 'Create') : t('ui.save', 'Save')}
          onSave={() => void submit()}
          onCancel={() => {
            editor.discard()
            closeDialog('edit_role_modal')
          }}
        />
      </AdminModal>
      <ConfirmActionDialog
        id="delete-role-sync"
        title={t('ui.confirm_delete', 'Delete this item?')}
        description={removing() ? `${roleName(removing()!.roleID)} — ${removing()!.userGroup}` : ''}
        confirmLabel={t('ui.delete', 'Delete')}
        onConfirm={async () => {
          const target = removing()
          if (!target) throw new Error('No role selected')
          const response = await fetchAPI(`${URL}/${target.roleID}`, 'DELETE')
          if (!response.ok) throw new Error('Role removal failed')
          mutate((previous) => previous.filter((row) => row.roleID !== target.roleID))
        }}
      />
      <AdminPanel
        title={t('dashboard.server.roles.title', 'Roles')}
        description={t(
          'dashboard.server.roles.description',
          'Define the roles that are synchronized with your Discord server.',
        )}
      >
        <AsyncState
          loading={storedDirection.loading}
          error={storedDirection.error}
          onRetry={() => void refetchDirection()}
        />
        <SettingGroup title={t('settings.sync_behavior', 'Synchronization behavior')} icon="arrow-left-right">
          <SettingRow
            controlId="server-roles-direction"
            title={t('dashboard.server.roles.sync_direction', 'Roles Synchronization Direction')}
            description={t(
              'settings.sync_direction_help',
              'This direction applies to every rule below. Save to apply your changes.',
            )}
          >
            <select
              id="server-roles-direction"
              aria-describedby="server-roles-direction-description"
              class="select w-full max-w-xs"
              value={direction.draft().value}
              disabled={storedDirection.loading || !!storedDirection.error || direction.pending()}
              onChange={(event) => direction.patch({ value: event.currentTarget.value })}
            >
              <option value="discord-to-gmod" disabled={!premium()}>
                {t('dashboard.server.roles.discord_to_server', 'From Discord to Gmod')}
              </option>
              <option value="gmod-to-discord">
                {t('dashboard.server.roles.server_to_discord', 'From Gmod to Discord')}
              </option>
              <option value="both" disabled={!premium()}>
                {t('dashboard.server.roles.both_directions', 'Both Ways')}
              </option>
            </select>
          </SettingRow>
          <FormActions
            dirty={direction.dirty()}
            pending={direction.pending()}
            error={direction.error()}
            success={direction.success()}
            disabled={storedDirection.loading || !!storedDirection.error || !direction.valid()}
            onSave={() => void saveDirection()}
            onCancel={() => {
              direction.discard()
              setSyncPending(false)
            }}
            message={
              syncPending() && !direction.dirty()
                ? t('ui.sync_pending', 'Saved. Synchronization is pending.')
                : undefined
            }
          />
          <Show when={!premium()}>
            <p class="settings-notice">
              <Icon name="crown" size={16} />
              {t('settings.sync_premium_help', 'Discord to game and two-way synchronization require Premium.')}
            </p>
          </Show>
        </SettingGroup>
      </AdminPanel>
      <AdminPanel
        title={t('dashboard.server.roles.role_sync', 'Roles Synchronized')}
        description={t(
          'dashboard.server.roles.role_sync_description',
          'Define the roles that are synchronized with your Discord server.',
        )}
        type="none"
        icon="shield-check"
        actions={
          <BuyPremiumBtn
            subCondition={!rules.error && rules().length < 3}
            btnText={t(
              'dashboard.server.roles.premium_feature_3',
              'Limited to 3 synchronized roles for free users.',
              3,
            )}
            hidden={rules.loading}
          >
            <Button variant="primary" disabled={!canCreate()} onClick={() => begin()}>
              {t('dashboard.server.roles.add_role_sync', 'Add Role')}
            </Button>
          </BuyPremiumBtn>
        }
      >
        <p class="settings-notice">
          <Icon name="info" size={16} />
          {t('settings.rule_setup_help', 'Create a complete rule, then save it to start synchronization.')}
        </p>
        <div class="settings-table">
          <table class="table w-full">
            <thead>
              <tr>
                <th>{t('dashboard.server.roles.role_name', 'Discord Role')}</th>
                <th>{t('dashboard.server.roles.user_group', 'User Group')}</th>
                <th>{t('dashboard.server.roles.status', 'Active')}</th>
                <th>{t('dashboard.server.roles.actions', 'Actions')}</th>
              </tr>
            </thead>
            <tbody>
              <TableState
                colSpan={4}
                loading={rules.loading}
                error={rules.error}
                empty={!rules.loading && !rules.error && rules().length === 0}
                onRetry={() => void refetch()}
              >
                <For each={!rules.error ? rules() : []}>
                  {(row) => (
                    <tr>
                      <td>
                        <DiscordRole roleID={row.roleID} />
                      </td>
                      <td>
                        <TextValue value={row.userGroup} />
                      </td>
                      <td>
                        <Icon name={row.enable ? 'check' : 'x'} class={row.enable ? 'text-success' : 'text-error'} />
                      </td>
                      <td>
                        <div class="flex gap-2">
                          <IconButton
                            label={t('dashboard.server.roles.edit_role_sync', 'Edit')}
                            icon="pencil"
                            disabled={editor.pending()}
                            onClick={() => begin(row)}
                          />
                          <IconButton
                            label={t('dashboard.server.roles.delete_role_sync', 'Delete')}
                            icon="trash-2"
                            variant="danger"
                            onClick={() => {
                              setRemoving(row)
                              showDialog('delete-role-sync')
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                  )}
                </For>
              </TableState>
            </tbody>
          </table>
        </div>
      </AdminPanel>
    </>
  )
}
export default ServerRoles
