import { FeatureGate, SuspendedFeature } from '../../../../components/FeatureGate.js'
import { useFeatureAccess } from '../../../../components/AccessProvider.js'
import { closeDialog, showDialog } from '../../../../utils/dialog.js'
import { type Component, createEffect, createResource, createSignal, For, Show } from 'solid-js'
import AdminPanel from '../../../../components/AdminPanel.js'
import AdminModal from '../../../../components/AdminModal.js'
import ConfirmActionDialog from '../../../../components/ConfirmActionDialog.js'
import { useI18n } from '../../../../i18n.js'
import { NeedWebsocket } from '../../../../components/popup/NeedWebsocket.js'
import { fetchAPI } from '../../../../utils/api.js'
import { TextValue } from '../../../../components/popup/TextValue.js'
import {
  AsyncState,
  Button,
  FormActions,
  FormField,
  IconButton,
  TableState,
  Icon,
  SettingRow,
} from '../../../../components/ui/index.js'
import { createDraftForm } from '../../../../hooks/createDraftForm.js'
import { saveDashboardSettings } from '../../../../utils/dashboardSettings.js'

type PseudoRule = { id: number; enabled: boolean; role: string; name: string; prefix: string }
const URL = '/users/:discordID/guilds/:guildID/servers/:serverID/pseudo'
const emptyRule = (): PseudoRule => ({ id: 0, enabled: false, role: '', name: '', prefix: '' })
const renderFormat = (value: string) =>
  value
    .replaceAll('{plyName}', 'John Doe')
    .replaceAll('{plySteamID64}', '76500000000000000')
    .replaceAll('{rolePrefix}', 'A')
    .replaceAll('{roleName}', 'Admin')

