import { Component, createEffect, createResource, createSignal, For, Match, Show, Switch } from 'solid-js'
import AdminPanel from '../../../../../components/AdminPanel'
import AdminModal from '../../../../../components/AdminModal'
import 'emoji-picker-element'
import { guildChannelsRefetch } from '../../GuildInformations'
import AdminChannelSelector from '../../../../../components/AdminChannelSelector'
import { useI18n } from '../../../../../i18n'
import DiscordMessage from '../../../../../components/discord/DiscordMessage'
import { premium, PremiumBadge } from '../../../../../utils/premium'
import { fetchAPI } from '../../../../../utils/api'
import ServerStatusButtons from './ServerStatusButtons'
import ServerStatusCustom from './ServerStatusCustom'
import ServerStatusChannel from './ServerStatusChannel'

const fetchStatus = async () => {
  const res = await fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/status', 'GET')
  if (!res.ok) {
    return {}
  }
  return await res.json()
}

const fetchShowPlayerList = async () => {
  const res = await fetchAPI(
    '/users/:discordID/guilds/:guildID/servers/:serverID/settings/show_player_list_status',
    'GET',
  )
  if (!res.ok) {
    return {}
  }
  return await res.json()
}

const ServerStatusMessage: Component = () => {
  const [status, { mutate: statusMutate }] = createResource('status', fetchStatus)
  const [showPlayerList, { mutate: showPlayerListMutate }] = createResource('showPlayerList', fetchShowPlayerList)
  const { t } = useI18n()

  const sendStatus = async (channelID: string) => {
    const res = await fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/status', 'POST', {
      channelID,
    })
    if (!res.ok) {
      return
    }
    const status = await res.json()
    statusMutate(status)
    return status
  }

  const [format, setFormat] = createSignal('')
  const [preview, setPreview] = createSignal('')

  createEffect(() => {
    const previewValue = format()
      .replace('{name}', 'John Doe')
      .replace('{steamID64}', '76500000000000000')
      .replace('{team}', 'Citizen')
      .replace('{userGroup}', 'user')
      .replace('{connectTime}', '00:00:00')
      .replace('{kills}', '0')
      .replace('{deaths}', '0')
      .replace('{position}', '0 0 0')
      .replace('{angle}', '0 0 0')
      .replace('{fps}', '0')
      .replace('{ping}', '0')
      .replace('{adjustedTime}', '0')
      .replace('{branch}', 'main')
      .replace('{custom}', ':icon:')
    setPreview(previewValue)
  })

  const [status_player_list_format, { mutate: statusPlayerListFormatMutate }] = createResource(async () => {
    const res = await fetchAPI(
      '/users/:discordID/guilds/:guildID/servers/:serverID/settings/status_player_list_format',
      'GET',
    )
    if (!res.ok) {
      return {}
    }
    const data = await res.json()
    setFormat(data.value)
    return data
  })

  function updateStatusPlayerListFormat(value: string) {
    fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/settings/status_player_list_format', 'PUT', {
      value: value,
    })
      .then((res) => {
        if (res.ok) {
          return res.json()
        } else {
          throw new Error('An error occurred while updating the pseudo direction.')
        }
      })
      .then((data) => {
        statusPlayerListFormatMutate(data)
        // @ts-ignore
        edit_format.close()
      })
  }

  const [show_status_chart, { mutate: showStatusChartMutate }] = createResource(async () => {
    const res = await fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/settings/show_status_chart', 'GET')
    if (!res.ok) {
      return {}
    }
    return await res.json()
  })

  function updateShowStatusChart(value: boolean) {
    fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/settings/show_status_chart', 'PUT', {
      value: value,
    })
      .then((res) => {
        if (res.ok) {
          return res.json()
        } else {
          throw new Error('An error occurred while updating the pseudo direction.')
        }
      })
      .then((data) => {
        showStatusChartMutate(data)
      })
  }

  const removeStatus = async () => {
    const res = await fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/status', 'DELETE')
    if (!res.ok) {
      return
    }
    statusMutate({})
  }

  async function editPlayerListMutate(value: boolean) {
    fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/settings/show_player_list_status', 'PUT', {
      value: value,
    })
      .then((res) => {
        if (res.ok) {
          return res.json()
        } else {
          throw new Error('An error occurred while updating the pseudo direction.')
        }
      })
      .then((data) => {
        showPlayerListMutate(data)
      })
  }

  // @ts-ignore
  return (
    <>
      <AdminChannelSelector id="select_channel_modal" callback={sendStatus} />

      <AdminModal title={t('dashboard.server.pseudo.editFormat', 'Edit Format')} id="edit_format">
        <Show when={!status_player_list_format.loading}>
          <div class="fieldset p-2">
            <h1 class="text-lg text-base-content/70 font-bold">
              {t('dashboard.server.pseudo.variables', 'Variables')}
            </h1>
            <ul class="text-base-content/60 list-inside">
              <li>{`{name} - ${t('dashboard.server.status.playerName', 'Player Name')}`}</li>
              <li>{`{steamID64} - ${t('dashboard.server.status.playerSteamID64', 'Player SteamID64')}`}</li>
              <li>{`{team} - ${t('dashboard.server.status.team', 'Team')}`}</li>
              <li>{`{userGroup} - ${t('dashboard.server.status.userGroup', 'User Group')}`}</li>
              <li>{`{connectTime} - ${t('dashboard.server.status.connectTime', 'Connect Time')}`}</li>
              <li>{`{kills} - ${t('dashboard.server.status.kills', 'Kills')}`}</li>
              <li>{`{deaths} - ${t('dashboard.server.status.deaths', 'Deaths')}`}</li>
              <li>{`{position} - ${t('dashboard.server.status.position', 'Position')}`}</li>
              <li>{`{angle} - ${t('dashboard.server.status.angle', 'Angle')}`}</li>
              <li>{`{fps} - ${t('dashboard.server.status.fps', 'FPS')}`}</li>
              <li>{`{ping} - ${t('dashboard.server.status.ping', 'Ping')}`}</li>
              <li>{`{adjustedTime} - ${t('dashboard.server.status.adjustedTime', 'Adjusted Time')}`}</li>
              <li>{`{branch} - ${t('dashboard.server.status.branch', 'Branch')}`}</li>
              <li>{`{custom} - ${t('dashboard.server.status.custom', 'Custom variable')}`}</li>
            </ul>
          </div>
          <div class="fieldset">
            <label class="label">
              <span>{t('dashboard.server.pseudo.format', 'Format')}</span>
            </label>
            <input
              type="text"
              class="input"
              value={status_player_list_format().value}
              onInput={(e) => {
                setFormat(e.currentTarget.value)
              }}
            />
          </div>
          <div class="fieldset">
            <label class="label">
              <span>{t('dashboard.server.pseudo.preview', 'Preview')}</span>
            </label>
            <input type="text" class="input" value={preview()} readonly />
          </div>
          <button
            class="btn btn-base-200 mt-2"
            onClick={async () => {
              // @ts-ignore
              edit_format.close()
              updateStatusPlayerListFormat(format())
            }}
          >
            {t('dashboard.server.pseudo.save', 'Save')}
          </button>
        </Show>
      </AdminModal>

      <AdminPanel
        title={t('dashboard.server.status.title', 'Server Status')}
        description={t('dashboard.server.status.description', 'Here you can see the current status of your server.')}
      >
        <div class="flex w-fit items-center gap-2">
          <span>{t('dashboard.server.status.status_message', 'Status Message')}:</span>
          <Show
            when={!status.loading && status().channel}
            fallback={
              <>
                <span>{t('dashboard.server.status.no_status_message', 'No status message')}</span>
                <div class="tooltip tooltip-info" data-tip={t('dashboard.server.status.send_status', 'Send Status')}>
                  <button
                    class="btn btn-sm hover:cursor-pointer fa-solid fa-plus"
                    disabled={status_player_list_format.loading}
                    onClick={() => {
                      // @ts-ignore
                      select_channel_modal.showModal()
                      guildChannelsRefetch()
                    }}
                  ></button>
                </div>
              </>
            }
          >
            <DiscordMessage messageID={status().message} channelID={status().channel} />
            <div class="tooltip tooltip-danger" data-tip={t('dashboard.server.status.remove_status', 'Remove Status')}>
              <button
                class="btn btn-sm hover:cursor-pointer fa-solid fa-xmark text-error"
                disabled={status_player_list_format.loading}
                onClick={async () => {
                  // @ts-ignore
                  await removeStatus()
                }}
              ></button>
            </div>
          </Show>
        </div>

        <div class="flex w-fit items-center gap-2">
          <span>{t('dashboard.server.status.show_player_list', 'Show Player List')}:</span>
          <input
            type="checkbox"
            class="toggle toggle-md"
            disabled={showPlayerList.loading}
            checked={!showPlayerList.loading ? (showPlayerList() ? showPlayerList().value : false) : false}
            onChange={async (e) => {
              await editPlayerListMutate(e.currentTarget.checked)
            }}
          />
        </div>

        <div class="flex w-fit items-center tooltip-warning gap-2">
          <span class="text-nowrap">{t('dashboard.server.status.format', 'Player List Format')}:</span>
          <input type="text" class="input" value={preview()} readOnly disabled={status_player_list_format.loading} />
          <div class="tooltip tooltip-info" data-tip={t('dashboard.server.status.edit', 'Edit')}>
            <button
              class="btn btn-sm hover:cursor-pointer fa-solid fa-edit"
              disabled={status_player_list_format.loading}
              onClick={() => {
                // @ts-ignore
                edit_format.showModal()
              }}
            ></button>
          </div>
        </div>

        <div
          class="flex w-fit items-center tooltip-warning gap-2"
          classList={{
            tooltip: !premium(),
          }}
          data-tip={t('dashboard.server.status.premium_only', 'This feature is only available for premium users.')}
        >
          <PremiumBadge onlyIcon={true} noMargin={true} />
          <span>{t('dashboard.server.status.show_player_chart', 'Show Player Chart')}:</span>
          <input
            type="checkbox"
            class="toggle toggle-md"
            disabled={!premium() || show_status_chart.loading}
            checked={!show_status_chart.loading ? (show_status_chart() ? show_status_chart().value : false) : false}
            onChange={async (e) => {
              await updateShowStatusChart(e.currentTarget.checked)
            }}
          />
        </div>
      </AdminPanel>
    </>
  )
}

export default ServerStatusMessage
