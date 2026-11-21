import {
  AsyncState,
  Button,
  Icon,
  IconButton,
  SettingGroup,
  SettingRow,
  type IconName,
} from '../../../../components/ui/index.js'
import { createAsyncAction } from '../../../../hooks/createAsyncAction.js'
import { batch, type Component, createResource, createSignal, For, Index, onCleanup, Show } from 'solid-js'
import AdminPanel from '../../../../components/AdminPanel'
import { useI18n } from '../../../../i18n'
import { NeedWebsocket } from '../../../../components/popup/NeedWebsocket'
import { fetchAPI } from '../../../../utils/api'
import { createStore } from 'solid-js/store'

const ServerConfig: Component = () => {
  const { t, locale } = useI18n()
  const [search, setSearch] = createSignal('')
  const [category, setCategory] = createSignal('all')
  const debounceTimers: Record<string, ReturnType<typeof setTimeout>> = {}
  const confirmed = new Map<string, unknown>()
  const attempted = new Map<string, unknown>()

  // Store to hold fetched config values
  const [config, setConfig] = createStore<Record<string, unknown>>({})

  // Intermediate state for admin rank list - maintains array representation
  const [adminRankList, setAdminRankList] = createSignal<string[]>([])

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
    advanced?: boolean
  }
  const categories: SettingCategory[] = [
    {
      id: 'general',
      titleKey: 'settings.general',
      title: 'General',
      descriptionKey: 'settings.general_description',
      description: 'Language and support information shown to players.',
      icon: 'globe',
      keys: ['ig_language', 'ig_supportLink'],
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
      id: 'administration',
      titleKey: 'settings.administration',
      title: 'Administration',
      descriptionKey: 'settings.administration_description',
      description: 'Manage administrator access and maintenance mode.',
      icon: 'user-round-cog',
      keys: ['ig_maintenance', 'ig_adminRank'],
    },
    {
      id: 'advanced',
      titleKey: 'settings.advanced',
      title: 'Advanced settings',
      descriptionKey: 'settings.advanced_description',
      description: 'Client compatibility, troubleshooting and log formatting.',
      icon: 'sliders-horizontal',
      keys: ['ig_clientBranch', 'ig_debug', 'ig_redownloadMaterials', 'ig_logTimestamp'],
      advanced: true,
    },
  ]
  const normalizeSearch = (value: string) =>
    value
      .toLocaleLowerCase(locale())
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
  const matchingKeys = (group: SettingCategory) =>
    group.keys.filter((key) => {
      const query = normalizeSearch(search().trim())
      return (
        !query ||
        normalizeSearch(
          [
            t(configInfo[key].labelKey, key),
            t(configInfo[key].descriptionKey, ''),
            t(group.titleKey, group.title),
          ].join(' '),
        ).includes(query)
      )
    })
  const visibleCategories = () =>
    categories.filter((group) => (category() === 'all' || category() === group.id) && matchingKeys(group).length > 0)
  const visibleCount = () => visibleCategories().reduce((total, group) => total + matchingKeys(group).length, 0)
  const resetFilters = () => {
    setSearch('')
    setCategory('all')
  }

  const actions = Object.fromEntries(
    Object.keys(configInfo).map((key) => [
      key,
      createAsyncAction({ errorMessage: () => t('ui.save_error', 'Unable to save the changes.') }),
    ]),
  )

  const [serverConfig, { refetch }] = createResource('serverConfig', async () => {
    return fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/config', 'GET').then(async (res) => {
      if (!res.ok)
        throw new Error(
          t('dashboard.server.config.error_occurred', 'An error occurred while fetching the server configuration.'),
        )
      const data = await res.json()

      // Update store with fetched config - extract settings from nested structure
      const settings = data?.settings || {}

      // Parse ig_adminRank if it's a string
      if (settings.ig_adminRank && typeof settings.ig_adminRank === 'string') {
        if (settings.ig_adminRank === '[object Object]') {
          settings.ig_adminRank = { superadmin: true } // fallback to default
        } else {
          try {
            settings.ig_adminRank = JSON.parse(settings.ig_adminRank)
          } catch {
            settings.ig_adminRank = { superadmin: true }
          }
        }
      }

      for (const [key, info] of Object.entries(configInfo)) {
        confirmed.set(key, structuredClone(settings[key] ?? info.defaultValue))
      }
      setConfig(settings)

      // Initialize admin rank list from the fetched config
      const adminRankObj = (settings.ig_adminRank as Record<string, boolean>) || { superadmin: true }
      const rankList = Object.keys(adminRankObj)
        .filter((key) => !key.startsWith('__empty_'))
        .sort()
      setAdminRankList(rankList)

      return settings
    })
  })

  function assignValue(setting: string, value: unknown) {
    batch(() => {
      // Replace object settings as well as scalars, so deleted rank keys cannot survive a merge.
      setConfig(setting, undefined)
      setConfig(setting, structuredClone(value))
    })
  }

  function restoreRankList(value: unknown) {
    const ranks = value && typeof value === 'object' ? value : { superadmin: true }
    setAdminRankList(
      Object.keys(ranks)
        .filter((rank) => !rank.startsWith('__empty_'))
        .sort(),
    )
  }

  async function updateSetting(setting: string, value: unknown) {
    const action = actions[setting]
    if (action.pending() || serverConfig.loading || serverConfig.error) return
    clearTimeout(debounceTimers[setting])
    delete debounceTimers[setting]
    const snapshot = structuredClone(value)
    attempted.set(setting, snapshot)
    assignValue(setting, snapshot)
    const saved = await action.run(async () => {
      const sendValue =
        typeof snapshot === 'object' && snapshot !== null && !Array.isArray(snapshot)
          ? JSON.stringify(snapshot)
          : snapshot
      const response = await fetchAPI(
        `/users/:discordID/guilds/:guildID/servers/:serverID/settings/${setting}`,
        'PUT',
        { value: sendValue },
      )
      if (!response.ok) throw new Error('Setting update failed')
      const data = await response.json()
      let accepted = data && typeof data === 'object' && 'value' in data ? data.value : snapshot
      if (typeof accepted === 'string' && (accepted.startsWith('{') || accepted === '[object Object]')) {
        try {
          accepted = JSON.parse(accepted)
        } catch {
          /* Keep non-JSON strings unchanged. */
        }
      }
      confirmed.set(setting, structuredClone(accepted))
      assignValue(setting, accepted)
      if (setting === 'ig_adminRank') restoreRankList(accepted)
    })
    if (!saved) {
      const previous = confirmed.get(setting)
      assignValue(setting, previous)
      if (setting === 'ig_adminRank') restoreRankList(previous)
    }
  }

  function debouncedUpdateSetting(setting: string, value: unknown) {
    if (actions[setting].pending()) return
    actions[setting].reset()
    clearTimeout(debounceTimers[setting])
    assignValue(setting, value)
    debounceTimers[setting] = setTimeout(() => {
      delete debounceTimers[setting]
      void updateSetting(setting, value)
    }, 500)
  }

  function updateAdminRank(newList: string[]) {
    if (actions.ig_adminRank.pending()) return
    setAdminRankList(newList)
    const value = newList
      .map((rank) => rank.trim())
      .filter(Boolean)
      .reduce(
        (ranks, rank) => {
          ranks[rank] = true
          return ranks
        },
        {} as Record<string, boolean>,
      )
    debouncedUpdateSetting('ig_adminRank', value)
  }

  onCleanup(() => Object.values(debounceTimers).forEach(clearTimeout))

  const renderSetting = (key: SettingKey) => {
    const info = configInfo[key]
    const descriptionId = `${key}-description`
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
          <>
            <Show when={actions[key].pending()}>
              <p role="status" class="text-sm text-base-content/65">
                {t('ui.loading', 'Loading…')}
              </p>
            </Show>
            <Show when={actions[key].error()}>
              <div role="alert" class="flex flex-wrap items-center gap-2 text-sm text-error">
                <span>{actions[key].error()}</span>
                <Button size="sm" onClick={() => void updateSetting(key, attempted.get(key))}>
                  {t('ui.retry', 'Try again')}
                </Button>
              </div>
            </Show>
            <Show when={actions[key].success()}>
              <p role="status" class="text-sm text-success">
                {t('ui.saved', 'Saved')}
              </p>
            </Show>
          </>
        }
      >
        <Show
          when={key === 'ig_adminRank'}
          fallback={
            <Show
              when={info.acceptedValues && Array.isArray(info.acceptedValues)}
              fallback={
                <input
                  type={key === 'ig_verifyOnReadyKickTime' ? 'number' : key === 'ig_supportLink' ? 'url' : 'text'}
                  min={key === 'ig_verifyOnReadyKickTime' ? 0 : undefined}
                  step={key === 'ig_verifyOnReadyKickTime' ? 1 : undefined}
                  id={key}
                  aria-describedby={descriptionId}
                  class="input w-full"
                  value={String(config[key] ?? info.defaultValue ?? '')}
                  disabled={serverConfig.loading || !!serverConfig.error || actions[key].pending()}
                  onInput={(e) => debouncedUpdateSetting(key, e.currentTarget.value)}
                />
              }
            >
              <Show
                when={isBooleanOption(info)}
                fallback={
                  <select
                    id={key}
                    aria-describedby={descriptionId}
                    class="select w-full"
                    value={String(config[key] ?? info.defaultValue ?? '')}
                    disabled={serverConfig.loading || !!serverConfig.error || actions[key].pending()}
                    onChange={(e) => {
                      const value = e.currentTarget.value
                      updateSetting(key, value === 'true' ? true : value === 'false' ? false : value)
                    }}
                  >
                    <For each={info.acceptedValues!}>{(val) => <option value={String(val)}>{String(val)}</option>}</For>
                  </select>
                }
              >
                <input
                  type="checkbox"
                  id={key}
                  aria-describedby={descriptionId}
                  class="toggle toggle-md"
                  checked={Boolean(config[key] ?? info.defaultValue)}
                  disabled={serverConfig.loading || !!serverConfig.error || actions[key].pending()}
                  onChange={(e) => void updateSetting(key, e.currentTarget.checked)}
                />
              </Show>
            </Show>
          }
        >
          <div class="settings-ranks">
            <Index each={adminRankList()}>
              {(rank, index) => (
                <div class="flex items-center gap-2">
                  <input
                    type="text"
                    class="input w-full"
                    aria-label={`${t(info.labelKey, key)} ${index + 1}`}
                    value={rank()}
                    disabled={serverConfig.loading || !!serverConfig.error || actions[key].pending()}
                    onInput={(e) => {
                      const newList = [...adminRankList()]
                      newList[index] = e.currentTarget.value
                      updateAdminRank(newList)
                    }}
                  />
                  <IconButton
                    variant="ghost"
                    size="sm"
                    label={t('ui.remove', 'Remove')}
                    icon="x"
                    disabled={serverConfig.loading || !!serverConfig.error || actions[key].pending()}
                    onClick={() => updateAdminRank(adminRankList().filter((_, i) => i !== index))}
                  />
                </div>
              )}
            </Index>
            <Button
              size="sm"
              class="w-fit"
              disabled={serverConfig.loading || !!serverConfig.error || actions[key].pending()}
              onClick={() => setAdminRankList([...adminRankList(), ''])}
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
      <AdminPanel
        title={t('dashboard.server.config.title', 'Configuration')}
        type="none"
        description={t('dashboard.server.config.description', 'Manage the in game configuration of this server.')}
      >
        <div class="settings-browser">
          <div class="settings-toolbar">
            <label class="settings-search">
              <Icon name="search" size={17} />
              <span class="sr-only">{t('settings.search', 'Search settings')}</span>
              <input
                type="search"
                class="input w-full"
                placeholder={t('settings.search_placeholder', 'Search by name or description…')}
                value={search()}
                onInput={(event) => setSearch(event.currentTarget.value)}
              />
            </label>
            <p class="settings-autosave">
              <Icon name="circle-check" size={15} />
              {t('ui.autosave', 'Changes are saved automatically.')}
            </p>
          </div>
          <div class="settings-categories" role="group" aria-label={t('settings.categories', 'Setting categories')}>
            <Button
              size="sm"
              variant="ghost"
              class="settings-category"
              aria-pressed={category() === 'all'}
              onClick={() => setCategory('all')}
            >
              {t('settings.all', 'All settings')}
              <span>{Object.keys(configInfo).length}</span>
            </Button>
            <For each={categories}>
              {(group) => (
                <Button
                  size="sm"
                  variant="ghost"
                  class="settings-category"
                  aria-pressed={category() === group.id}
                  onClick={() => setCategory(group.id)}
                >
                  <Icon name={group.icon} size={15} />
                  {t(group.titleKey, group.title)}
                  <span>{group.keys.length}</span>
                </Button>
              )}
            </For>
          </div>
          <p class="settings-results" aria-live="polite">
            {visibleCount()} {t('settings.results', 'settings shown')}
          </p>
        </div>
        <AsyncState loading={serverConfig.loading} error={serverConfig.error} onRetry={() => void refetch()} />
        <Show
          when={visibleCount() > 0}
          fallback={
            <div class="settings-empty">
              <Icon name="search" size={25} />
              <p>{t('settings.no_results', 'No settings match your search in this category.')}</p>
              <Button size="sm" onClick={resetFilters}>
                {t('settings.reset_filters', 'Reset filters')}
              </Button>
            </div>
          }
        >
          <For each={visibleCategories()}>
            {(group) => (
              <Show
                when={!group.advanced}
                fallback={
                  <details class="settings-advanced" open={!!search().trim() || category() === 'advanced'}>
                    <summary>
                      <Icon name={group.icon} />
                      <span>
                        <strong>{t(group.titleKey, group.title)}</strong>
                        <span>{t(group.descriptionKey, group.description)}</span>
                      </span>
                      <Icon name="chevron-down" size={16} />
                    </summary>
                    <div class="settings-advanced-content">
                      <For each={matchingKeys(group)}>{(key) => renderSetting(key)}</For>
                    </div>
                  </details>
                }
              >
                <SettingGroup
                  id={`config-${group.id}`}
                  title={t(group.titleKey, group.title)}
                  description={t(group.descriptionKey, group.description)}
                  icon={group.icon}
                >
                  <For each={matchingKeys(group)}>{(key) => renderSetting(key)}</For>
                </SettingGroup>
              </Show>
            )}
          </For>
        </Show>
      </AdminPanel>
    </>
  )
}

export default ServerConfig
