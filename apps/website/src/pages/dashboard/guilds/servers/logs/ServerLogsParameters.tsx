import { type Component, createEffect, createResource, createSignal, Show } from 'solid-js'
import { showDialog } from '../../../../../utils/dialog.js'
import { AsyncState, Button, FormActions, SettingRow, SettingGroup } from '../../../../../components/ui/index.js'
import AdminPanel from '../../../../../components/AdminPanel'
import DiscordChannel from '../../../../../components/discord/DiscordChannel'
import { guildChannelsRefetch } from '../../GuildInformations'
import { useI18n } from '../../../../../i18n'
import { fetchAPI } from '../../../../../utils/api'
import AdminChannelSelector from '../../../../../components/AdminChannelSelector'
import { createDraftForm } from '../../../../../hooks/createDraftForm.js'
import { saveDashboardSettings } from '../../../../../utils/dashboardSettings.js'
import ConfirmActionDialog from '../../../../../components/ConfirmActionDialog.js'

const fetchLogHideIP = async () => {
  const res = await fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/settings/log_hide_ip', 'GET')
  if (!res.ok) {
    throw new Error('Log configuration unavailable')
  }
  return await res.json()
}

const fetchLogFile = async () => {
  const res = await fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/settings/log_include_file', 'GET')
  if (!res.ok) {
    throw new Error('Log configuration unavailable')
  }
  return await res.json()
}

const fetchLogsChannel = async () => {
  const res = await fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/logs/channels', 'GET')
  if (!res.ok) {
    throw new Error('Log configuration unavailable')
  }
  return await res.json()
}

export const ServerLogsParameters: Component = () => {
  const { t } = useI18n()
  const [syncPending, setSyncPending] = createSignal(false)
  const [logsChannel, { mutate: logsChannelMutate, refetch: refetchChannel }] = createResource(
    'logsChannel',
    fetchLogsChannel,
  )
  const [content, { refetch: refetchContent }] = createResource(async () => {
    const [hideIP, file] = await Promise.all([fetchLogHideIP(), fetchLogFile()])
    return {
      log_hide_ip: hideIP.value === true || hideIP.value === 'true',
      log_include_file: file.value === true || file.value === 'true',
    }
  })
  const form = createDraftForm({
    initial: { log_hide_ip: false, log_include_file: false },
    errorMessage: () => t('ui.save_error', 'Unable to save. Please try again.'),
  })
  createEffect(() => {
    if (!content.loading && !content.error && content()) form.reset(content()!)
  })
  const saveContent = () =>
    form.save(async (snapshot) => {
      const result = await saveDashboardSettings('server', snapshot)
      setSyncPending(result.sync === 'pending')
    })

  const sendLogChannel = async (channelID: string) => {
    const res = await fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/logs/channels', 'POST', {
      channelID,
    })
    if (!res.ok) {
      throw new Error('Logs channel update failed')
    }
    const screenshot = await res.json()
    logsChannelMutate(screenshot)
  }

  const removeLogChannel = async () => {
    const res = await fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/logs/channels', 'DELETE')
    if (!res.ok) {
      throw new Error('Logs channel removal failed')
    }
    logsChannelMutate({})
    return {}
  }

  return (
    <>
      <AdminChannelSelector
        id="select_channel_modal"
        callback={sendLogChannel}
        idSelect={!logsChannel.loading && !logsChannel.error ? logsChannel()?.channelID : undefined}
      />

      <ConfirmActionDialog
        id="remove-logs-channel"
        title={t('dashboard.server.logs.button.remove_channel', 'Remove destination')}
        description={t(
          'dashboard.server.logs.remove_destination_help',
          'Stop sending server logs to this destination? The Discord channel itself will not be deleted.',
        )}
        confirmLabel={t('dashboard.server.logs.button.remove_channel', 'Remove destination')}
        onConfirm={removeLogChannel}
      />
      <AdminPanel
        title={t('dashboard.server.logs.title.logs_channel', 'Logs Channel')}
        description={t(
          'dashboard.server.logs.description.logs_channel',
          'Send server event logs to a Discord text channel. This destination is separate from the event history below.',
        )}
      >
        <AsyncState loading={logsChannel.loading} error={logsChannel.error} onRetry={() => void refetchChannel()}>
          <SettingRow
            title={t('dashboard.server.logs.label.chats_channels', 'Discord destination')}
            description={t(
              'dashboard.server.logs.destination_help',
              'Choose a channel and save the selection to receive future logs there.',
            )}
          >
            <div class="flex w-full min-w-0 items-center gap-2">
              <Show
                when={!logsChannel.loading && logsChannel().channelID}
                fallback={
                  <span class="text-base-content/60">
                    {t('dashboard.server.logs.no_logs_channel', 'No Logs Channel')}
                  </span>
                }
              >
                <DiscordChannel channelID={logsChannel().channelID} />
              </Show>
            </div>
            <Button
              variant="primary"
              size="sm"
              disabled={logsChannel.loading || !!logsChannel.error}
              onClick={() => {
                showDialog('select_channel_modal')
                guildChannelsRefetch()
              }}
            >
              {t('dashboard.server.logs.button.select_channel', 'Select Channel')}
            </Button>
            <Show when={!logsChannel.loading && logsChannel().channelID}>
              <Button variant="ghost" size="sm" onClick={() => showDialog('remove-logs-channel')}>
                {t('dashboard.server.logs.button.remove_channel', 'Remove destination')}
              </Button>
            </Show>
          </SettingRow>
        </AsyncState>
        <SettingGroup
          title={t('settings.log_content', 'Log content')}
          description={t('editing.section_help', 'Edit these settings, then save this section to apply them.')}
          icon="scroll-text"
        >
          <AsyncState loading={content.loading} error={content.error} onRetry={() => void refetchContent()}>
            <SettingRow
              controlId="logs-hide-ip"
              title={t('dashboard.server.logs.label.hide_ip', 'Hide IP addresses in Discord logs')}
              description={t('settings.log_ip_help', 'Keep player IP addresses out of the logs published to Discord.')}
            >
              <input
                id="logs-hide-ip"
                aria-describedby="logs-hide-ip-description"
                type="checkbox"
                class="toggle toggle-md"
                disabled={form.pending()}
                checked={form.draft().log_hide_ip}
                onChange={(event) => form.patch({ log_hide_ip: event.currentTarget.checked })}
              />
            </SettingRow>
            <SettingRow
              controlId="logs-attach-file"
              title={t('dashboard.server.logs.label.attach_log_file', 'Attach event data as a file')}
              description={t('settings.log_file_help', 'Include the log information as a file attachment in Discord.')}
            >
              <input
                id="logs-attach-file"
                aria-describedby="logs-attach-file-description"
                type="checkbox"
                class="toggle toggle-md"
                disabled={form.pending()}
                checked={form.draft().log_include_file}
                onChange={(event) => form.patch({ log_include_file: event.currentTarget.checked })}
              />
            </SettingRow>
            <FormActions
              dirty={form.dirty()}
              pending={form.pending()}
              error={form.error()}
              success={form.success()}
              message={
                syncPending() && !form.dirty() ? t('ui.sync_pending', 'Saved. Synchronization is pending.') : undefined
              }
              onSave={() => void saveContent()}
              onCancel={form.discard}
            />
          </AsyncState>
        </SettingGroup>
      </AdminPanel>
    </>
  )
}
