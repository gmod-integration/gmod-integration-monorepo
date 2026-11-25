import { type Component } from 'solid-js'
import { ReportChannelSettings } from '../../../../components/ReportChannelSettings.js'
import { createReportChannelRequests } from '../../../../hooks/createReportChannelRequests.js'
import { useI18n } from '../../../../i18n.js'

export const ServerBugsParameters: Component = () => {
  const { t } = useI18n()
  const requests = createReportChannelRequests('/users/:discordID/guilds/:guildID/servers/:serverID/bugs/channels')
  return (
    <ReportChannelSettings
      {...requests}
      selectorID="select-bug-reports-channel"
      removalID="remove-bug-reports-channel"
      icon="bug"
      labels={{
        title: t('dashboard.server.bugsReport.channel.title', 'Bug reports on Discord'),
        description: t(
          'dashboard.server.bugsReport.channel.description',
          'Send new player bug reports to a Discord text channel. Saved reports and screenshots remain available below.',
        ),
        destination: t('dashboard.server.bugsReport.channel.destination', 'Discord destination'),
        destinationHelp: t(
          'dashboard.server.bugsReport.channel.destination_help',
          'Choose a channel and confirm the selection to receive new bug reports there.',
        ),
        select: t('dashboard.server.bugsReport.channel.select', 'Select a channel'),
        remove: t('dashboard.server.bugsReport.channel.remove', 'Remove destination'),
        empty: t('dashboard.server.bugsReport.channel.empty', 'No destination channel'),
        loadError: t('dashboard.server.bugsReport.channel.load_error', 'Unable to load the bug report destination.'),
        removeHelp: t(
          'dashboard.server.bugsReport.channel.remove_help',
          'Stop sending bug reports to this destination? The Discord channel and saved reports will be kept.',
        ),
      }}
    />
  )
}
