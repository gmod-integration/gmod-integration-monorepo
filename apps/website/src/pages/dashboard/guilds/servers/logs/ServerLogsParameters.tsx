import { type Component, createResource, Show } from 'solid-js'
import { showDialog } from '../../../../../utils/dialog.js'
import { Button, SettingRow, SettingGroup, SettingFeedback } from '../../../../../components/ui/index.js'
import AdminPanel from '../../../../../components/AdminPanel'
import DiscordChannel from '../../../../../components/discord/DiscordChannel'
import { guildChannelsRefetch } from '../../GuildInformations'
import { useI18n } from '../../../../../i18n'
import { fetchAPI } from '../../../../../utils/api'
import AdminChannelSelector from '../../../../../components/AdminChannelSelector'
import { createAsyncAction } from '../../../../../hooks/createAsyncAction.js'

const fetchLogHideIP = async () => {
  const res = await fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/settings/log_hide_ip', 'GET')
  if (!res.ok) {
    return {}
  }
  return await res.json()
}

const fetchLogFile = async () => {
  const res = await fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/settings/log_include_file', 'GET')
  if (!res.ok) {
    return {}
  }
  return await res.json()
}

const fetchLogsChannel = async () => {
  const res = await fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/logs/channels', 'GET')
  if (!res.ok) {
    return {}
  }
  return await res.json()
}

export const ServerLogsParameters: Component = () => {
  const { t } = useI18n()
  const hideIPSave = createAsyncAction({ errorMessage: () => t('ui.save_error', 'Unable to save. Please try again.') })
  const fileSave = createAsyncAction({ errorMessage: () => t('ui.save_error', 'Unable to save. Please try again.') })
  const channelRemoval = createAsyncAction({
    errorMessage: () => t('ui.save_error', 'Unable to save. Please try again.'),
  })
  const [logsChannel, { mutate: logsChannelMutate }] = createResource('logsChannel', fetchLogsChannel)
  const [logHideIP, { mutate: logHideIPMutate }] = createResource('logHideIP', fetchLogHideIP)
  const [logFile, { mutate: logFileMutate }] = createResource('logFile', fetchLogFile)

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

  async function editLogHideIP(value: boolean) {
    if (hideIPSave.pending()) return
    const previous = logHideIP()
    logHideIPMutate({ ...previous, value })
    if (
      !(await hideIPSave.run(async () => {
        const res = await fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/settings/log_hide_ip', 'PUT', {
          value,
        })
        if (!res.ok) throw new Error('Hide IP update failed')
        logHideIPMutate(await res.json())
      }))
    )
      logHideIPMutate(previous)
  }

  async function editLogFile(value: boolean) {
    if (fileSave.pending()) return
    const previous = logFile()
    logFileMutate({ ...previous, value })
    if (
      !(await fileSave.run(async () => {
        const res = await fetchAPI(
          '/users/:discordID/guilds/:guildID/servers/:serverID/settings/log_include_file',
          'PUT',
          { value },
        )
        if (!res.ok) throw new Error('Log attachment update failed')
        logFileMutate(await res.json())
      }))
    )
      logFileMutate(previous)
  }

  return (
    <>
      <AdminChannelSelector
        id="select_channel_modal"
        callback={sendLogChannel}
        idSelect={!logsChannel.loading && !logsChannel.error ? logsChannel()?.channelID : undefined}
      />

      <AdminPanel
        title={t('dashboard.server.logs.title.logs_channel', 'Logs Channel')}
        description={t(
          'dashboard.server.logs.description.logs_channel',
          'Set a channel to sync the logs between your server and Discord.',
        )}
      >
        <SettingRow
          title={t('dashboard.server.logs.label.chats_channels', 'Chats Channels:')}
          description={t(
            'settings.channel_confirmation',
            'Choose a channel, then confirm your selection. Removing it stops future messages in that channel.',
          )}
          feedback={<SettingFeedback pending={channelRemoval.pending()} error={channelRemoval.error()} />}
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
            disabled={logsChannel.loading || channelRemoval.pending()}
            onClick={() => {
              showDialog('select_channel_modal')
              guildChannelsRefetch()
            }}
          >
            {t('dashboard.server.logs.button.select_channel', 'Select Channel')}
          </Button>
          <Show when={!logsChannel.loading && logsChannel().channelID}>
            <Button
              variant="ghost"
              size="sm"
              loading={channelRemoval.pending()}
              onClick={() => void channelRemoval.run(removeLogChannel)}
            >
              {t('dashboard.server.logs.button.remove_channel', 'Remove Channel')}
            </Button>
          </Show>
        </SettingRow>
        <SettingGroup
          title={t('settings.log_content', 'Log content')}
          description={t('ui.autosave', 'Changes are saved automatically.')}
          icon="scroll-text"
        >
          <Show when={!logHideIP.loading}>
            <SettingRow
              controlId="logs-hide-ip"
              title={t('dashboard.server.logs.label.hide_ip', 'Hide IP in discord logs:')}
              description={t('settings.log_ip_help', 'Keep player IP addresses out of the logs published to Discord.')}
              feedback={
                <SettingFeedback
                  pending={hideIPSave.pending()}
                  error={hideIPSave.error()}
                  success={hideIPSave.success()}
                />
              }
            >
              <input
                id="logs-hide-ip"
                aria-describedby="logs-hide-ip-description"
                type="checkbox"
                class="toggle toggle-md"
                disabled={logHideIP.loading || hideIPSave.pending()}
                aria-busy={hideIPSave.pending() || undefined}
                checked={logHideIP() ? logHideIP().value : false}
                onChange={(e) => void editLogHideIP(e.currentTarget.checked)}
              />
            </SettingRow>
          </Show>
          <Show when={!logFile.loading}>
            <SettingRow
              controlId="logs-attach-file"
              title={t('dashboard.server.logs.label.attach_log_file', 'Attach log information file:')}
              description={t('settings.log_file_help', 'Include the log information as a file attachment in Discord.')}
              feedback={
                <SettingFeedback pending={fileSave.pending()} error={fileSave.error()} success={fileSave.success()} />
              }
            >
              <input
                id="logs-attach-file"
                aria-describedby="logs-attach-file-description"
                type="checkbox"
                class="toggle toggle-md"
                disabled={logFile.loading || fileSave.pending()}
                aria-busy={fileSave.pending() || undefined}
                checked={logFile() ? logFile().value : false}
                onChange={(e) => void editLogFile(e.currentTarget.checked)}
              />
            </SettingRow>
          </Show>
        </SettingGroup>
      </AdminPanel>
    </>
  )
}
