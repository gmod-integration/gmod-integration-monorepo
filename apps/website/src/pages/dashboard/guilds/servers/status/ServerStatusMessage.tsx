import { closeDialog, showDialog } from '../../../../../utils/dialog.js'
import { type Component, createEffect, createResource, createSignal, For, Show } from 'solid-js'
import type { StatusPreviewSettings } from '@gmod/schema/server/StatusMessagePreviewSchema.js'
import AdminPanel from '../../../../../components/AdminPanel.js'
import { guildChannelsRefetch } from '../../GuildInformations.js'
import { ChannelSelector } from '../../../../../components/AdminChannelSelector.js'
import { useI18n } from '../../../../../i18n.js'
import DiscordMessage from '../../../../../components/discord/DiscordMessage.js'
import DiscordStatusPreview from '../../../../../components/discord/DiscordStatusPreview.js'
import { premium, PremiumBadge } from '../../../../../utils/premium.js'
import { fetchAPI } from '../../../../../utils/api.js'
import { useStatusPreview } from './StatusPreviewContext.js'

const STATUS_URL = '/users/:discordID/guilds/:guildID/servers/:serverID/status'
const SETTINGS_URL = '/users/:discordID/guilds/:guildID/servers/:serverID/settings/'
type Settings = Required<StatusPreviewSettings>
type Status = { channel?: string; message?: string }
const defaults: Settings = { show_player_list_status: false, status_player_list_format: '', show_status_chart: false }
const keys = Object.keys(defaults) as (keyof Settings)[]
const asBoolean = (value: unknown) => value === true || value === 'true' || value === 1 || value === '1'

