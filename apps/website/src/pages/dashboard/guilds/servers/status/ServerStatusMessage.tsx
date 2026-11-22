import { type Component, Show } from 'solid-js'
import { useFeatureAccess } from '../../../../../components/AccessProvider.js'
import { FeatureGate, SuspendedFeature } from '../../../../../components/FeatureGate.js'
import { SettingRow, TemplateVariables } from '../../../../../components/ui/index.js'
import AdminPanel from '../../../../../components/AdminPanel.js'
import StatusCardActions from './StatusCardActions.js'
import { PremiumBadge } from '../../../../../utils/premium.js'
import { useI18n } from '../../../../../i18n.js'
import { useStatusConfiguration } from './StatusConfigurationContext.js'

const ServerStatusMessage: Component = () => {
  const { t } = useI18n()
  const chartAccess = useFeatureAccess('status.chart')
  const editor = useStatusConfiguration()
  const unavailable = () => !editor.ready()
  const variables = () => [
    {
      token: '{name}',
      label: t('dashboard.server.status.playerName', 'Player Name'),
      format: t('ui.template_variables.text', 'Text'),
      example: 'John Doe',
    },
    {
      token: '{steamID64}',
      label: t('dashboard.server.status.playerSteamID64', 'Player SteamID64'),
      format: t('ui.template_variables.text', 'Text'),
      example: '76500000000000000',
    },
    {
      token: '{team}',
      label: t('dashboard.server.status.team', 'Team'),
      format: t('ui.template_variables.text', 'Text'),
      example: 'Citizen',
    },
    {
      token: '{userGroup}',
      label: t('dashboard.server.status.userGroup', 'User Group'),
      format: t('ui.template_variables.text', 'Text'),
      example: 'admin',
    },
    {
      token: '{connectTime}',
      label: t('dashboard.server.status.connectTime', 'Connect Time'),
      format: t('ui.template_variables.duration', 'Duration (e.g. 1h 2m 3s)'),
      example: '1h 2m 3s',
    },
    {
      token: '{timeLastTeamChange}',
      label: t('dashboard.server.status.timeLastTeamChange', 'Time since the last team change'),
      format: t('ui.template_variables.duration', 'Duration (e.g. 1h 2m 3s)'),
      example: '12m 5s',
    },
    {
      token: '{kills}',
      label: t('dashboard.server.status.kills', 'Kills'),
      format: t('ui.template_variables.number', 'Number'),
      example: '12',
    },
    {
      token: '{deaths}',
      label: t('dashboard.server.status.deaths', 'Deaths'),
      format: t('ui.template_variables.number', 'Number'),
      example: '3',
    },
    {
      token: '{position}',
      label: t('dashboard.server.status.position', 'Position'),
      format: t('ui.template_variables.raw', 'Raw value'),
    },
    {
      token: '{angle}',
      label: t('dashboard.server.status.angle', 'Angle'),
      format: t('ui.template_variables.raw', 'Raw value'),
    },
    {
      token: '{fps}',
      label: t('dashboard.server.status.fps', 'FPS'),
      format: t('ui.template_variables.number', 'Number'),
      example: '144',
    },
    {
      token: '{ping}',
      label: t('dashboard.server.status.ping', 'Ping'),
      format: t('ui.template_variables.number', 'Number'),
      example: '24',
    },
    {
      token: '{adjustedTime}',
      label: t('dashboard.server.status.adjustedTime', 'Adjusted Time'),
      format: t('ui.template_variables.number', 'Number'),
      example: '3600',
    },
    {
      token: '{branch}',
      label: t('dashboard.server.status.branch', 'Branch'),
      format: t('ui.template_variables.text', 'Text'),
      example: 'x86-64',
    },
  ]
  return (
    <AdminPanel
      title={t('settings.message_content', 'Message content')}
      description={t('editing.status_message_scope', 'Changes to the player list and chart are saved automatically.')}
      icon="sliders-horizontal"
      footer={<StatusCardActions scope="message" />}
    >
      <SettingRow
        controlId="status-show-players"
        title={t('dashboard.server.status.show_player_list', 'Show Player List')}
        description={t(
          'settings.status_players_help',
          'Include the connected players and customize the information shown for each one.',
        )}
      >
        <input
          id="status-show-players"
          aria-describedby="status-show-players-description"
          type="checkbox"
          class="toggle toggle-sm"
          checked={editor.form.draft().settings.show_player_list_status}
          disabled={unavailable()}
          onChange={(event) =>
            editor.form.patch({
              settings: { ...editor.form.draft().settings, show_player_list_status: event.currentTarget.checked },
            })
          }
        />
      </SettingRow>
      <Show when={editor.form.draft().settings.show_player_list_status}>
        <div class="settings-dependent">
          <SettingRow
            controlId="status-player-format"
            title={t('dashboard.server.status.format', 'Player List Format')}
            description={t(
              'dashboard.server.status.format_help',
              'Template repeated for each connected player. Use the variables below, such as {name} and {ping}, and check the Discord preview.',
            )}
            stacked
          >
            <input
              id="status-player-format"
              aria-describedby="status-player-format-description"
              type="text"
              class="input w-full font-mono text-xs"
              maxLength={255}
              value={editor.form.draft().settings.status_player_list_format}
              disabled={unavailable()}
              onInput={(event) =>
                editor.form.patch({
                  settings: {
                    ...editor.form.draft().settings,
                    status_player_list_format: event.currentTarget.value,
                  },
                })
              }
            />
            <TemplateVariables
              variables={variables()}
              syntax="{variable}"
              example={{ template: '{connectTime} - {name} ({ping})', result: '1h 2m 3s - John Doe (24)' }}
              formatting={[
                { token: '**text**', label: t('ui.template_variables.bold', 'Bold') },
                { token: '`text`', label: t('ui.template_variables.inline_code', 'Inline code') },
                { token: '__text__', label: t('ui.template_variables.underline', 'Underline') },
                { token: '~~text~~', label: t('ui.template_variables.strikethrough', 'Strikethrough') },
              ]}
            />
          </SettingRow>
        </div>
      </Show>
      <SettingRow
        controlId="status-show-chart"
        title={
          <>
            {t('dashboard.server.status.show_player_chart', 'Show player activity chart')}{' '}
            <PremiumBadge onlyIcon noMargin />
          </>
        }
        description={t('settings.status_chart_help', 'Add a chart of player activity to the status message.')}
      >
        <input
          id="status-show-chart"
          aria-describedby="status-show-chart-description"
          type="checkbox"
          class="toggle toggle-sm"
          checked={editor.form.draft().settings.show_status_chart}
          disabled={unavailable() || (!chartAccess.allowed() && !editor.form.draft().settings.show_status_chart)}
          onChange={(event) =>
            editor.form.patch({
              settings: { ...editor.form.draft().settings, show_status_chart: event.currentTarget.checked },
            })
          }
        />
      </SettingRow>
      <FeatureGate capability="status.chart" showQuota={false} />
      <SuspendedFeature capability="status.chart" active={editor.form.saved().settings.show_status_chart} />
    </AdminPanel>
  )
}
export default ServerStatusMessage
