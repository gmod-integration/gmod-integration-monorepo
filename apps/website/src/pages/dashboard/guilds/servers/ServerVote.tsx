import { DashboardChannelConfigurationSchema } from '@gmod/schema/server/DashboardChannelSchema.js'
import { showDialog } from '../../../../utils/dialog.js'
import { type Component, createResource, Show } from 'solid-js'
import AdminPanel from '../../../../components/AdminPanel'
import { guildChannelsRefetch } from '../GuildInformations'
import AdminChannelSelector from '../../../../components/AdminChannelSelector'
import { useI18n } from '../../../../i18n'
import DiscordChannel from '../../../../components/discord/DiscordChannel'
import { fetchAPI } from '../../../../utils/api'
import { AsyncState, Button, SettingRow } from '../../../../components/ui/index.js'

import ConfirmActionDialog from '../../../../components/ConfirmActionDialog.js'

const fetchVote = async () => {
  const res = await fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/votes', 'GET')
  if (!res.ok) {
    throw new Error('Channel configuration unavailable')
  }
  return DashboardChannelConfigurationSchema.parse(await res.json())
}

const ServerVote: Component = () => {
  const { t } = useI18n()
  const [votes, { mutate: votesMutate, refetch }] = createResource('vote', fetchVote)

  const sendScreenshots = async (channelID: string) => {
    const res = await fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/votes', 'POST', {
      channelID,
    })
    if (!res.ok) {
      throw new Error('Vote channel update failed')
    }
    const screenshot = DashboardChannelConfigurationSchema.parse(await res.json())
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

      <ConfirmActionDialog
        id="remove-channel"
        title={t('dashboard.server.vote.delete_channel', 'Remove destination')}
        description={t(
          'dashboard.server.vote.remove_channel_help',
          'Stop sending vote notifications to this destination. The Discord channel is kept.',
        )}
        confirmLabel={t('ui.delete', 'Delete')}
        onConfirm={removeScreenshots}
      />
      <AdminPanel
        title={t('dashboard.server.vote.title', 'Vote notifications')}
        description={t(
          'dashboard.server.vote.description',
          'Choose the Discord channel that receives notifications when players vote for this server.',
        )}
      >
        <AsyncState loading={votes.loading} error={votes.error} onRetry={() => void refetch()}>
          <SettingRow
            title={t('dashboard.server.vote.vote_channel', 'Notification channel')}
            description={t(
              'settings.channel_confirmation',
              'Choose a channel, then confirm your selection. Removing it stops future messages in that channel.',
            )}
          >
            <div class="flex w-full min-w-0 items-center gap-2">
              <Show
                when={!votes.loading && !votes.error && votes()?.channelID}
                fallback={
                  <span class="text-base-content/60">
                    {t('dashboard.server.vote.no_channel_selected', 'No channel selected')}
                  </span>
                }
              >
                <DiscordChannel channelID={votes()?.channelID} />
              </Show>
            </div>
            <Button
              variant="primary"
              size="sm"
              disabled={votes.loading || !!votes.error}
              onClick={() => {
                showDialog('select_channel_modal')
                guildChannelsRefetch()
              }}
            >
              {t('dashboard.server.vote.select_channel', 'Choose channel')}
            </Button>
            <Show when={!votes.loading && !votes.error && votes()?.channelID}>
              <Button variant="ghost" size="sm" onClick={() => showDialog('remove-channel')}>
                {t('dashboard.server.vote.delete_channel', 'Remove destination')}
              </Button>
            </Show>
          </SettingRow>
        </AsyncState>
      </AdminPanel>
    </>
  )
}

export default ServerVote