const ServerPseudo: Component = () => {
  const { t } = useI18n()
  const reverseAccess = useFeatureAccess('sync.nicknames.reverse')
  const quotaAccess = useFeatureAccess('sync.nicknames.rules')
  const [syncPending, setSyncPending] = createSignal(false)
  const [creating, setCreating] = createSignal(false)
  const [removing, setRemoving] = createSignal<PseudoRule>()
  const settings = createDraftForm({
    initial: { direction: 'disable', format: '' },
    validate: (draft) => ({
      ...(!['disable', 'gmod-to-discord', 'discord-to-gmod', 'both'].includes(draft.direction)
        ? { direction: t('ui.invalid_value', 'Check this value.') }
        : {}),
      ...(draft.direction !== 'disable' && !draft.format.trim()
        ? { format: t('ui.required', 'This field is required.') }
        : {}),
    }),
    errorMessage: () => t('ui.save_error', 'Unable to save. Please try again.'),
  })
  const [configuration, { refetch: refetchConfiguration }] = createResource(async () => {
    const [directionResponse, formatResponse] = await Promise.all([
      fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/settings/sync_pseudo_direction', 'GET'),
      fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/settings/pseudoFormat', 'GET'),
    ])
    if (!directionResponse.ok || !formatResponse.ok) throw new Error('Nickname settings unavailable')
    const [direction, format] = await Promise.all([directionResponse.json(), formatResponse.json()])
    return { direction: direction.value || 'disable', format: format.value || '' }
  })
  createEffect(() => {
    if (!configuration.loading && !configuration.error) settings.reset(configuration()!)
  })
  const [rules, { mutate, refetch }] = createResource(
    async (): Promise<PseudoRule[]> => {
      const response = await fetchAPI(URL, 'GET')
      if (!response.ok) throw new Error('Nickname rules unavailable')
      const data = await response.json()
      if (!Array.isArray(data)) throw new Error('Invalid nickname rules')
      return data
    },
    { initialValue: [] },
  )
  const editor = createDraftForm<PseudoRule>({
    initial: emptyRule(),
    validate: (draft) => (!draft.role.trim() ? { role: t('ui.required', 'This field is required.') } : {}),
    errorMessage: () => t('ui.save_error', 'Unable to save. Please try again.'),
  })
  const canCreate = () => !rules.loading && !rules.error && quotaAccess.canCreate(rules().length)
  function begin(row?: PseudoRule) {
    if (editor.pending() || rules.loading || rules.error || (!row && !canCreate())) return
    setCreating(!row)
    editor.reset(row ? { ...row } : emptyRule())
    showDialog('edit_role_modal')
  }
  const directionWriteAllowed = () =>
    reverseAccess.allowed() ||
    settings.draft().direction === settings.saved().direction ||
    ['disable', 'gmod-to-discord'].includes(settings.draft().direction)
  async function saveSettings() {
    if (configuration.loading || configuration.error || !directionWriteAllowed()) return
    await settings.save(async (snapshot) => {
      const changed: Record<string, unknown> = {}
      if (snapshot.direction !== settings.saved().direction) changed.sync_pseudo_direction = snapshot.direction
      if (snapshot.format !== settings.saved().format) changed.pseudoFormat = snapshot.format
      const result = await saveDashboardSettings('server', changed)
      setSyncPending(result.sync === 'pending')
      return {
        direction:
          typeof result.settings.sync_pseudo_direction === 'string'
            ? result.settings.sync_pseudo_direction
            : snapshot.direction,
        format: typeof result.settings.pseudoFormat === 'string' ? result.settings.pseudoFormat : snapshot.format,
      }
    })
  }
  async function saveRule() {
    if (rules.loading || rules.error || (creating() && !canCreate())) return
    const isNew = creating()
    const saved = await editor.save(async (snapshot) => {
      const payload = {
        enabled: snapshot.enabled,
        role: snapshot.role.trim(),
        name: snapshot.name,
        prefix: snapshot.prefix,
      }
      const response = await fetchAPI(isNew ? URL : `${URL}/${snapshot.id}`, isNew ? 'POST' : 'PUT', payload)
      if (!response.ok) throw new Error('Nickname rule save failed')
      const updated: PseudoRule = await response.json()
      mutate((previous) =>
        isNew ? [...previous, updated] : previous.map((row) => (row.id === updated.id ? updated : row)),
      )
      return updated
    })
    if (saved) closeDialog('edit_role_modal')
  }
  return (
    <>
      <NeedWebsocket />
      <AdminModal
        id="edit_role_modal"
        title={
          creating()
            ? t('dashboard.server.pseudo.addRole', 'Add nickname rule')
            : t('dashboard.server.pseudo.editRole', 'Edit nickname rule')
        }
        busy={editor.pending()}
        onClose={editor.discard}
        onCancel={editor.discard}
      >
        <FormField
          id="pseudo-role-group"
          label={t('dashboard.server.pseudo.userGroup', 'Game user group')}
          description={t(
            'dashboard.server.pseudo.user_group_help',
            'Enter the exact game user group, such as admin or vip. This rule supplies the name and prefix used in the nickname format.',
          )}
          error={editor.errors().role}
        >
          <input
            id="pseudo-role-group"
            aria-describedby={`pseudo-role-group-description${editor.errors().role ? ' pseudo-role-group-error' : ''}`}
            class="input w-full"
            value={editor.draft().role}
            disabled={editor.pending()}
            aria-invalid={!!editor.errors().role}
            onInput={(event) => editor.patch({ role: event.currentTarget.value })}
          />
        </FormField>
        <FormField id="pseudo-role-name" label={t('dashboard.server.pseudo.name', 'Display name for {roleName}')}>
          <input
            id="pseudo-role-name"
            class="input w-full"
            value={editor.draft().name}
            disabled={editor.pending()}
            onInput={(event) => editor.patch({ name: event.currentTarget.value })}
          />
        </FormField>
        <FormField id="pseudo-role-prefix" label={t('dashboard.server.pseudo.prefix', 'Prefix for {rolePrefix}')}>
          <input
            id="pseudo-role-prefix"
            class="input w-full"
            value={editor.draft().prefix}
            disabled={editor.pending()}
            onInput={(event) => editor.patch({ prefix: event.currentTarget.value })}
          />
        </FormField>
        <FormField id="pseudo-role-active" label={t('dashboard.server.pseudo.active', 'Active')}>
          <input
            id="pseudo-role-active"
            type="checkbox"
            class="toggle"
            checked={editor.draft().enabled}
            disabled={editor.pending()}
            onChange={(event) => editor.patch({ enabled: event.currentTarget.checked })}
          />
        </FormField>
        <Show when={creating()}>
          <FeatureGate
            capability="sync.nicknames.rules"
            used={!rules.loading && !rules.error ? rules().length : undefined}
            loading={rules.loading}
            error={rules.error}
            showQuota={false}
          />
        </Show>
        <FormActions
          dirty={editor.dirty()}
          pending={editor.pending()}
          error={editor.error()}
          disabled={!editor.valid() || rules.loading || !!rules.error || (creating() && !canCreate())}
          saveLabel={creating() ? t('ui.create', 'Create') : t('ui.save', 'Save')}
          onSave={() => void saveRule()}
          onCancel={() => {
            editor.discard()
            closeDialog('edit_role_modal')
          }}
        />
      </AdminModal>
      <ConfirmActionDialog
        id="delete-pseudo-rule"
        title={t('ui.confirm_delete', 'Delete this item?')}
        description={
          removing()
            ? `${removing()!.role} — ${removing()!.name} ${removing()!.prefix} — ${t('dashboard.server.pseudo.remove_rule_help', 'Delete this nickname rule. The game user group and Discord roles are kept.')}`
            : ''
        }
        confirmLabel={t('ui.delete', 'Delete')}
        onConfirm={async () => {
          const target = removing()
          if (!target) throw new Error('No rule selected')
          const response = await fetchAPI(`${URL}/${target.id}`, 'DELETE')
          if (!response.ok) throw new Error('Nickname rule removal failed')
          mutate((previous) => previous.filter((row) => row.id !== target.id))
        }}
      />
      <AdminPanel
        title={t('dashboard.server.pseudo.pseudo', 'Nickname synchronization')}
        description={t(
          'dashboard.server.pseudo.description',
          'Synchronize player names between the game and Discord for linked accounts. Choose the direction and nickname format, then save this section.',
        )}
        info={t(
          'dashboard.server.pseudo.info',
          'Discord prevents bots from changing the server owner’s nickname. The bot also needs permission to manage the target member’s nickname.',
        )}
        icon="arrow-left-right"
        footer={
          <FormActions
            dirty={settings.dirty()}
            pending={settings.pending()}
            error={settings.error()}
            success={settings.success()}
            disabled={configuration.loading || !!configuration.error || !settings.valid() || !directionWriteAllowed()}
            onSave={() => void saveSettings()}
            onCancel={() => {
              settings.discard()
              setSyncPending(false)
            }}
            message={
              syncPending() && !settings.dirty()
                ? t('ui.sync_pending', 'Saved. Synchronization is pending.')
                : undefined
            }
          />
        }
      >
        <AsyncState
          loading={configuration.loading}
          error={configuration.error}
          onRetry={() => void refetchConfiguration()}
        />
        <SettingRow
          controlId="server-pseudo-direction"
          title={t('dashboard.server.pseudo.pseudoSyncDirection', 'Nickname synchronization direction')}
          description={t(
            'settings.sync_direction_help',
            'This direction applies to every rule below. Save to apply your changes.',
          )}
        >
          <select
            id="server-pseudo-direction"
            class="select w-full"
            aria-describedby="server-pseudo-direction-description"
            value={settings.draft().direction}
            disabled={configuration.loading || !!configuration.error || settings.pending()}
            onChange={(event) => settings.patch({ direction: event.currentTarget.value })}
          >
            <option value="disable">{t('dashboard.server.pseudo.disable', 'Disable')}</option>
            <option value="gmod-to-discord">{t('dashboard.server.pseudo.fromGmodToDiscord', 'Game → Discord')}</option>
            <option value="discord-to-gmod" disabled={!reverseAccess.allowed()}>
              {t('dashboard.server.pseudo.fromDiscordToGmod', 'Discord → game')}
            </option>
            <option value="both" disabled={!reverseAccess.allowed()}>
              {t('dashboard.server.pseudo.bothWays', 'Both directions')}
            </option>
          </select>
        </SettingRow>
        <SettingRow
          controlId="pseudo-format"
          title={t('dashboard.server.pseudo.format', 'Format')}
          description={t(
            'settings.nickname_format_help',
            'Edit the nickname template and review the preview before saving.',
          )}
          stacked
        >
          <input
            id="pseudo-format"
            class="input w-full font-mono"
            value={settings.draft().format}
            disabled={configuration.loading || !!configuration.error || settings.pending()}
            aria-invalid={!!settings.errors().format}
            aria-describedby="pseudo-format-description"
            onInput={(event) => settings.patch({ format: event.currentTarget.value })}
          />
          <Show when={settings.errors().format}>
            <p class="text-error text-sm">{settings.errors().format}</p>
          </Show>
          <div class="flex flex-col gap-2 w-full">
            <label for="pseudo-format-preview" class="text-sm">
              {t('dashboard.server.pseudo.preview', 'Preview')}
            </label>
            <input
              id="pseudo-format-preview"
              class="input w-full"
              value={renderFormat(settings.draft().format)}
              readOnly
            />
          </div>
        </SettingRow>
        <details class="settings-advanced">
          <summary>{t('dashboard.server.pseudo.variables', 'Variables')}</summary>
          <ul class="text-base-content/60 list-inside">
            <li>{`{plyName} — ${t('dashboard.server.pseudo.playerName', 'Player Name')}`}</li>
            <li>{`{plySteamID64} — ${t('dashboard.server.pseudo.playerSteamID64', 'Player SteamID64')}`}</li>
            <li>{`{rolePrefix} — ${t('dashboard.server.pseudo.rolePrefix', 'Game group prefix')}`}</li>
            <li>{`{roleName} — ${t('dashboard.server.pseudo.roleName', 'Game group display name')}`}</li>
          </ul>
        </details>
        <FeatureGate capability="sync.nicknames.reverse" showQuota={false} />
        <SuspendedFeature
          capability="sync.nicknames.reverse"
          active={['both', 'discord-to-gmod'].includes(settings.saved().direction)}
        />
      </AdminPanel>
      <AdminPanel
        title={t('dashboard.server.pseudo.rules_title', 'Nickname rules by game group')}
        description={t(
          'dashboard.server.pseudo.rolePrefixDescription',
          'Choose the display name and prefix supplied by each game user group. These rules do not create or assign Discord roles.',
        )}
        type="none"
        icon="list"
        actions={
          <FeatureGate
            capability="sync.nicknames.rules"
            used={!rules.loading && !rules.error ? rules().length : undefined}
            loading={rules.loading}
            error={rules.error}
          >
            <Button variant="primary" disabled={!canCreate()} onClick={() => begin()}>
              {t('dashboard.server.pseudo.addRole', 'Add nickname rule')}
            </Button>
          </FeatureGate>
        }
      >
        <p class="settings-notice">
          <Icon name="info" size={16} />
          {t(
            'settings.pseudo_rules_help',
            'Prefixes and role names are used only when the format contains {rolePrefix} or {roleName}.',
          )}
        </p>
        <div class="settings-table">
          <table class="table w-full">
            <thead>
              <tr>
                <th>{t('dashboard.server.pseudo.userGroup', 'Game user group')}</th>
                <th>{t('dashboard.server.pseudo.name', 'Display name for {roleName}')}</th>
                <th>{t('dashboard.server.pseudo.prefix', 'Prefix for {rolePrefix}')}</th>
                <th>{t('dashboard.server.pseudo.active', 'Active')}</th>
                <th>{t('dashboard.server.pseudo.actions', 'Actions')}</th>
              </tr>
            </thead>
            <tbody>
              <TableState
                colSpan={5}
                loading={rules.loading}
                error={rules.error}
                empty={!rules.loading && !rules.error && rules().length === 0}
                onRetry={() => void refetch()}
              >
                <For each={!rules.error ? rules() : []}>
                  {(row) => (
                    <tr>
                      <td>
                        <TextValue value={row.role} />
                      </td>
                      <td>
                        <TextValue value={row.name} />
                      </td>
                      <td>
                        <TextValue value={row.prefix} />
                      </td>
                      <td>
                        <Icon name={row.enabled ? 'check' : 'x'} class={row.enabled ? 'text-success' : 'text-error'} />
                      </td>
                      <td>
                        <div class="flex gap-2">
                          <IconButton
                            icon="pencil"
                            label={t('dashboard.server.pseudo.edit', 'Edit')}
                            onClick={() => begin(row)}
                            disabled={editor.pending()}
                          />
                          <IconButton
                            icon="trash-2"
                            variant="danger"
                            label={t('dashboard.server.pseudo.delete', 'Delete')}
                            onClick={() => {
                              setRemoving(row)
                              showDialog('delete-pseudo-rule')
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
export default ServerPseudo
