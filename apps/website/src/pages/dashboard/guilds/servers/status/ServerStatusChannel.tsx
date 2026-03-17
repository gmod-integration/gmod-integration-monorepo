import { Component, createEffect, createResource, createSignal, Show } from 'solid-js'
import { preview } from 'vite'
import z from 'zod'
import AdminPanel from '../../../../../components/AdminPanel'
import DiscordChannel from '../../../../../components/discord/DiscordChannel'
import { linkBadge } from '../../../../../components/layout/menu/DashboardMenu'
import { fetchAPI } from '../../../../../utils/api'
import { guildChannelsRefetch } from '../../GuildInformations'
import { useI18n } from '../../../../../i18n'
import AdminChannelSelector from '../../../../../components/AdminChannelSelector'

export const ServerStatusChannelSchema = z.object({
  id: z.string(),
  serverID: z.string(),
  channelID: z.string(),
  format: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type ServerStatusChannelInput = z.infer<typeof ServerStatusChannelSchema>

const fetchStatusChannel = async (): Promise<ServerStatusChannelInput> => {
  const res = await fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/status/channel', 'GET')
  if (!res.ok)
    return {
      id: '',
      serverID: '',
      channelID: '',
      format: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as ServerStatusChannelInput
  return (await res.json()) as ServerStatusChannelInput
}

const ServerStatusChannel: Component = () => {
  const { t } = useI18n()

  const [statusChannel, { mutate: statusChannelIDMutate }] = createResource('statusChannel', fetchStatusChannel, {
    initialValue: {
      id: '',
      serverID: '',
      channelID: '',
      format: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as ServerStatusChannelInput,
  })

  async function sendStatusChannel(channelID: string, format: string) {
    const res = await fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/status/channel', 'POST', {
      channelID,
      format,
    })
    if (!res.ok) {
      return
    }
    const statusChannel = await res.json()
    statusChannelIDMutate(statusChannel)
    return statusChannel
  }

  const [format, setFormat] = createSignal('')
  const [preview, setPreview] = createSignal('')

  createEffect(() => {
    const previewValue = format().replace('{nbPlayers}', '5')
    setPreview(previewValue)
  })

  return (
    <>
      <AdminChannelSelector
        id="select_channel_modal_channel"
        callback={(channelID: string) => console.log(channelID)}
      />
      <AdminPanel
        title={t('dashboard.server.status_channel.title', 'Server Status Channel')}
        description={t(
          'dashboard.server.status_channel.description',
          'A auto rename channel to show the current player count of your server.',
        )}
        premium={true}
        badge={linkBadge.NEW}
      >
        <div class="flex w-fit items-center gap-2">
          <span>{t('dashboard.server.status_channel.status_channel', 'Status Channel')}:</span>
          <Show
            when={!statusChannel.loading && statusChannel() && statusChannel().channelID != ''}
            fallback={
              <>
                <span>{t('dashboard.server.status_channel.no_status_channel', 'No status Channel')}</span>
                <div
                  class="tooltip tooltip-info"
                  data-tip={t('dashboard.server.status_channel.send_status', 'Send Status')}
                >
                  <button
                    class="btn btn-sm hover:cursor-pointer fa-solid fa-plus"
                    disabled={statusChannel.loading}
                    onClick={() => {
                      // @ts-ignore
                      select_channel_modal_channel.showModal()
                      guildChannelsRefetch()
                    }}
                  ></button>
                </div>
              </>
            }
          >
            <DiscordChannel channelID={statusChannel().channelID} />
            <div
              class="tooltip tooltip-danger"
              data-tip={t('dashboard.server.status_channel.remove_status', 'Remove Status')}
            >
              <button
                class="btn btn-sm hover:cursor-pointer fa-solid fa-xmark text-error"
                disabled={statusChannel.loading}
                onClick={async () => {
                  // @ts-ignore
                  await removeStatus()
                }}
              ></button>
            </div>
          </Show>
        </div>

        <div class="flex w-fit items-center">
          <span class="mr-2 text-nowrap">{t('dashboard.server.status_channel.format', 'Player List Format')}:</span>
          <input type="text" class="mr-2 input" value={preview()} readOnly disabled={statusChannel.loading} />
          <div class="tooltip tooltip-info" data-tip={t('dashboard.server.status.edit', 'Edit')}>
            <button
              class="btn btn-sm hover:cursor-pointer fa-solid fa-edit"
              disabled={statusChannel.loading}
              onClick={() => {
                // @ts-ignore
                edit_status_button.showModal()
              }}
            ></button>
          </div>
        </div>
      </AdminPanel>
    </>
  )
}

export default ServerStatusChannel
