import { type Component, For, Show } from 'solid-js'
import { useFeatureAccess } from '../../../../../components/AccessProvider.js'
import { FeatureGate, SuspendedFeature } from '../../../../../components/FeatureGate.js'
import { Checkbox, SettingRow } from '../../../../../components/ui/index.js'
import AdminPanel from '../../../../../components/AdminPanel.js'
import StatusCardActions from './StatusCardActions.js'
import { PremiumBadge } from '../../../../../utils/premium.js'
import { useI18n } from '../../../../../i18n.js'
import { useStatusConfiguration } from './StatusConfigurationContext.js'

const ServerStatusMessage: Component = () => {
  const { t } = useI18n()
  const chartAccess = useFeatureAccess('status.chart')
  const editor = useStatusConfiguration()
  const unavailable = () => !editor.ready() || editor.form.pending()
  const variables = [
    ['name', 'playerName', 'Player Name'],
    ['steamID64', 'playerSteamID64', 'Player SteamID64'],
    ['team', 'team', 'Team'],
    ['userGroup', 'userGroup', 'User Group'],
    ['connectTime', 'connectTime', 'Connect Time'],
    ['kills', 'kills', 'Kills'],
    ['deaths', 'deaths', 'Deaths'],
    ['position', 'position', 'Position'],
    ['angle', 'angle', 'Angle'],
    ['fps', 'fps', 'FPS'],
    ['ping', 'ping', 'Ping'],
    ['adjustedTime', 'adjustedTime', 'Adjusted Time'],
    ['branch', 'branch', 'Branch'],
  ]
  return (
    <AdminPanel
      title={t('settings.message_content', 'Message content')}
      description={t(
        'editing.status_message_scope',
        'Save this card to update the player list and chart. Link buttons are saved separately.',
      )}
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
        <Checkbox
          id="status-show-players"
          aria-describedby="status-show-players-description"
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
            <details class="settings-advanced w-full">
              <summary>{t('dashboard.server.pseudo.variables', 'Variables')}</summary>
              <ul class="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                <For each={variables}>
                  {([variable, label, fallback]) => (
                    <li class="flex items-center gap-2">
                      <code class="text-xs text-primary">{`{${variable}}`}</code>
                      <span class="text-xs text-base-content/55">
                        {t(`dashboard.server.status.${label}`, fallback)}
                      </span>
                    </li>
                  )}
                </For>
              </ul>
            </details>
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
        <Checkbox
          id="status-show-chart"
          aria-describedby="status-show-chart-description"
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
