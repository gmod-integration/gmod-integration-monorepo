import { showDialog } from '../../../../../utils/dialog.js'
import { type Component, createResource, Show } from 'solid-js'
import AdminPanel from '../../../../../components/AdminPanel'
import { guildChannelsRefetch } from '../../GuildInformations'
import AdminChannelSelector from '../../../../../components/AdminChannelSelector'
import { useI18n } from '../../../../../i18n'
import DiscordChannel from '../../../../../components/discord/DiscordChannel'
import { fetchAPI } from '../../../../../utils/api'
import { Button, SettingRow, SettingFeedback } from '../../../../../components/ui/index.js'

import { createAsyncAction } from '../../../../../hooks/createAsyncAction.js'

const fetchScreenshot = async () => {
  const res = await fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/screenshots/channel', 'GET')
  if (!res.ok) {
    return {}
  }
  return await res.json()
}

export const ServerScreenshotsParameters: Component = () => {
  const [screenshots, { mutate: screenshotsMutate }] = createResource('screenshot', fetchScreenshot)
  const { t } = useI18n()
  const removal = createAsyncAction({ errorMessage: () => t('ui.save_error', 'Unable to save. Please try again.') })

  const sendScreenshots = async (channelID: string) => {
    const res = await fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/screenshots/channel', 'POST', {
      channelID,
    })
    if (!res.ok) {
      throw new Error('Screenshot channel update failed')
    }
    const screenshot = await res.json()
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

      <AdminPanel
        title={t('dashboard.server.screenshots.title', 'Server Screenshots')}
        description={t(
          'dashboard.server.screenshots.description',
          'Configure where screenshots from your server will be sent',
        )}
      >
        <SettingRow
          title={t('dashboard.server.screenshots.current_channel', 'Current Channel')}
          description={t(
            'settings.channel_confirmation',
            'Choose a channel, then confirm your selection. Removing it stops future messages in that channel.',
          )}
          feedback={<SettingFeedback error={removal.error()} pending={removal.pending()} />}
        >
          <div class="flex w-full min-w-0 items-center gap-2">
            <Show
              when={!screenshots.loading && screenshots().channelID}
              fallback={
                <span class="text-base-content/60">
                  {t('dashboard.server.screenshots.no_channel', 'No channel selected')}
                </span>
              }
            >
              <DiscordChannel channelID={screenshots().channelID} />
            </Show>
          </div>
          <Button
            variant="primary"
            size="sm"
            disabled={screenshots.loading || removal.pending()}
            onClick={() => {
              showDialog('select_channel_modal')
              guildChannelsRefetch()
            }}
          >
            {t('dashboard.server.screenshots.select_channel', 'Select Channel')}
          </Button>
          <Show when={!screenshots.loading && screenshots().channelID}>
            <Button
              variant="ghost"
              size="sm"
              loading={removal.pending()}
              onClick={() => void removal.run(removeScreenshots)}
            >
              {t('dashboard.server.screenshots.delete_channel', 'Delete Channel')}
            </Button>
          </Show>
        </SettingRow>
      </AdminPanel>
    </>
  )
}
