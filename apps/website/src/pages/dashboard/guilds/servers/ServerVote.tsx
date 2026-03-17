import { Component, createResource, Show } from 'solid-js'
import AdminPanel from '../../../../components/AdminPanel'
import { guildChannelsRefetch } from '../GuildInformations'
import AdminChannelSelector from '../../../../components/AdminChannelSelector'
import { useI18n } from '../../../../i18n'
import DiscordChannel from '../../../../components/discord/DiscordChannel'
import { fetchAPI } from '../../../../utils/api'

const fetchVote = async () => {
  const res = await fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/votes', 'GET')
  if (!res.ok) {
    return {}
  }
  return await res.json()
}

const ServerVote: Component = () => {
  const { t } = useI18n()
  const [votes, { mutate: votesMutate }] = createResource('vote', fetchVote)

  const sendScreenshots = async (channelID: string) => {
    const res = await fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/votes', 'POST', {
      channelID,
    })
    if (!res.ok) {
      return
    }
    const screenshot = await res.json()
    votesMutate(screenshot)
    return screenshot
  }

  const removeScreenshots = async () => {
    const res = await fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/votes', 'DELETE')
    if (!res.ok) {
      return
    }
    votesMutate({})
    return {}
  }

  return (
    <>
      <AdminChannelSelector id="select_channel_modal" callback={sendScreenshots} />

      <AdminPanel
        title={t('dashboard.server.vote.title', 'Server Vote')}
        description={t('dashboard.server.vote.description', 'Configure voting notifications for your server')}
      >
        <div class="flex w-fit items-center">
          <span class="mr-2">{t('dashboard.server.vote.vote_channel', 'Vote Channel')}:</span>
          <Show
            when={!votes.loading && votes().channelID}
            fallback={<span>{t('dashboard.server.vote.no_channel_selected', 'No channel selected')}</span>}
          >
            <DiscordChannel channelID={votes().channelID} />
          </Show>
        </div>
        <div class="flex gap-4">
          <Show when={!votes.loading && votes().channelID}>
            <button
              class="btn btn-warning"
              disabled={votes.loading}
              onClick={async () => {
                await removeScreenshots()
              }}
            >
              {t('dashboard.server.vote.delete_channel', 'Delete Channel')}
            </button>
          </Show>
          <button
            class="btn btn-base-200"
            disabled={votes.loading}
            onClick={() => {
              // @ts-ignore
              select_channel_modal.showModal()
              guildChannelsRefetch()
            }}
          >
            {t('dashboard.server.vote.select_channel', 'Select Channel')}
          </button>
        </div>
      </AdminPanel>
    </>
  )
}

export default ServerVote
