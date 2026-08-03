import { Component, createEffect, createResource, createSignal, Show } from 'solid-js'
import {
  type ServerStatusChannelInput,
  ServerStatusChannelSchema,
} from '@gmod/schema/server/ServerStatusChannelSchema.js'
import AdminPanel from '../../../../../components/AdminPanel'
import DiscordChannel from '../../../../../components/discord/DiscordChannel'
import { linkBadge } from '../../../../../components/layout/menu/DashboardMenu'
import { fetchAPI } from '../../../../../utils/api'
import { guildChannelsRefetch } from '../../GuildInformations'
import { useI18n } from '../../../../../i18n'
import AdminChannelSelector from '../../../../../components/AdminChannelSelector'

const EMPTY_STATUS_CHANNEL: ServerStatusChannelInput = {
  id: '',
  serverID: '',
  channelID: '',
  format: '',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

const fetchStatusChannel = async (): Promise<ServerStatusChannelInput> => {
  const res = await fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/status/channel', 'GET')
  if (!res.ok) return EMPTY_STATUS_CHANNEL

  const parsed = ServerStatusChannelSchema.safeParse(await res.json())
  return parsed.success ? parsed.data : EMPTY_STATUS_CHANNEL
}

const ServerStatusChannel: Component = () => {
  const { t } = useI18n()

  const [statusChannel, { mutate: statusChannelIDMutate }] = createResource('statusChannel', fetchStatusChannel, {
    initialValue: EMPTY_STATUS_CHANNEL,
  })

  async function sendStatusChannel(channelID: string, format: string) {
    const res = await fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/status/channel', 'POST', {
      channelID,
      format,
    })
    if (!res.ok) {
      return
    }
    const parsed = ServerStatusChannelSchema.safeParse(await res.json())
    const statusChannel = parsed.success ? parsed.data : EMPTY_STATUS_CHANNEL
    statusChannelIDMutate(statusChannel)
    return statusChannel
  }

  // Bug fix: this was referenced (as a bare, undefined global) by the remove button below without
  // ever being defined, so clicking it threw a ReferenceError. Added mirroring the established
  // GET/POST `/status/channel` endpoint and ServerStatusMessage.tsx's analogous `removeStatus`.
  async function removeStatus() {
    const res = await fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/status/channel', 'DELETE')
    if (!res.ok) {
      return
    }
    statusChannelIDMutate(EMPTY_STATUS_CHANNEL)
  }

  const [format, setFormat] = createSignal('')
  const [preview, setPreview] = createSignal('')

  createEffect(() => {
    const previewValue = format().replace('{nbPlayers}', '5')
    setPreview(previewValue)
  })

  return (
    <>
      {/* Bug fix: this callback only logged the picked channel id and never actually called
          `sendStatusChannel`, so picking a channel from the selector never persisted anything -
          the "Send Status" flow was entirely non-functional. */}
      <AdminChannelSelector
        id="select_channel_modal_channel"
        callback={(channelID: string) => sendStatusChannel(channelID, format())}
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
                      // @ts-expect-error -- intentional: legacy typing gap
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
                // @ts-expect-error -- intentional: legacy typing gap
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
