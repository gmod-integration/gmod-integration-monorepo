import { Component, createResource, createSignal, For, Index, Show } from 'solid-js'
import AdminPanel from '../../../../components/AdminPanel'
import { useI18n } from '../../../../i18n'
import { NeedWebsocket } from '../../../../components/popup/NeedWebsocket'
import { fetchAPI } from '../../../../utils/api'
import { createStore } from 'solid-js/store'

const ServerConfig: Component = () => {
  const { t } = useI18n()
  const [debounceTimers, setDebounceTimers] = createSignal<Record<string, NodeJS.Timeout>>({})

  // Store to hold fetched config values
  const [config, setConfig] = createStore<Record<string, unknown>>({})

  // Intermediate state for admin rank list - maintains array representation
  const [adminRankList, setAdminRankList] = createSignal<string[]>([])
  const [adminRankListDebounce, setAdminRankListDebounce] = createSignal<NodeJS.Timeout | null>(null)

  const isBooleanOption = (info: { acceptedValues: unknown }) =>
    Array.isArray(info.acceptedValues) &&
    (info.acceptedValues as Array<unknown>).includes(true) &&
    (info.acceptedValues as Array<unknown>).includes(false)
  const toAdminRankObject = (ranks: string[]) =>
    ranks
      .map((rank) => rank.trim())
      .filter((rank) => rank.length > 0)
      .reduce(
        (acc, rank) => {
          acc[rank] = true
          return acc
        },
        {} as Record<string, boolean>,
      )
  // Fix duplication issue and ensure proper updates on remove
  const toAdminRankObjectWithEmpty = (ranks: string[]) =>
    ranks.reduce(
      (acc, rank, index) => {
        const trimmed = rank.trim()
        if (trimmed.length > 0 && !acc[trimmed]) {
          acc[trimmed] = true
        } else if (trimmed.length === 0 && !acc[`__empty_${index}`]) {
          acc[`__empty_${index}`] = true
        }
        return acc
      },
      {} as Record<string, boolean>,
    )
  const getAdminRankList = (value: unknown) => {
    if (Array.isArray(value)) return value as string[]
    // Handle string that might be "[object Object]" or stringified JSON
    if (typeof value === 'string') {
      if (value === '[object Object]' || value === '') return []
      try {
        const parsed = JSON.parse(value)
        if (parsed && typeof parsed === 'object') {
          return Object.keys(parsed).map((key) => {
            if (key.startsWith('__empty_')) return ''
            return key
          })
        }
      } catch {
        return []
      }
    }
    if (value && typeof value === 'object') {
      return Object.keys(value as Record<string, boolean>).map((key) => {
        if (key.startsWith('__empty_')) return ''
        return key
      })
    }
    return [] as string[]
  }
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

  const [serverConfig, { refetch: refetchConfig }] = createResource('serverConfig', async () => {
    return fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/config', 'GET').then(async (res) => {
      if (!res.ok)
        throw new Error(
          t('dashboard.server.config.error_occurred', 'An error occurred while fetching the server configuration.'),
        )
      const data = await res.json()
      console.log('Fetched config:', data)

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

  function updateSetting(setting: string, value: unknown) {
    // Debug log to check what's being sent
    console.log(`Updating ${setting}:`, value, typeof value)

    // Convert object values to JSON strings for objects like adminRank
    let sendValue: unknown = value
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      sendValue = JSON.stringify(value)
    }

    fetchAPI(`/users/:discordID/guilds/:guildID/servers/:serverID/settings/${setting}`, 'PUT', {
      value: sendValue,
    })
      .then((res) => {
        if (res.ok) {
          return res.json()
        } else {
          throw new Error('An error occurred while updating the setting.')
        }
      })
      .then((data) => {
        console.log(`Received response for ${setting}:`, data)
        let value = data.value
        // Parse stringified objects back
        if (typeof value === 'string' && (value.startsWith('{') || value === '[object Object]')) {
          try {
            value = JSON.parse(value)
          } catch {
            // Keep as string if parsing fails
          }
        }
        setConfig(setting, value)
      })
  }

  function updateAdminRank(newList: string[]) {
    // Update the intermediate state
    setAdminRankList(newList)

    // Clear existing debounce timer
    const existingTimer = adminRankListDebounce()
    if (existingTimer) {
      clearTimeout(existingTimer)
    }

    // Set new debounce timer for API update
    const newTimer = setTimeout(() => {
      // Clean empty values before converting to object
      const cleanedList = newList.map((rank) => rank.trim()).filter((rank) => rank.length > 0)

      // Convert to object format
      const adminRankObject = cleanedList.reduce(
        (acc, rank) => {
          acc[rank] = true
          return acc
        },
        {} as Record<string, boolean>,
      )

      // Update config store with the object representation
      setConfig('ig_adminRank', adminRankObject)

      // Send to server
      updateSetting('ig_adminRank', adminRankObject)
    }, 500)

    setAdminRankListDebounce(newTimer)
  }

  function debouncedUpdateSetting(setting: string, value: unknown) {
    // Clear existing timer for this setting
    const timers = debounceTimers()
    if (timers[setting]) {
      clearTimeout(timers[setting])
    }

    // Update local state immediately for UI responsiveness
    setConfig(setting, value)

    // Set new timer
    const newTimer = setTimeout(() => {
      updateSetting(setting, value)
    }, 500) // 500ms debounce

    // Save the new timer
    setDebounceTimers({
      ...timers,
      [setting]: newTimer,
    })
  }

  return (
    <>
      <NeedWebsocket />

      <AdminPanel
        title={t('dashboard.server.config.title', 'Configuration')}
        type="none"
        description={t('dashboard.server.config.description', 'Manage the in game configuration of this server.')}
      >
        <div class="flex flex-col">
          <For each={Object.entries(configInfo)}>
            {([key, info]) => (
              <div class="flex flex-col gap-2 p-4 border-b border-base-200/30 s">
                <div class="flex items-center gap-4">
                  <div class="flex flex-col w-1/2">
                    <span class="font-medium">{t(info.labelKey, key)}</span>
                    <span class="text-xs text-base-content/60">{t(info.descriptionKey, '')}</span>
                  </div>
                  <div class="flex items-center gap-4 w-1/2">
                    <Show
                      when={key === 'ig_adminRank'}
                      fallback={
                        <Show
                          when={info.acceptedValues && Array.isArray(info.acceptedValues)}
                          fallback={
                            <input
                              type="text"
                              id={key}
                              class="input"
                              value={String(config[key] ?? info.defaultValue ?? '')}
                              disabled={serverConfig.loading}
                              onInput={(e) => {
                                const newValue = e.currentTarget.value
                                debouncedUpdateSetting(key, newValue)
                              }}
                            />
                          }
                        >
                          <Show
                            when={isBooleanOption(info)}
                            fallback={
                              <select
                                id={key}
                                class="select"
                                value={String(config[key] ?? info.defaultValue ?? '')}
                                disabled={serverConfig.loading}
                                onChange={(e) => {
                                  const value = e.currentTarget.value
                                  let parsedValue: any = value
                                  if (value === 'true') parsedValue = true
                                  else if (value === 'false') parsedValue = false
                                  updateSetting(key, parsedValue)
                                }}
                              >
                                <For each={info.acceptedValues!}>
                                  {(val) => (
                                    <option value={String(val)} selected={config[key] === val}>
                                      {String(val)}
                                    </option>
                                  )}
                                </For>
                              </select>
                            }
                          >
                            <input
                              type="checkbox"
                              class="toggle toggle-md"
                              checked={Boolean(serverConfig()?.[key] ?? info.defaultValue)}
                              disabled={serverConfig.loading}
                              onChange={(e) => {
                                updateSetting(key, e.currentTarget.checked)
                              }}
                            />
                          </Show>
                        </Show>
                      }
                    >
                      <div class="flex flex-col gap-2">
                        <Index each={adminRankList()}>
                          {(rank, index) => (
                            <div class="flex items-center gap-2">
                              <input
                                type="text"
                                class="input w-full"
                                value={rank()}
                                disabled={serverConfig.loading}
                                onInput={(e) => {
                                  const newList = [...adminRankList()]
                                  newList[index] = e.currentTarget.value
                                  updateAdminRank(newList)
                                }}
                              />
                              <button
                                class="btn btn-ghost btn-sm"
                                disabled={serverConfig.loading}
                                onClick={() => {
                                  const newList = adminRankList().filter((_, i) => i !== index)
                                  updateAdminRank(newList)
                                }}
                              >
                                <i class="fa-solid fa-xmark"></i>
                              </button>
                            </div>
                          )}
                        </Index>
                        <button
                          class="btn btn-base-200 btn-sm w-fit"
                          disabled={serverConfig.loading}
                          onClick={() => {
                            setAdminRankList([...adminRankList(), ''])
                          }}
                        >
                          {t('dashboard.server.config.add_admin_rank', 'Add rank')}
                        </button>
                      </div>
                    </Show>
                  </div>
                </div>
                <span class="text-xs text-base-content/60">
                  {t('dashboard.server.config.default', 'Default')}:{' '}
                  {key === 'ig_adminRank'
                    ? JSON.stringify(info.defaultValue)
                    : typeof info.defaultValue === 'object'
                      ? JSON.stringify(info.defaultValue)
                      : String(info.defaultValue)}
                </span>
              </div>
            )}
          </For>
        </div>
      </AdminPanel>
    </>
  )
}

export default ServerConfig
