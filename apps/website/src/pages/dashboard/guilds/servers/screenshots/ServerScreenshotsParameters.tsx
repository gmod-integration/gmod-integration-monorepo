import { DashboardChannelConfigurationSchema } from '@gmod/schema/server/DashboardChannelSchema.js'
import { showDialog } from '../../../../../utils/dialog.js'
import { type Component, createResource, Show } from 'solid-js'
import AdminPanel from '../../../../../components/AdminPanel'
import { guildChannelsRefetch } from '../../GuildInformations'
import AdminChannelSelector from '../../../../../components/AdminChannelSelector'
import { useI18n } from '../../../../../i18n'
import DiscordChannel from '../../../../../components/discord/DiscordChannel'
import { fetchAPI } from '../../../../../utils/api'
import { AsyncState, Button, SettingRow } from '../../../../../components/ui/index.js'

import ConfirmActionDialog from '../../../../../components/ConfirmActionDialog.js'

const fetchScreenshot = async () => {
  const res = await fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/screenshots/channel', 'GET')
  if (!res.ok) {
    throw new Error('Channel configuration unavailable')
  }
  return DashboardChannelConfigurationSchema.parse(await res.json())
}

export const ServerScreenshotsParameters: Component = () => {
  const [screenshots, { mutate: screenshotsMutate, refetch }] = createResource('screenshot', fetchScreenshot)
  const { t } = useI18n()

  const sendScreenshots = async (channelID: string) => {
    const res = await fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/screenshots/channel', 'POST', {
      channelID,
    })
    if (!res.ok) {
      throw new Error('Screenshot channel update failed')
    }
    const screenshot = DashboardChannelConfigurationSchema.parse(await res.json())
    screenshotsMutate(screenshot)
    return screenshot
  }

  const removeScreenshots = async () => {
    const res = await fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/screenshots/channel', 'DELETE')
    if (!res.ok) {
      throw new Error('Channel removal failed')
    }
    screenshotsMutate({})
    return {}
  }

  return (
    <>
      <AdminChannelSelector
        id="select_channel_modal"
        callback={sendScreenshots}
        idSelect={!screenshots.loading && !screenshots.error ? screenshots()?.channelID : undefined}
      />

      <ConfirmActionDialog
        id="remove-channel"
        title={t('dashboard.server.screenshots.delete_channel', 'Remove destination')}
        description={t(
          'dashboard.server.screenshots.remove_destination_help',
          'Stop sending screenshots to this destination? The Discord channel itself will not be deleted.',
        )}
        confirmLabel={t('dashboard.server.screenshots.delete_channel', 'Remove destination')}
        onConfirm={removeScreenshots}
      />
      <AdminPanel
        title={t('dashboard.server.screenshots.title', 'Server Screenshots')}
        description={t(
          'dashboard.server.screenshots.description',
          'Choose the Discord text channel that receives screenshots sent by your game server. This setting does not take a screenshot.',
        )}
      >
        <AsyncState loading={screenshots.loading} error={screenshots.error} onRetry={() => void refetch()}>
          <SettingRow
            title={t('dashboard.server.screenshots.current_channel', 'Discord destination')}
            description={t(
              'dashboard.server.screenshots.destination_help',
              'Choose a channel and save the selection to receive future screenshots there.',
            )}
          >
            <div class="flex w-full min-w-0 items-center gap-2">
              <Show
                when={!screenshots.loading && !screenshots.error && screenshots()?.channelID}
                fallback={
                  <span class="text-base-content/60">
                    {t('dashboard.server.screenshots.no_channel', 'No channel selected')}
                  </span>
                }
              >
                <DiscordChannel channelID={screenshots()?.channelID} />
              </Show>
            </div>
            <Button
              variant="primary"
              size="sm"
              disabled={screenshots.loading || !!screenshots.error}
              onClick={() => {
                showDialog('select_channel_modal')
                guildChannelsRefetch()
              }}
            >
              {t('dashboard.server.screenshots.select_channel', 'Select Channel')}
            </Button>
            <Show when={!screenshots.loading && !screenshots.error && screenshots()?.channelID}>
              <Button variant="ghost" size="sm" onClick={() => showDialog('remove-channel')}>
                {t('dashboard.server.screenshots.delete_channel', 'Remove destination')}
              </Button>
            </Show>
          </SettingRow>
        </AsyncState>
      </AdminPanel>
    </>
  )
}