const ServerStatusMessage: Component = () => {
  const { t } = useI18n()
  const preview = useStatusPreview()
  const [status, setStatus] = createSignal<Status>({})
  const [stored, setStored] = createSignal<Settings>({ ...defaults })
  const [draft, setDraft] = createSignal<Settings>({ ...defaults })
  const [busy, setBusy] = createSignal(false)
  const [operationError, setOperationError] = createSignal('')
  const [selectedChannel, setSelectedChannel] = createSignal('')
  const [formatOpen, setFormatOpen] = createSignal(false)
  const [sendOpen, setSendOpen] = createSignal(false)
  let formatAtOpen = ''
  let formatCommitted = false

  const [configuration, { refetch }] = createResource(async () => {
    const responses = await Promise.all([
      fetchAPI(STATUS_URL, 'GET'),
      ...keys.map((setting) => fetchAPI(SETTINGS_URL + setting, 'GET')),
    ])
    if (responses.some((response) => !response.ok)) throw new Error('Status settings request failed')
    const [message, players, format, chart] = await Promise.all(responses.map((response) => response.json()))
    return {
      status: message as Status,
      settings: {
        show_player_list_status: asBoolean(players.value),
        status_player_list_format: typeof format.value === 'string' ? format.value : '',
        show_status_chart: asBoolean(chart.value),
      },
    }
  })

  createEffect(() => {
    if (configuration.loading || configuration.error) return
    const data = configuration()!
    setStatus(data.status)
    setStored({ ...data.settings })
    setDraft({ ...data.settings })
  })
  createEffect(() => {
    if (!configuration.loading && !configuration.error) preview?.setSettings(draft())
  })

  const dirty = () => keys.some((key) => draft()[key] !== stored()[key])
  const unavailable = () => configuration.loading || !!configuration.error || busy()
  const previewUnavailable = () => !!preview && (preview.loading() || !!preview.error() || !preview.preview())
  const updateDraft = (next: Partial<Settings>) => setDraft((previous) => ({ ...previous, ...next }))

  async function persistSettings() {
    const settings = { ...draft() }
    for (const key of keys) {
      const value = settings[key]
      if (value === stored()[key]) continue
      const response = await fetchAPI(SETTINGS_URL + key, 'PUT', { value })
      if (!response.ok) throw new Error('Status settings update failed')
      await response.json()
      setStored((previous) => ({ ...previous, [key]: value }))
    }
  }

  async function saveSettings(closeFormat = false) {
    if (unavailable() || previewUnavailable()) return
    setBusy(true)
    setOperationError('')
    try {
      await persistSettings()
      if (closeFormat) {
        formatCommitted = true
        closeDialog('edit_format')
        setFormatOpen(false)
      }
      preview?.refetch()
    } catch {
      setOperationError(t('dashboard.server.status.preview.save_error', 'Unable to save the status settings.'))
    } finally {
      setBusy(false)
    }
  }

  async function sendStatus() {
    if (unavailable() || previewUnavailable() || !selectedChannel() || selectedChannel() === '0') return
    setBusy(true)
    setOperationError('')
    try {
      await persistSettings()
      const response = await fetchAPI(STATUS_URL, 'POST', { channelID: selectedChannel() })
      if (!response.ok) throw new Error('Status send failed')
      setStatus(await response.json())
      closeDialog('select_channel_modal')
      setSendOpen(false)
      preview?.refetch()
    } catch {
      setOperationError(t('dashboard.server.status.preview.send_error', 'Unable to send the status message.'))
    } finally {
      setBusy(false)
    }
  }

  async function removeStatus() {
    if (unavailable()) return
    setBusy(true)
    setOperationError('')
    try {
      const response = await fetchAPI(STATUS_URL, 'DELETE')
      if (!response.ok) throw new Error('Status removal failed')
      setStatus({})
    } catch {
      setOperationError(t('dashboard.server.status.preview.remove_error', 'Unable to remove the status message.'))
    } finally {
      setBusy(false)
    }
  }

  const beginFormat = () => {
    formatAtOpen = draft().status_player_list_format
    formatCommitted = false
    setFormatOpen(true)
    showDialog('edit_format')
  }
  const closeFormat = () => {
    if (!formatCommitted) updateDraft({ status_player_list_format: formatAtOpen })
    setFormatOpen(false)
    formatCommitted = false
  }
  const cancelFormat = () => {
    updateDraft({ status_player_list_format: formatAtOpen })
    closeDialog('edit_format')
    setFormatOpen(false)
  }
  const Preview: Component = () => (
    <Show when={preview}>
      <DiscordStatusPreview
        data={preview!.preview()}
        loading={preview!.loading()}
        error={preview!.error()}
        onRetry={preview!.refetch}
      />
    </Show>
  )
  const variables = [
    ['name', 'playerName', 'Player Name'],
    ['steamID64', 'playerSteamID64', 'Player SteamID64'],
    ['team', 'team', 'Team'],
    ['userGroup', 'userGroup', 'User Group'],
    ['connectTime', 'connectTime', 'Connect Time'],
    ['kills', 'kills', 'Kills'],
    ['deaths', 'deaths', 'Deaths'],
    ['position', 'position', 'Position'],
    ['angle', 'angle', 'Angle'],
    ['fps', 'fps', 'FPS'],
    ['ping', 'ping', 'Ping'],
    ['adjustedTime', 'adjustedTime', 'Adjusted Time'],
    ['branch', 'branch', 'Branch'],
  ]

  return (
    <>
      <dialog
        class="modal"
        id="select_channel_modal"
        onClose={() => setSendOpen(false)}
        onCancel={(event) => {
          if (busy()) event.preventDefault()
        }}
      >
        <div class="modal-box">
          <div class="flex flex-col gap-4 min-w-0">
            <h2 class="text-2xl font-bold">{t('dashboard.server.status.send_status', 'Send Status')}</h2>
            <p class="text-sm text-base-content/70">
              {t(
                'dashboard.server.status.preview.confirm_send',
                'Choose a channel, review the preview, then send the message.',
              )}
            </p>
            <label class="flex flex-col gap-2">
              <span>{t('tools.select_channel', 'Select a Channel')}</span>
              <ChannelSelector callback={setSelectedChannel} idSelect={selectedChannel()} />
            </label>
            <Show when={sendOpen()}>
              <Preview />
            </Show>
            <Show when={operationError() && sendOpen()}>
              <p role="alert" class="text-error">
                {operationError()}
              </p>
            </Show>
            <div class="flex flex-wrap gap-2">
              <button
                type="button"
                class="btn btn-base-200"
                disabled={busy()}
                onClick={() => {
                  closeDialog('select_channel_modal')
                  setSendOpen(false)
                }}
              >
                {t('dashboard.server.status.preview.cancel', 'Cancel')}
              </button>
              <button
                type="button"
                class="btn btn-primary"
                disabled={unavailable() || !selectedChannel() || selectedChannel() === '0' || previewUnavailable()}
                onClick={sendStatus}
              >
                {t('dashboard.server.status.preview.send', 'Send to Discord')}
              </button>
            </div>
          </div>
        </div>
      </dialog>

      <dialog
        class="modal"
        id="edit_format"
        onClose={closeFormat}
        onCancel={(event) => {
          if (busy()) event.preventDefault()
          else closeFormat()
        }}
      >
        <div class="modal-box">
          <div class="flex flex-col gap-4 min-w-0">
            <h2 class="text-2xl font-bold">{t('dashboard.server.pseudo.editFormat', 'Edit Format')}</h2>
            <details class="rounded-lg border border-base-200 p-3">
              <summary class="cursor-pointer text-base-content/70 font-bold">
                {t('dashboard.server.pseudo.variables', 'Variables')}
              </summary>
              <ul class="mt-3 text-sm text-base-content/60 list-inside">
                <For each={variables}>
                  {([variable, label, fallback]) => (
                    <li>{`{${variable}} - ${t(`dashboard.server.status.${label}`, fallback)}`}</li>
                  )}
                </For>
              </ul>
            </details>
            <label class="flex flex-col gap-2">
              <span>{t('dashboard.server.pseudo.format', 'Format')}</span>
              <input
                type="text"
                class="input w-full"
                maxLength={500}
                value={draft().status_player_list_format}
                disabled={unavailable()}
                onInput={(event) => updateDraft({ status_player_list_format: event.currentTarget.value })}
              />
            </label>
            <Show when={formatOpen()}>
              <Preview />
            </Show>
            <Show when={operationError() && formatOpen()}>
              <p role="alert" class="text-error">
                {operationError()}
              </p>
            </Show>
            <div class="flex flex-wrap gap-2">
              <button type="button" class="btn btn-base-200" disabled={busy()} onClick={cancelFormat}>
                {t('dashboard.server.status.preview.cancel', 'Cancel')}
              </button>
              <button
                type="button"
                class="btn btn-primary"
                disabled={unavailable() || previewUnavailable() || !dirty()}
                onClick={() => saveSettings(true)}
              >
                {t('dashboard.server.pseudo.save', 'Save')}
              </button>
            </div>
          </div>
        </div>
      </dialog>

      <AdminPanel
        title={t('dashboard.server.status.title', 'Server Status')}
        description={t(
          'dashboard.server.status.description',
          'Here you can manage your server status message and buttons.',
        )}
      >
        <Show when={configuration.error}>
          <div role="alert" class="flex flex-wrap items-center gap-3 text-error">
            <p>{t('dashboard.server.status.preview.settings_error', 'Unable to load the status settings.')}</p>
            <button type="button" class="btn btn-sm btn-base-200" onClick={() => refetch()}>
              {t('ui.retry', 'Try again')}
            </button>
          </div>
        </Show>
        <div class="flex flex-wrap items-center gap-2 min-w-0">
          <span>{t('dashboard.server.status.status_message', 'Status Message')}:</span>
          <Show
            when={status().channel}
            fallback={
              <>
                <span>{t('dashboard.server.status.no_status_message', 'No status message')}</span>
                <button
                  type="button"
                  class="btn btn-sm fa-solid fa-plus"
                  aria-label={t('dashboard.server.status.send_status', 'Send Status')}
                  disabled={unavailable()}
                  onClick={() => {
                    setSelectedChannel('')
                    setOperationError('')
                    setSendOpen(true)
                    showDialog('select_channel_modal')
                    void guildChannelsRefetch()
                  }}
                ></button>
              </>
            }
          >
            <DiscordMessage messageID={status().message!} channelID={status().channel} />
            <button
              type="button"
              class="btn btn-sm fa-solid fa-xmark text-error"
              aria-label={t('dashboard.server.status.remove_status', 'Remove Status')}
              disabled={unavailable()}
              onClick={removeStatus}
            ></button>
          </Show>
        </div>
        <label class="flex flex-wrap items-center gap-2">
          <span>{t('dashboard.server.status.show_player_list', 'Show Player List')}:</span>
          <input
            type="checkbox"
            class="toggle toggle-md"
            checked={draft().show_player_list_status}
            disabled={unavailable()}
            onChange={(event) => updateDraft({ show_player_list_status: event.currentTarget.checked })}
          />
        </label>
        <div class="flex flex-wrap items-center gap-2 min-w-0">
          <label for="status-player-format">{t('dashboard.server.status.format', 'Player List Format')}:</label>
          <input
            id="status-player-format"
            type="text"
            class="input min-w-0 max-w-full"
            value={draft().status_player_list_format}
            readOnly
            disabled={unavailable()}
          />
          <button
            type="button"
            class="btn btn-sm fa-solid fa-edit"
            aria-label={t('dashboard.server.status.edit', 'Edit')}
            disabled={unavailable()}
            onClick={beginFormat}
          ></button>
        </div>
        <label class="flex flex-wrap items-center gap-2">
          <PremiumBadge onlyIcon noMargin />
          <span>{t('dashboard.server.status.show_player_chart', 'Show Player Chart')}:</span>
          <input
            type="checkbox"
            class="toggle toggle-md"
            checked={draft().show_status_chart}
            disabled={unavailable() || !premium()}
            onChange={(event) => updateDraft({ show_status_chart: event.currentTarget.checked })}
          />
        </label>
        <div class="flex flex-wrap items-center gap-3">
          <button
            type="button"
            class="btn btn-base-200"
            disabled={unavailable() || previewUnavailable() || !dirty()}
            onClick={() => saveSettings()}
          >
            {t('dashboard.server.pseudo.save', 'Save')}
          </button>
          <Show when={dirty()}>
            <p class="text-sm text-base-content/70">
              {t('dashboard.server.status.preview.unsaved', 'Preview only — save to apply these changes to Discord.')}
            </p>
          </Show>
        </div>
        <Show when={operationError() && !sendOpen() && !formatOpen()}>
          <p role="alert" class="text-error">
            {operationError()}
          </p>
        </Show>
      </AdminPanel>
    </>
  )
}

export default ServerStatusMessage
