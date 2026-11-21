import { showDialog } from '../../../../utils/dialog.js'
import { type Component, createResource, Show } from 'solid-js'
import AdminPanel from '../../../../components/AdminPanel'
import { guildChannelsRefetch } from '../GuildInformations'
import AdminChannelSelector from '../../../../components/AdminChannelSelector'
import { useI18n } from '../../../../i18n'
import DiscordChannel from '../../../../components/discord/DiscordChannel'
import { fetchAPI } from '../../../../utils/api'
import { Button, SettingRow, SettingFeedback } from '../../../../components/ui/index.js'

import { createAsyncAction } from '../../../../hooks/createAsyncAction.js'

const fetchVote = async () => {
  const res = await fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/votes', 'GET')
  if (!res.ok) {
    return {}
  }
  return await res.json()
}

const ServerVote: Component = () => {
  const { t } = useI18n()
  const removal = createAsyncAction({ errorMessage: () => t('ui.save_error', 'Unable to save. Please try again.') })
  const [votes, { mutate: votesMutate }] = createResource('vote', fetchVote)

  const sendScreenshots = async (channelID: string) => {
    const res = await fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/votes', 'POST', {
      channelID,
    })
    if (!res.ok) {
      throw new Error('Vote channel update failed')
    }
    const screenshot = await res.json()
    votesMutate(screenshot)
    return screenshot
  }

  const removeScreenshots = async () => {
    const res = await fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/votes', 'DELETE')
    if (!res.ok) {
      throw new Error('Channel removal failed')
    }
    votesMutate({})
    return {}
  }

  return (
    <>
      <AdminChannelSelector
        id="select_channel_modal"
        callback={sendScreenshots}
        idSelect={!votes.loading && !votes.error ? votes()?.channelID : undefined}
      />

      <AdminPanel
        title={t('dashboard.server.vote.title', 'Server Vote')}
        description={t('dashboard.server.vote.description', 'Configure voting notifications for your server')}
      >
        <SettingRow
          title={t('dashboard.server.vote.vote_channel', 'Vote Channel')}
          description={t(
            'settings.channel_confirmation',
            'Choose a channel, then confirm your selection. Removing it stops future messages in that channel.',
          )}
          feedback={<SettingFeedback error={removal.error()} pending={removal.pending()} />}
        >
          <div class="flex w-full min-w-0 items-center gap-2">
            <Show
              when={!votes.loading && votes().channelID}
              fallback={
                <span class="text-base-content/60">
                  {t('dashboard.server.vote.no_channel_selected', 'No channel selected')}
                </span>
              }
            >
              <DiscordChannel channelID={votes().channelID} />
            </Show>
          </div>
          <Button
            variant="primary"
            size="sm"
            disabled={votes.loading || removal.pending()}
            onClick={() => {
              showDialog('select_channel_modal')
              guildChannelsRefetch()
            }}
          >
            {t('dashboard.server.vote.select_channel', 'Select Channel')}
          </Button>
          <Show when={!votes.loading && votes().channelID}>
            <Button
              variant="ghost"
              size="sm"
              loading={removal.pending()}
              onClick={() => void removal.run(removeScreenshots)}
            >
              {t('dashboard.server.vote.delete_channel', 'Delete Channel')}
            </Button>
          </Show>
        </SettingRow>
      </AdminPanel>
    </>
  )
}

export default ServerVote
