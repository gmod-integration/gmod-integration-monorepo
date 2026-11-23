import type { DashboardChannelConfiguration } from '@gmod/schema/server/DashboardChannelSchema.js'
import { type Component, createResource, Show } from 'solid-js'
import AdminChannelSelector from './AdminChannelSelector.js'
import AdminPanel from './AdminPanel.js'
import ConfirmActionDialog from './ConfirmActionDialog.js'
import DiscordChannel from './discord/DiscordChannel.js'
import { AsyncState, Button, SettingRow, type IconName } from './ui/index.js'
import { showDialog } from '../utils/dialog.js'
import { guildChannels, guildChannelsRefetch } from '../pages/dashboard/guilds/GuildInformations.js'

export interface ReportChannelLabels {
  title: string
  description: string
  destination: string
  destinationHelp: string
  select: string
  remove: string
  empty: string
  loadError: string
  removeHelp: string
}

interface ReportChannelSettingsProps {
  selectorID: string
  removalID: string
  icon: IconName
  labels: ReportChannelLabels
  load: () => Promise<DashboardChannelConfiguration>
  save: (channelID: string) => Promise<DashboardChannelConfiguration>
  remove: () => Promise<DashboardChannelConfiguration>
}

/** Report destinations share confirmation, acknowledgement and recoverable failure behavior. */
export const ReportChannelSettings: Component<ReportChannelSettingsProps> = (props) => {
  const [channel, { mutate, refetch }] = createResource(props.load)
  const configuredID = () => (!channel.loading && !channel.error ? channel()?.channelID : undefined)
  const knownChannel = () =>
    !guildChannels.loading && !guildChannels.error && guildChannels().some((entry) => entry.id === configuredID())

  async function saveChannel(channelID: string) {
    const accepted = await props.save(channelID)
    if (accepted.channelID !== channelID) throw new Error('Report destination was not confirmed')
    mutate(accepted)
  }

  async function removeChannel() {
    const accepted = await props.remove()
    if (accepted.channelID) throw new Error('Report destination removal was not confirmed')
    mutate({})
  }

  return (
    <>
      <AdminChannelSelector
        id={props.selectorID}
        callback={saveChannel}
        idSelect={configuredID()}
        title={props.labels.select}
      />
      <ConfirmActionDialog
        id={props.removalID}
        title={props.labels.remove}
        description={props.labels.removeHelp}
        confirmLabel={props.labels.remove}
        onConfirm={removeChannel}
      />
      <AdminPanel title={props.labels.title} icon={props.icon} description={props.labels.description}>
        <AsyncState
          loading={channel.loading}
          error={channel.error}
          errorLabel={props.labels.loadError}
          onRetry={() => void refetch()}
        >
          <SettingRow title={props.labels.destination} description={props.labels.destinationHelp}>
            <div class="flex w-full min-w-0 items-center gap-2">
              <Show when={configuredID()} fallback={<span class="text-base-content/60">{props.labels.empty}</span>}>
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
                showDialog(props.selectorID)
                void guildChannelsRefetch()
              }}
            >
              {props.labels.select}
            </Button>
            <Show when={configuredID()}>
              <Button variant="ghost" size="sm" onClick={() => showDialog(props.removalID)}>
                {props.labels.remove}
              </Button>
            </Show>
          </SettingRow>
        </AsyncState>
      </AdminPanel>
    </>
  )
}
