import { DashboardChannelConfigurationSchema } from '@gmod/schema/server/DashboardChannelSchema.js'
import { type Component, createResource, Show } from 'solid-js'
import AdminChannelSelector from '../../../../../components/AdminChannelSelector.js'
import AdminPanel from '../../../../../components/AdminPanel.js'
import ConfirmActionDialog from '../../../../../components/ConfirmActionDialog.js'
import DiscordChannel from '../../../../../components/discord/DiscordChannel.js'
import { AsyncState, Button, SettingRow } from '../../../../../components/ui/index.js'
import { useI18n } from '../../../../../i18n.js'
import { fetchAPI } from '../../../../../utils/api.js'
import { showDialog } from '../../../../../utils/dialog.js'
import { guildChannels, guildChannelsRefetch } from '../../GuildInformations.js'

const endpoint = '/users/:discordID/guilds/:guildID/servers/:serverID/errors/channels'
const selectorID = 'select-lua-errors-channel'
const removalID = 'remove-lua-errors-channel'

export const ServerErrorsParameters: Component = () => {
  const { t } = useI18n()
  const [channel, { mutate, refetch }] = createResource(async () => {
    const response = await fetchAPI(endpoint, 'GET')
    if (!response.ok) throw new Error('Lua error destination unavailable')
    return DashboardChannelConfigurationSchema.parse(await response.json())
  })
  const configuredID = () => (!channel.loading && !channel.error ? channel()?.channelID : undefined)
  const knownChannel = () =>
    !guildChannels.loading && !guildChannels.error && guildChannels().some((entry) => entry.id === configuredID())

  async function saveChannel(channelID: string) {
    const response = await fetchAPI(endpoint, 'POST', { channelID })
    if (!response.ok) throw new Error('Lua error destination update failed')
    const accepted = DashboardChannelConfigurationSchema.parse(await response.json())
    if (accepted.channelID !== channelID) throw new Error('Lua error destination was not confirmed')
    mutate(accepted)
  }

  async function removeChannel() {
    const response = await fetchAPI(endpoint, 'DELETE')
    if (!response.ok) throw new Error('Lua error destination removal failed')
    const accepted = DashboardChannelConfigurationSchema.parse(await response.json())
    if (accepted.channelID) throw new Error('Lua error destination removal was not confirmed')
    mutate({})
  }

  return (
    <>
      <AdminChannelSelector
        id={selectorID}
        callback={saveChannel}
        idSelect={configuredID()}
        title={t('dashboard.server.errors.channel.select', 'Select a channel')}
      />
      <ConfirmActionDialog
        id={removalID}
        title={t('dashboard.server.errors.channel.remove', 'Remove destination')}
        description={t(
          'dashboard.server.errors.channel.remove_help',
          'Stop sending Lua errors to this destination? The Discord channel and saved error history will be kept.',
        )}
        confirmLabel={t('dashboard.server.errors.channel.remove', 'Remove destination')}
        onConfirm={removeChannel}
      />
      <AdminPanel
        title={t('dashboard.server.errors.channel.title', 'Lua errors on Discord')}
        icon="bug"
        description={t(
          'dashboard.server.errors.channel.description',
          'Send future Lua error reports from the game server and players to a Discord text channel. Saved errors remain available below.',
        )}
      >
        <AsyncState
          loading={channel.loading}
          error={channel.error}
          errorLabel={t('dashboard.server.errors.channel.load_error', 'Unable to load the Lua error destination.')}
          onRetry={() => void refetch()}
        >
          <SettingRow
            title={t('dashboard.server.errors.channel.destination', 'Discord destination')}
            description={t(
              'dashboard.server.errors.channel.destination_help',
              'Choose a channel and confirm the selection to receive new error reports there.',
            )}
          >
            <div class="flex w-full min-w-0 items-center gap-2">
              <Show
                when={configuredID()}
                fallback={
                  <span class="text-base-content/60">
                    {t('dashboard.server.errors.channel.empty', 'No destination channel')}
                  </span>
                }
              >
                <Show when={knownChannel()} fallback={<span class="text-base-content/60">#{configuredID()}</span>}>
                  <DiscordChannel channelID={configuredID()} />
                </Show>
              </Show>
            </div>
            <Button
              variant="primary"
              size="sm"
              disabled={channel.loading || !!channel.error}
              onClick={() => {
                showDialog(selectorID)
                void guildChannelsRefetch()
              }}
            >
              {t('dashboard.server.errors.channel.select', 'Select a channel')}
            </Button>
            <Show when={configuredID()}>
              <Button variant="ghost" size="sm" onClick={() => showDialog(removalID)}>
                {t('dashboard.server.errors.channel.remove', 'Remove destination')}
              </Button>
            </Show>
          </SettingRow>
        </AsyncState>
      </AdminPanel>
    </>
  )
}
