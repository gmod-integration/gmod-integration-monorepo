import { type Component } from 'solid-js'
import { ReportChannelSettings } from '../../../../../components/ReportChannelSettings.js'
import { createReportChannelRequests } from '../../../../../hooks/createReportChannelRequests.js'
import { useI18n } from '../../../../../i18n.js'

export const ServerErrorsParameters: Component = () => {
  const { t } = useI18n()
  const requests = createReportChannelRequests('/users/:discordID/guilds/:guildID/servers/:serverID/errors/channels')
  return (
    <ReportChannelSettings
      {...requests}
      selectorID="select-lua-errors-channel"
      removalID="remove-lua-errors-channel"
      icon="bug"
      labels={{
        title: t('dashboard.server.errors.channel.title', 'Lua errors on Discord'),
        description: t(
          'dashboard.server.errors.channel.description',
          'Send future Lua error reports from the game server and players to a Discord text channel. Saved errors remain available below.',
        ),
        destination: t('dashboard.server.errors.channel.destination', 'Discord destination'),
        destinationHelp: t(
          'dashboard.server.errors.channel.destination_help',
          'Choose a channel and confirm the selection to receive new error reports there.',
        ),
        select: t('dashboard.server.errors.channel.select', 'Select a channel'),
        remove: t('dashboard.server.errors.channel.remove', 'Remove destination'),
        empty: t('dashboard.server.errors.channel.empty', 'No destination channel'),
        loadError: t('dashboard.server.errors.channel.load_error', 'Unable to load the Lua error destination.'),
        removeHelp: t(
          'dashboard.server.errors.channel.remove_help',
          'Stop sending Lua errors to this destination? The Discord channel and saved error history will be kept.',
        ),
      }}
    />
  )
}
