import {
  AsyncState,
  Button,
  Icon,
  IconButton,
  AutosaveFeedback,
  SettingRow,
  type IconName,
} from '../../../../components/ui/index.js'
import { createDraftForm } from '../../../../hooks/createDraftForm.js'
import { createAutosave } from '../../../../hooks/createAutosave.js'
import { saveDashboardSettings } from '../../../../utils/dashboardSettings.js'
import { batch, type Component, createEffect, createResource, createSignal, For, Index, Show } from 'solid-js'
import AdminPanel from '../../../../components/AdminPanel.js'
import { useI18n } from '../../../../i18n.js'
import { NeedWebsocket } from '../../../../components/popup/NeedWebsocket.js'
import { fetchAPI } from '../../../../utils/api.js'

type WhitelistRole = { id: string; name: string }
const isRoleID = (value: unknown): value is string => typeof value === 'string' && /^\d{17,20}$/.test(value)

const ServerConfig: Component = () => {
  const { t } = useI18n()
  const isBooleanOption = (info: { acceptedValues: unknown }) =>
    Array.isArray(info.acceptedValues) &&
    (info.acceptedValues as Array<unknown>).includes(true) &&
    (info.acceptedValues as Array<unknown>).includes(false)
  const configInfo = {
    // in game settings
    // Punishment
    // gmInte.config.syncBan = true // If true, the addon will sync gmod bans with discord bans (and vice versa)
    // gmInte.config.syncTimeout = false // If true, the addon will sync gmod timeouts with discord timeouts (and vice versa)
    // gmInte.config.syncKick = false // If true, the addon will sync gmod kicks with discord kicks (and vice versa)
    ig_syncBan: {
      defaultValue: true,
      acceptedValues: [true, false],
      labelKey: 'dashboard.server.config.settings.ig_syncBan.title',
      descriptionKey: 'dashboard.server.config.settings.ig_syncBan.description',
    },
    ig_syncTimeout: {
      defaultValue: false,
      acceptedValues: [true, false],
      labelKey: 'dashboard.server.config.settings.ig_syncTimeout.title',
      descriptionKey: 'dashboard.server.config.settings.ig_syncTimeout.description',
    },
    ig_syncKick: {
      defaultValue: false,
      acceptedValues: [true, false],
      labelKey: 'dashboard.server.config.settings.ig_syncKick.title',
      descriptionKey: 'dashboard.server.config.settings.ig_syncKick.description',
    },
    // Ban
    // gmInte.config.filterOnBan = true // If true, the addon will filter the players according to their ban status
    ig_filterOnBan: {
      defaultValue: true,
      acceptedValues: [true, false],
      labelKey: 'dashboard.server.config.settings.ig_filterOnBan.title',
      descriptionKey: 'dashboard.server.config.settings.ig_filterOnBan.description',
    },
    // Materials
    // gmInte.config.redownloadMaterials = false // If true, the addon will redownload the materials of the addon (useful if you have a problem with the materials)
    ig_redownloadMaterials: {
      defaultValue: false,
      acceptedValues: [true, false],
      labelKey: 'dashboard.server.config.settings.ig_redownloadMaterials.title',
      descriptionKey: 'dashboard.server.config.settings.ig_redownloadMaterials.description',
    },
    // Debug & Development
    // gmInte.config.debug = false // If true, the addon will show debug informations in the console
    ig_debug: {
      defaultValue: false,
      acceptedValues: [true, false],
      labelKey: 'dashboard.server.config.settings.ig_debug.title',
      descriptionKey: 'dashboard.server.config.settings.ig_debug.description',
    },
    // Security
    // gmInte.config.forcePlayerLink = false // If true, the addon will force the players to link their discord account to their steam account before playing
    // gmInte.config.verifyOnJoin = false // If true, the addon will verify the players when they join the server or on player ready
    // gmInte.config.verifyOnReadyKickTime = 600 // The time in seconds before kicking a player that is not verified (0 to disable)
    // gmInte.config.verifyFamilySharing = false // If true, the addon will verify the family sharing of the players
    // gmInte.config.clientBranch = "any" // The branch of the addon that the clients should use (none, dev, prerelease, x86-64)
    ig_forcePlayerLink: {
      defaultValue: false,
      acceptedValues: [true, false],
      labelKey: 'dashboard.server.config.settings.ig_forcePlayerLink.title',
      descriptionKey: 'dashboard.server.config.settings.ig_forcePlayerLink.description',
    },
    ig_verifyOnJoin: {
      defaultValue: false,
      acceptedValues: [true, false],
      labelKey: 'dashboard.server.config.settings.ig_verifyOnJoin.title',
      descriptionKey: 'dashboard.server.config.settings.ig_verifyOnJoin.description',
    },
    ig_verifyOnReadyKickTime: {
      defaultValue: 600,
      acceptedValues: null,
      labelKey: 'dashboard.server.config.settings.ig_verifyOnReadyKickTime.title',
      descriptionKey: 'dashboard.server.config.settings.ig_verifyOnReadyKickTime.description',
    },
    ig_verifyFamilySharing: {
      defaultValue: false,
      acceptedValues: [true, false],
      labelKey: 'dashboard.server.config.settings.ig_verifyFamilySharing.title',
      descriptionKey: 'dashboard.server.config.settings.ig_verifyFamilySharing.description',
    },
    ig_clientBranch: {
      defaultValue: 'any',
      acceptedValues: ['none', 'dev', 'prerelease', 'x86-64', 'any'],
      labelKey: 'dashboard.server.config.settings.ig_clientBranch.title',
      descriptionKey: 'dashboard.server.config.settings.ig_clientBranch.description',
    },
    // Other
    // gmInte.config.supportLink = "" // The link of your support (shown when a player do not have the requiments to join the server)
    // gmInte.config.maintenance = false // If true, the addon will only allow the players with the "gmod-integration.maintenance" permission to join the server
    // gmInte.config.language = "en" // The language of the addon (en, fr, de, es, it, tr, ru)
    // gmInte.config.logTimestamp = "%H:%M:%S" // The timestamp format of the logs
    // gmInte.config.adminRank = {
    //     // How can edit the configuration of the addon / bypass the maintenance mode
    //     ["superadmin"] = true,
    // }
    ig_supportLink: {
      defaultValue: '',
      acceptedValues: null,
      labelKey: 'dashboard.server.config.settings.ig_supportLink.title',
      descriptionKey: 'dashboard.server.config.settings.ig_supportLink.description',
    },
    ig_maintenance: {
      defaultValue: false,
      acceptedValues: [true, false],
      labelKey: 'dashboard.server.config.settings.ig_maintenance.title',
      descriptionKey: 'dashboard.server.config.settings.ig_maintenance.description',
    },
    maintenance_whitelist_role: {
      defaultValue: '',
      acceptedValues: null,
      labelKey: 'dashboard.server.config.settings.maintenance_whitelist_role.title',
      descriptionKey: 'dashboard.server.config.settings.maintenance_whitelist_role.description',
    },
    ig_language: {
      defaultValue: 'en',
      acceptedValues: ['en', 'fr', 'de', 'es', 'it', 'tr', 'ru'],
      labelKey: 'dashboard.server.config.settings.ig_language.title',
      descriptionKey: 'dashboard.server.config.settings.ig_language.description',
    },
    ig_logTimestamp: {
      defaultValue: '%H:%M:%S',
      acceptedValues: null,
      labelKey: 'dashboard.server.config.settings.ig_logTimestamp.title',
      descriptionKey: 'dashboard.server.config.settings.ig_logTimestamp.description',
    },
    ig_adminRank: {
      defaultValue: {
        superadmin: true,
      },
      acceptedValues: null,
      labelKey: 'dashboard.server.config.settings.ig_adminRank.title',
      descriptionKey: 'dashboard.server.config.settings.ig_adminRank.description',
    },
  }

  type SettingKey = keyof typeof configInfo
  type SettingCategory = {
    id: string
    titleKey: string
    title: string
    descriptionKey: string
    description: string
    icon: IconName
    keys: SettingKey[]
  }
  const categories: SettingCategory[] = [
    {
      id: 'general',
      titleKey: 'settings.general_administration',
      title: 'General and administration',
      descriptionKey: 'settings.general_administration_description',
      description: 'Language, support information and administrator access.',
      icon: 'globe',
      keys: ['ig_language', 'ig_supportLink', 'ig_maintenance', 'maintenance_whitelist_role', 'ig_adminRank'],
    },
    {
      id: 'access',
      titleKey: 'settings.access',
      title: 'Access and verification',
      descriptionKey: 'settings.access_description',
      description: 'Choose how players link their accounts and are verified when joining.',
      icon: 'shield-check',
      keys: ['ig_forcePlayerLink', 'ig_verifyOnJoin', 'ig_verifyOnReadyKickTime', 'ig_verifyFamilySharing'],
    },
    {
      id: 'moderation',
      titleKey: 'settings.moderation',
      title: 'Moderation',
      descriptionKey: 'settings.moderation_description',
      description: 'Synchronize sanctions between Discord and the game server.',
      icon: 'ban',
      keys: ['ig_syncBan', 'ig_syncTimeout', 'ig_syncKick', 'ig_filterOnBan'],
    },
    {
      id: 'advanced',
      titleKey: 'settings.advanced',
      title: 'Advanced settings',
      descriptionKey: 'settings.advanced_description',
      description: 'Client compatibility, troubleshooting and log formatting.',
      icon: 'sliders-horizontal',
      keys: ['ig_clientBranch', 'ig_debug', 'ig_redownloadMaterials', 'ig_logTimestamp'],
    },
  ]
  type ConfigValues = Partial<Record<SettingKey, unknown>>
  const normalizeValue = (key: SettingKey, value: unknown) => {
    const fallback = configInfo[key].defaultValue
    if (key === 'ig_adminRank') {
      let ranks = value
      if (typeof ranks === 'string') {
        try {
          ranks = JSON.parse(ranks)
        } catch {
          ranks = fallback
        }
      }
      if (!ranks || typeof ranks !== 'object' || Array.isArray(ranks)) ranks = fallback
      return Object.keys(ranks as Record<string, unknown>)
        .filter((rank) => !rank.startsWith('__empty_'))
        .sort()
    }
    if (isBooleanOption(configInfo[key])) return value === true || value === 'true' || value === 1 || value === '1'
    return value ?? fallback
  }
  const groupValues = (group: SettingCategory, values: Record<string, unknown>): ConfigValues =>
    Object.fromEntries(group.keys.map((key) => [key, normalizeValue(key, values[key] ?? configInfo[key].defaultValue)]))
  const serializeValue = (key: SettingKey, value: unknown) => {
    if (key === 'ig_adminRank') return Object.fromEntries((value as string[]).map((rank) => [rank.trim(), true]))
    if (key === 'ig_verifyOnReadyKickTime') return Number(value)
    if (key === 'ig_supportLink') return String(value).trim()
    return value
  }
  const invalid = () => t('ui.invalid_value', 'Enter a valid value.')
  const validate = (group: SettingCategory, values: ConfigValues) => {
    const errors: Partial<Record<SettingKey, string>> = {}
    for (const key of group.keys) {
      const value = values[key]
      if (key === 'ig_verifyOnReadyKickTime') {
        const number = Number(value)
        if (String(value).trim() === '' || !Number.isFinite(number) || !Number.isInteger(number) || number < 0)
          errors[key] = t('dashboard.server.config.invalid_delay', 'Enter a whole number of seconds, 0 or greater.')
      } else if (key === 'ig_supportLink' && String(value).trim()) {
        try {
          const url = new URL(String(value).trim())
          if (!['http:', 'https:'].includes(url.protocol))
            errors[key] = t(
              'dashboard.server.config.invalid_support_url',
              'Enter an HTTP or HTTPS link, or leave this field empty.',
            )
        } catch {
          errors[key] = t(
            'dashboard.server.config.invalid_support_url',
            'Enter an HTTP or HTTPS link, or leave this field empty.',
          )
        }
      } else if (key === 'maintenance_whitelist_role') {
        if (value !== '' && !isRoleID(value))
          errors[key] = t(
            'dashboard.server.config.whitelist_role_invalid',
            'Choose an available Discord role or no role.',
          )
      } else if (key === 'ig_adminRank') {
        const ranks = value as string[]
        const trimmed = ranks.map((rank) => rank.trim())
        if (trimmed.some((rank) => !rank) || new Set(trimmed).size !== trimmed.length)
          errors[key] = t(
            'dashboard.server.config.invalid_admin_ranks',
            'Enter a different, non-empty game user group on each row.',
          )
      } else if (configInfo[key].acceptedValues && !isBooleanOption(configInfo[key])) {
        if (!(configInfo[key].acceptedValues as unknown[]).includes(value)) errors[key] = invalid()
      }
    }
    return errors
  }
  const makeForm = (group: SettingCategory) =>
    createDraftForm<ConfigValues>({
      initial: groupValues(group, {}),
      allowPendingEdits: true,
      validate: (draft) => validate(group, draft),
      errorMessage: () => t('ui.save_error', 'Unable to save the changes.'),
    })
  type ConfigForm = ReturnType<typeof makeForm>
  // Each settings group owns its saved snapshot and pending edits.
  const forms = new Map(categories.map((group) => [group.id, makeForm(group)]))
  const [syncPending, setSyncPending] = createSignal<Record<string, boolean>>({})
  const formFor = (key: SettingKey) => forms.get(categories.find((group) => group.keys.includes(key))!.id)!

  const [serverConfig, { refetch }] = createResource('serverConfig', async () => {
    const response = await fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/config', 'GET')
    if (!response.ok) throw new Error('Unable to load the server configuration.')
    const data = await response.json()
    const settings =
      data?.settings && typeof data.settings === 'object' ? (data.settings as Record<string, unknown>) : {}
    batch(() => {
      for (const group of categories) forms.get(group.id)!.reset(groupValues(group, settings))
      setSyncPending({})
    })
    return settings
  })
  const [roles, { refetch: refetchRoles }] = createResource(async (): Promise<WhitelistRole[]> => {
    const response = await fetchAPI('/users/:discordID/guilds/:guildID/roles', 'GET')
    if (!response.ok) throw new Error('Discord roles unavailable')
    const data: unknown = await response.json()
    if (!Array.isArray(data) || data.some((role) => !role || !isRoleID(role.id) || typeof role.name !== 'string'))
      throw new Error('Invalid Discord roles')
    return data as WhitelistRole[]
  })
  const availableRoles = () => (roles.loading || roles.error ? [] : (roles() ?? []))
  const unavailable = (_form: ConfigForm) => serverConfig.loading || !!serverConfig.error
  const rankList = () => formFor('ig_adminRank').draft().ig_adminRank as string[]
  const updateRanks = (ranks: string[]) => formFor('ig_adminRank').patch({ ig_adminRank: ranks })
  const saveGroup = async (group: SettingCategory) => {
    const form = forms.get(group.id)!
    if (unavailable(form)) return
    await form.save(async (snapshot) => {
      const changes = Object.fromEntries(
        group.keys
          .filter((key) => JSON.stringify(snapshot[key]) !== JSON.stringify(form.saved()[key]))
          .map((key) => [key, serializeValue(key, snapshot[key])]),
      )
      const result = await saveDashboardSettings('server', changes)
      setSyncPending((previous) => ({ ...previous, [group.id]: result.sync === 'pending' }))
      const serialized = Object.fromEntries(group.keys.map((key) => [key, serializeValue(key, snapshot[key])]))
      return groupValues(group, { ...serialized, ...result.settings })
    })
  }
  const autosaves = new Map(
    categories.map((group) => [
      group.id,
      createAutosave({
        form: forms.get(group.id)!,
        save: () => saveGroup(group),
        enabled: () => !serverConfig.loading && !serverConfig.error,
      }),
    ]),
  )
  const renderFeedback = (group: SettingCategory) => {
    return (
      <div class="settings-save-feedback">
        <AutosaveFeedback
          state={autosaves.get(group.id)!}
          message={
            !forms.get(group.id)!.dirty() && syncPending()[group.id]
              ? t('ui.sync_pending', 'Changes saved. Synchronization is pending.')
              : undefined
          }
        />
      </div>
    )
  }

  const renderSetting = (key: SettingKey) => {
    const info = configInfo[key]
    const descriptionId = `${key}-description`
    const form = formFor(key)
    const error = () => form.errors()[key]
    const describedBy = () => `${descriptionId}${error() ? ` ${key}-error` : ''}`
    return (
      <SettingRow
        controlId={key === 'ig_adminRank' ? undefined : key}
        title={t(info.labelKey, key)}
        description={
          <>
            <span>{t(info.descriptionKey, '')}</span>
            <Show when={key === 'ig_verifyOnJoin'}>
              <p class="settings-dependency">
                <Icon name="info" size={13} />
                {t('settings.verification_dependency', 'This check applies when forced account linking is enabled.')}
              </p>
            </Show>
            <Show when={key === 'ig_verifyOnReadyKickTime'}>
              <p class="settings-dependency">
                <Icon name="info" size={13} />
                {t(
                  'settings.kick_delay_dependency',
                  'Account-link kicks require forced linking. Client-branch checks also use this delay, or 600 seconds when it is set to 0.',
                )}
              </p>
            </Show>
          </>
        }
        feedback={
          error() ? (
            <p id={`${key}-error`} role="alert" class="text-error">
              {error()}
            </p>
          ) : undefined
        }
      >
        <Show
          when={key === 'ig_adminRank'}
          fallback={
            <Show
              when={info.acceptedValues && Array.isArray(info.acceptedValues)}
              fallback={
                <Show
                  when={key === 'maintenance_whitelist_role'}
                  fallback={
                    <input
                      type={key === 'ig_verifyOnReadyKickTime' ? 'number' : key === 'ig_supportLink' ? 'url' : 'text'}
                      min={key === 'ig_verifyOnReadyKickTime' ? 0 : undefined}
                      step={key === 'ig_verifyOnReadyKickTime' ? 1 : undefined}
                      id={key}
                      aria-describedby={describedBy()}
                      aria-invalid={!!error() || undefined}
                      class="input w-full"
                      value={String(form.draft()[key] ?? info.defaultValue ?? '')}
                      disabled={unavailable(form)}
                      onInput={(e) => {
                        const value = e.currentTarget.value
                        form.patch({
                          [key]: key === 'ig_verifyOnReadyKickTime' && value !== '' ? Number(value) : value,
                        })
                      }}
                    />
                  }
                >
                  <div class="flex min-w-0 w-full flex-col gap-2">
                    <select
                      ref={(select) => {
                        createEffect(() => {
                          // Reapply the draft after asynchronous options replace the saved-role placeholder.
                          availableRoles()
                          select.value = String(form.draft()[key] ?? '')
                        })
                      }}
                      id={key}
                      class="select w-full"
                      aria-describedby={describedBy()}
                      aria-invalid={!!error() || undefined}
                      value={String(form.draft()[key] ?? '')}
                      disabled={unavailable(form) || (!form.draft()[key] && (roles.loading || !!roles.error))}
                      onChange={(event) => {
                        const value = event.currentTarget.value
                        if (value === '' || availableRoles().some((role) => role.id === value))
                          form.patch({ [key]: value })
                      }}
                    >
                      <option value="">{t('dashboard.server.config.whitelist_no_role', 'No Discord role')}</option>
                      <Show when={form.draft()[key] && !availableRoles().some((role) => role.id === form.draft()[key])}>
                        <option value={String(form.draft()[key])} disabled>
                          {t(
                            'dashboard.server.config.whitelist_role_missing',
                            'Unavailable role ({1})',
                            String(form.draft()[key]),
                          )}
                        </option>
                      </Show>
                      <For each={availableRoles()}>
                        {(role) => <option value={role.id}>@{role.name || role.id}</option>}
                      </For>
                    </select>
                    <AsyncState
                      loading={roles.loading}
                      error={roles.error}
                      loadingLabel={t('dashboard.server.config.whitelist_roles_loading', 'Loading Discord roles…')}
                      errorLabel={t(
                        'dashboard.server.config.whitelist_roles_error',
                        'Unable to load Discord roles. Try again, or remove the current role.',
                      )}
                      onRetry={() => void refetchRoles()}
                    />
                  </div>
                </Show>
              }
            >
              <Show
                when={isBooleanOption(info)}
                fallback={
                  <select
                    id={key}
                    aria-describedby={describedBy()}
                    aria-invalid={!!error() || undefined}
                    class="select w-full"
                    value={String(form.draft()[key] ?? info.defaultValue ?? '')}
                    disabled={unavailable(form)}
                    onChange={(e) => {
                      const value = e.currentTarget.value
                      form.patch({ [key]: value })
                    }}
                  >
                    <For each={info.acceptedValues!}>{(val) => <option value={String(val)}>{String(val)}</option>}</For>
                  </select>
                }
              >
                <input
                  type="checkbox"
                  id={key}
                  aria-describedby={describedBy()}
                  aria-invalid={!!error() || undefined}
                  class="toggle toggle-md"
                  checked={Boolean(form.draft()[key] ?? info.defaultValue)}
                  disabled={unavailable(form)}
                  onChange={(e) => form.patch({ [key]: e.currentTarget.checked })}
                />
              </Show>
            </Show>
          }
        >
          <div class="settings-ranks">
            <Index each={rankList()}>
              {(rank, index) => (
                <div class="flex items-center gap-2">
                  <input
                    type="text"
                    class="input w-full"
                    aria-label={`${t(info.labelKey, key)} ${index + 1}`}
                    aria-describedby={describedBy()}
                    aria-invalid={!!error() || undefined}
                    value={rank()}
                    disabled={unavailable(form)}
                    onInput={(e) => {
                      const newList = [...rankList()]
                      newList[index] = e.currentTarget.value
                      updateRanks(newList)
                    }}
                  />
                  <IconButton
                    variant="ghost"
                    size="sm"
                    label={t('ui.remove', 'Remove')}
                    icon="x"
                    disabled={unavailable(form)}
                    onClick={() => updateRanks(rankList().filter((_, i) => i !== index))}
                  />
                </div>
              )}
            </Index>
            <Button
              size="sm"
              class="w-fit"
              disabled={unavailable(form)}
              onClick={() => updateRanks([...rankList(), ''])}
            >
              {t('dashboard.server.config.add_admin_rank', 'Add rank')}
            </Button>
          </div>
        </Show>
        <details class="settings-default">
          <summary>{t('dashboard.server.config.default', 'Default')}</summary>
          <code>
            {typeof info.defaultValue === 'object'
              ? JSON.stringify(info.defaultValue)
              : String(info.defaultValue === '' ? '—' : info.defaultValue)}
          </code>
        </details>
      </SettingRow>
    )
  }

  return (
    <>
      <NeedWebsocket />
      <AsyncState loading={serverConfig.loading} error={serverConfig.error} onRetry={() => void refetch()} />
      <div class="settings-card-grid">
        <For each={categories}>
          {(group) => (
            <AdminPanel
              id={`config-${group.id}`}
              title={t(group.titleKey, group.title)}
              description={t(group.descriptionKey, group.description)}
              icon={group.icon}
            >
              <For each={group.keys}>{(key) => renderSetting(key)}</For>
              {renderFeedback(group)}
            </AdminPanel>
          )}
        </For>
      </div>
    </>
  )
}

export default ServerConfig
