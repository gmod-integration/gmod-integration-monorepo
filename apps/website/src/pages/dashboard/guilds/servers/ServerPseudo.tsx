import { closeDialog, showDialog } from '../../../../utils/dialog.js'
import { type Component, createEffect, createResource, createSignal, For, Show } from 'solid-js'
import AdminPanel from '../../../../components/AdminPanel'
import AdminModal from '../../../../components/AdminModal'
import { useI18n } from '../../../../i18n'
import { NeedWebsocket } from '../../../../components/popup/NeedWebsocket'
import { BuyPremiumBtn, premium } from '../../../../utils/premium'
import { PremiumOnly } from '../../../../components/PremiumOnly'
import { fetchAPI } from '../../../../utils/api'
import { TextValue } from '../../../../components/popup/TextValue'
import {
  AsyncState,
  Button,
  FormActions,
  FormField,
  IconButton,
  TableState,
  Icon,
  SettingGroup,
  SettingRow,
} from '../../../../components/ui/index.js'
import { createAsyncAction } from '../../../../hooks/createAsyncAction.js'

const ServerPseudo: Component = () => {
  const { t } = useI18n()

  const [format, setFormat] = createSignal('')
  const [direction, setDirection] = createSignal('disable')
  const actionOptions = { errorMessage: () => t('ui.save_error', 'Unable to save the changes.') }
  const directionAction = createAsyncAction(actionOptions)
  const formatAction = createAsyncAction(actionOptions)
  const roleAction = createAsyncAction(actionOptions)
  const listAction = createAsyncAction(actionOptions)

  const [pseudoDirection, { mutate: mutatePseudoDirection, refetch: refetchDirection }] = createResource(
    'pseudoDirection',
    async () => {
      return fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/settings/sync_pseudo_direction', 'GET').then(
        async (res) => {
          if (!res.ok) throw new Error('An error occurred while fetching the pseudo direction.')
          return (await res.json()) || {}
        },
      )
    },
  )

  createEffect(() => {
    if (!pseudoDirection.loading && !pseudoDirection.error) setDirection(pseudoDirection()?.value || 'disable')
  })

  async function updateSyncPseudoDirection(value: string) {
    const stored =
      !pseudoDirection.loading && !pseudoDirection.error ? pseudoDirection()?.value || 'disable' : 'disable'
    setDirection(value)
    const saved = await directionAction.run(async () => {
      const response = await fetchAPI(
        '/users/:discordID/guilds/:guildID/servers/:serverID/settings/sync_pseudo_direction',
        'PUT',
        { value },
      )
      if (!response.ok) throw new Error('Pseudo direction update failed')
      mutatePseudoDirection(await response.json())
    })
    if (!saved) setDirection(stored)
  }

  const [pseudoFormat, { mutate: mutatePseudoFormat, refetch: refetchFormat }] = createResource(
    'pseudoFormat',
    async () => {
      return fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/settings/pseudoFormat', 'GET')
        .then(async (res) => {
          if (!res.ok) throw new Error('An error occurred while fetching the pseudo format.')
          return (await res.json()) || { value: '' }
        })
        .then((data) => {
          setFormat(data.value || '')
          return data
        })
    },
  )

  const storedFormat = () => (!pseudoFormat.loading && !pseudoFormat.error ? pseudoFormat()?.value || '' : '')
  const renderFormat = (value: string) =>
    value
      .replaceAll('{plyName}', 'John Doe')
      .replaceAll('{plySteamID64}', '76500000000000000')
      .replaceAll('{rolePrefix}', 'A')
      .replaceAll('{roleName}', 'Admin')
  const preview = () => renderFormat(format())

  function discardFormat() {
    setFormat(storedFormat())
    formatAction.reset()
  }

  async function updatePseudoFormat() {
    const value = format()
    if (
      await formatAction.run(async () => {
        const response = await fetchAPI(
          '/users/:discordID/guilds/:guildID/servers/:serverID/settings/pseudoFormat',
          'PUT',
          { value },
        )
        if (!response.ok) throw new Error('Pseudo format update failed')
        mutatePseudoFormat(await response.json())
      })
    )
      closeDialog('edit_format')
  }

  const [activeRole, setActiveRole] = createSignal({ id: 0, enabled: false, role: '', name: '', prefix: '' })

  const [pseudoRoles, { mutate: mutatePseudoRoles, refetch: refetchRoles }] = createResource(
    'pseudoRoles',
    async (): Promise<ReturnType<typeof activeRole>[]> => {
      return fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/pseudo', 'GET').then(async (res) => {
        if (!res.ok) throw new Error('An error occurred while fetching the pseudo roles.')
        return (await res.json()) || []
      })
    },
    { initialValue: [] },
  )

  function discardRole() {
    const stored = !pseudoRoles.error ? pseudoRoles().find((role) => role.id === activeRole().id) : undefined
    setActiveRole(stored ? { ...stored } : { id: 0, enabled: false, role: '', name: '', prefix: '' })
    roleAction.reset()
  }

  async function addRole() {
    await listAction.run(async () => {
      const response = await fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/pseudo', 'POST', {
        id: 0,
        enabled: false,
        role: '',
        name: '',
        prefix: '',
      })
      if (!response.ok) throw new Error('Pseudo role creation failed')
      const data = await response.json()
      mutatePseudoRoles((previous) => [...previous, data])
    })
  }

  async function editRole() {
    const draft = { ...activeRole() }
    if (
      await roleAction.run(async () => {
        const response = await fetchAPI(
          `/users/:discordID/guilds/:guildID/servers/:serverID/pseudo/${draft.id}`,
          'PUT',
          draft,
        )
        if (!response.ok) throw new Error('Pseudo role update failed')
        const data = await response.json()
        mutatePseudoRoles((previous) => previous.map((role) => (role.id === data.id ? data : role)))
      })
    )
      closeDialog('edit_role_modal')
  }

  async function deleteRole(id: number) {
    await listAction.run(async () => {
      const response = await fetchAPI(`/users/:discordID/guilds/:guildID/servers/:serverID/pseudo/${id}`, 'DELETE')
      if (!response.ok) throw new Error('Pseudo role removal failed')
      await response.json()
      mutatePseudoRoles((previous) => previous.filter((role) => role.id !== id))
    })
  }

  return (
    <>
      <NeedWebsocket />
      <AdminModal
        title={t('dashboard.server.pseudo.editRole', 'Edit Role')}
        id="edit_role_modal"
        busy={roleAction.pending()}
        onClose={discardRole}
        onCancel={discardRole}
      >
        <FormField id="pseudo-role-group" label={t('dashboard.server.pseudo.userGroup', 'User Group')}>
          <input
            id="pseudo-role-group"
            type="text"
            class="input"
            disabled={pseudoRoles.loading || roleAction.pending()}
            value={activeRole().role}
            onInput={(e) => {
              setActiveRole((previous) => ({ ...previous, role: e.currentTarget.value }))
            }}
          />
        </FormField>
        <FormField id="pseudo-role-name" label={t('dashboard.server.pseudo.name', 'Name')}>
          <input
            id="pseudo-role-name"
            type="text"
            disabled={pseudoRoles.loading || roleAction.pending()}
            class="input"
            value={activeRole().name}
            onInput={(e) => {
              setActiveRole((previous) => ({ ...previous, name: e.currentTarget.value }))
            }}
          />
        </FormField>
        <FormField id="pseudo-role-prefix" label={t('dashboard.server.pseudo.prefix', 'Prefix')}>
          <input
            id="pseudo-role-prefix"
            type="text"
            disabled={pseudoRoles.loading || roleAction.pending()}
            class="input"
            value={activeRole().prefix}
            onInput={(e) => {
              setActiveRole((previous) => ({ ...previous, prefix: e.currentTarget.value }))
            }}
          />
        </FormField>
        <FormField id="pseudo-role-active" label={t('dashboard.server.pseudo.active', 'Active')}>
          <select
            id="pseudo-role-active"
            class="select"
            disabled={pseudoRoles.loading || roleAction.pending()}
            value={activeRole().enabled ? 'true' : 'false'}
            onChange={(e) => {
              setActiveRole((previous) => ({ ...previous, enabled: e.currentTarget.value === 'true' }))
            }}
          >
            <option value="true">{t('dashboard.server.pseudo.yes', 'Yes')}</option>
            <option value="false">{t('dashboard.server.pseudo.no', 'No')}</option>
          </select>
        </FormField>
        <FormActions
          pending={roleAction.pending()}
          disabled={pseudoRoles.loading || !!pseudoRoles.error}
          error={roleAction.error()}
          onSave={() => void editRole()}
          onCancel={() => closeDialog('edit_role_modal')}
          saveLabel={t('dashboard.server.pseudo.save', 'Save')}
        />
      </AdminModal>

      <AdminModal
        title={t('dashboard.server.pseudo.editFormat', 'Edit Format')}
        id="edit_format"
        busy={formatAction.pending()}
        onClose={discardFormat}
        onCancel={discardFormat}
      >
        <Show when={!pseudoFormat.loading && !pseudoFormat.error}>
          <FormField id="pseudo-format" label={t('dashboard.server.pseudo.format', 'Format')}>
            <input
              id="pseudo-format"
              type="text"
              class="input"
              disabled={pseudoFormat.loading || formatAction.pending()}
              value={format()}
              onInput={(e) => {
                setFormat(e.currentTarget.value)
              }}
            />
          </FormField>
          <FormField id="pseudo-format-preview" label={t('dashboard.server.pseudo.preview', 'Preview')}>
            <input id="pseudo-format-preview" type="text" class="input" value={preview()} readonly />
          </FormField>
          <details class="settings-advanced">
            <summary>{t('dashboard.server.pseudo.variables', 'Variables')}</summary>
            <ul class="text-base-content/60 list-inside">
              <li>{`{plyName} - ${t('dashboard.server.pseudo.playerName', 'Player Name')}`}</li>
              <li>{`{plySteamID64} - ${t('dashboard.server.pseudo.playerSteamID64', 'Player SteamID64')}`}</li>
              <li>{`{rolePrefix} - ${t('dashboard.server.pseudo.rolePrefix', 'Role Prefix')}`}</li>
              <li>{`{roleName} - ${t('dashboard.server.pseudo.roleName', 'Role Name')}`}</li>
            </ul>
          </details>
          <FormActions
            pending={formatAction.pending()}
            error={formatAction.error()}
            onSave={() => void updatePseudoFormat()}
            onCancel={() => closeDialog('edit_format')}
            saveLabel={t('dashboard.server.pseudo.save', 'Save')}
          />
        </Show>
      </AdminModal>

      <AdminPanel
        title={t('dashboard.server.pseudo.pseudo', 'Pseudo')}
        description={t(
          'dashboard.server.pseudo.description',
          'Define the pseudo that are synchronized with your Discord server.',
        )}
        info={t('dashboard.server.pseudo.info', 'Please note that Guild Owner will not have pseudo updates.')}
      >
        <Show when={pseudoDirection.error || pseudoFormat.error}>
          <AsyncState
            error={true}
            onRetry={() => {
              if (pseudoDirection.error) void refetchDirection()
              if (pseudoFormat.error) void refetchFormat()
            }}
          />
        </Show>
        <SettingGroup title={t('settings.sync_behavior', 'Synchronization behavior')} icon="arrow-left-right">
          <SettingRow
            controlId="server-pseudo-direction"
            title={t('dashboard.server.pseudo.pseudoSyncDirection', 'Pseudo Synchronization Direction')}
            description={t(
              'settings.sync_direction_help',
              'This direction applies to every rule below. Changes are saved automatically.',
            )}
            feedback={
              <>
                <Show when={directionAction.pending()}>
                  <p role="status">{t('ui.loading', 'Loading…')}</p>
                </Show>
                <Show when={directionAction.error()}>
                  <p role="alert" class="text-error">
                    {directionAction.error()}
                  </p>
                </Show>
                <Show when={directionAction.success()}>
                  <p role="status" class="text-success">
                    {t('ui.saved', 'Changes saved.')}
                  </p>
                </Show>
              </>
            }
          >
            <select
              id="server-pseudo-direction"
              aria-describedby="server-pseudo-direction-description"
              class="select w-full max-w-xs"
              disabled={pseudoDirection.loading || !!pseudoDirection.error || directionAction.pending()}
              value={direction()}
              aria-label={t('dashboard.server.pseudo.pseudoSyncDirection', 'Pseudo Synchronization Direction')}
              onChange={(e) => {
                updateSyncPseudoDirection(e.currentTarget.value)
              }}
            >
              <option value="discord-to-gmod" disabled={!premium()}>
                {t('dashboard.server.pseudo.fromDiscordToGmod', 'From Discord to Gmod')} <PremiumOnly />
              </option>
              <option value="gmod-to-discord">
                {t('dashboard.server.pseudo.fromGmodToDiscord', 'From Gmod to Discord')}
              </option>
              <option value="both" disabled={!premium()}>
                {t('dashboard.server.pseudo.bothWays', 'Both Ways')} <PremiumOnly />
              </option>
              <option value="disable">{t('dashboard.server.pseudo.disable', 'Disable')}</option>
            </select>
          </SettingRow>
          <Show when={!premium()}>
            <p class="settings-notice">
              <Icon name="crown" size={16} />
              {t('settings.sync_premium_help', 'Discord to game and two-way synchronization require Premium.')}
            </p>
          </Show>
          <Show when={!pseudoDirection.loading && !pseudoDirection.error && direction() === 'disable'}>
            <p class="settings-notice">
              <Icon name="info" size={16} />
              {t(
                'settings.sync_disabled',
                'Synchronization is disabled. Your format and rules are kept for when you enable it again.',
              )}
            </p>
          </Show>
        </SettingGroup>
        <SettingGroup title={t('dashboard.server.pseudo.format', 'Format')} icon="tag">
          <SettingRow
            controlId="pseudo-saved-preview"
            title={t('settings.saved_preview', 'Saved preview')}
            description={t(
              'settings.nickname_format_help',
              'Preview the saved nickname format, then edit the template and its variables.',
            )}
            stacked
          >
            <div class="flex flex-wrap items-center gap-3 w-full min-w-0">
              <input
                id="pseudo-saved-preview"
                type="text"
                class="input font-mono min-w-0 flex-1"
                aria-describedby="pseudo-saved-preview-description"
                value={renderFormat(storedFormat())}
                readonly
              />
              <Button
                disabled={pseudoFormat.loading || !!pseudoFormat.error}
                onClick={() => {
                  discardFormat()
                  showDialog('edit_format')
                }}
              >
                <Icon name="pencil" size={16} />
                {t('dashboard.server.pseudo.editFormat', 'Edit Format')}
              </Button>
            </div>
          </SettingRow>
        </SettingGroup>
      </AdminPanel>

      <AdminPanel
        title={t('dashboard.server.pseudo.rolePrefix', 'Role Prefix')}
        description={t('dashboard.server.pseudo.rolePrefixDescription', 'Define prefixes for each user group.')}
        type="none"
        icon="list"
        actions={
          <Show when={!pseudoRoles.loading && !pseudoRoles.error}>
            <BuyPremiumBtn
              subCondition={pseudoRoles().length < 3}
              btnText={t(
                'dashboard.server.pseudo.rolePrefixPremium',
                'Limited to 3 roles customization for free users.',
              )}
              hidden={pseudoRoles.loading}
            >
              <Button variant="primary" loading={listAction.pending()} onClick={() => void addRole()}>
                {t('dashboard.server.pseudo.addRole', 'Add Role')}
              </Button>
            </BuyPremiumBtn>
          </Show>
        }
      >
        <p class="settings-notice px-5 py-4">
          <Icon name="info" size={16} />
          {t(
            'settings.pseudo_rules_help',
            'Prefixes and role names are used only when the format contains {rolePrefix} or {roleName}.',
          )}
        </p>
        <div class="min-w-0 w-full overflow-x-auto">
          <table class="table border-b border-base-300 rounded-none">
            <thead>
              <tr class="text-l">
                <th>{t('dashboard.server.pseudo.userGroup', 'User Group')}</th>
                <th>{t('dashboard.server.pseudo.name', 'Name')}</th>
                <th>{t('dashboard.server.pseudo.prefix', 'Prefix')}</th>
                <th class="w-1/6 text-center">{t('dashboard.server.pseudo.active', 'Active')}</th>
                <th class="w-1/6 text-center">{t('dashboard.server.pseudo.actions', 'Actions')}</th>
              </tr>
            </thead>
            <tbody>
              <TableState
                colSpan={5}
                loading={pseudoRoles.loading}
                error={pseudoRoles.error}
                empty={!pseudoRoles.loading && !pseudoRoles.error && pseudoRoles().length === 0}
                onRetry={() => void refetchRoles()}
              >
                <For each={pseudoRoles()}>
                  {(role) => (
                    <tr>
                      <td>
                        <TextValue value={role.role} />
                      </td>
                      <td>
                        <TextValue value={role.name} />
                      </td>
                      <td>
                        <TextValue value={role.prefix} />
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
                            variant="ghost"
                            size="sm"
                            label={t('dashboard.server.pseudo.edit', 'Edit')}
                            icon="pencil"
                            disabled={listAction.pending()}
                            onClick={() => {
                              setActiveRole({ ...role })
                              roleAction.reset()
                              showDialog('edit_role_modal')
                            }}
                          />
                          <IconButton
                            variant="danger"
                            size="sm"
                            label={t('dashboard.server.pseudo.delete', 'Delete')}
                            icon="trash-2"
                            disabled={listAction.pending()}
                            onClick={() => void deleteRole(role.id)}
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

        <Show when={listAction.error()}>
          <p role="alert" class="p-4 text-sm text-error">
            {listAction.error()}
          </p>
        </Show>
      </AdminPanel>
    </>
  )
}

export default ServerPseudo
