import { type Component, createResource, createSignal, For, Show } from 'solid-js'
import Pagination from '../../../../components/Pagination.js'
import { createListPagination } from '../../../../hooks/createListPagination.js'
import AdminPanel from '../../../../components/AdminPanel'
import { IconButton, TableState, Icon, StatusBadge } from '../../../../components/ui/index.js'
import { useI18n } from '../../../../i18n'
import { fetchAPI, getAPIUrl } from '../../../../utils/api'

enum Status {
  OPEN = 'open',
  CLOSE = 'close',
}

enum Importance {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  TRIVIAL = 'trivial',
  CRITICAL = 'critical',
}

const importanceAppearance = (importance: Importance) => {
  switch (importance) {
    case Importance.CRITICAL:
      return { tone: 'danger', icon: 'circle-alert' } as const
    case Importance.HIGH:
      return { tone: 'warning', icon: 'triangle-alert' } as const
    case Importance.MEDIUM:
      return { tone: 'info', icon: 'info' } as const
    case Importance.LOW:
    case Importance.TRIVIAL:
      return { tone: 'neutral', icon: 'info' } as const
    default:
      return { tone: 'neutral', icon: 'circle-help' } as const
  }
}

interface AddReportBugs {
  steamID64: string
  description: string
  status: Status
  importance: Importance
  actual: string
  expected: string
  screenshot: string
  steps: string
  id: number
  createAt: Date
  expanded: boolean
  onToggle: () => void
}

const AddReportBugsComponent: Component<AddReportBugs> = (props) => {
  const [hasLoadScreenshot, setHasLoadScreenshot] = createSignal(false)
  let shortDescription = props.description.substring(0, 160)
  if (props.description.length > 160) {
    shortDescription += '...'
  }
  const { t } = useI18n()
  return (
    <>
      <tr>
        <td class="w-1/6 text-base-content/70 text-nowrap">{props.createAt.toLocaleString()}</td>
        <td class="w-1/6 text-nowrap">{props.steamID64}</td>
        {/*<td class="w-1/12">{props.status}</td>*/}
        <td class="w-1/12">
          <StatusBadge
            tone={importanceAppearance(props.importance).tone}
            icon={importanceAppearance(props.importance).icon}
          >
            {Object.values(Importance).includes(props.importance)
              ? t(`dashboard.server.bugsReport.importance_levels.${props.importance}`, props.importance)
              : t('ui.unknown', 'Unknown')}
          </StatusBadge>
        </td>
        <td class="wrap-break-word">{shortDescription}</td>
        <td>
          <div class="flex gap-2 justify-center">
            <IconButton
              class="tooltip tooltip-info"
              variant="ghost"
              size="sm"
              label={t('dashboard.server.actions.showMore', 'Show More')}
              aria-expanded={props.expanded}
              onClick={() => {
                setHasLoadScreenshot(false)
                props.onToggle()
              }}
            >
              <Show when={props.expanded}>
                <Icon name="chevron-up" />
              </Show>
              <Show when={!props.expanded}>
                <Icon name="chevron-down" />
              </Show>
            </IconButton>
          </div>
        </td>
      </tr>

      <Show when={props.expanded}>
        <tr>
          <td colspan="5">
            <h3 class="font-bold">{t('dashboard.server.screenshot', 'Screenshot')}</h3>
            <Show when={!hasLoadScreenshot()}>
              <span class="loading loading-lg"></span>
            </Show>
            <img
              class="w-1/2 h-1/2"
              src={`${getAPIUrl(false)}/screenshots/${props.screenshot}`}
              alt={t('dashboard.server.bugsReport.screenshot_alt', 'Screenshot attached to the bug report')}
              onLoad={() => setHasLoadScreenshot(true)}
              onError={() => setHasLoadScreenshot(false)}
              classList={{
                hidden: !hasLoadScreenshot(),
              }}
            />
            <br />
            <h3 class="font-bold">{t('dashboard.server.description', 'Description')}</h3>
            <p>{props.description}</p>
            <br />
            <h3 class="font-bold">{t('dashboard.server.expected', 'What did you expect to happen ?')}</h3>
            <p>{props.expected}</p>
            <br />
            <h3 class="font-bold">{t('dashboard.server.actual', 'What actually happened ?')}</h3>
            <p>{props.actual}</p>
            <br />
            <h3 class="font-bold">{t('dashboard.server.steps', 'Steps to Reproduce')}</h3>
            <p>{props.steps}</p>
          </td>
        </tr>
      </Show>
    </>
  )
}

/* [
{ "id": 1, "serverID": "QY5x4zjHG9", "steamID64": "76561198219049673", "description": "fefe", "status": "open", "steps": "fefe", "expected": "fe", "actual": "fefec", "importance": "high", "screenshot": "", "createdAt": "2024-08-16T22:48:08.000Z", "updatedAt": "2024-08-16T22:48:08.000Z" }
*/
type Bugs = {
  id: number
  serverID: string
  steamID64: string
  description: string
  status: Status
  steps: string
  expected: string
  actual: string
  importance: Importance
  screenshot: string
  createdAt: string
  updatedAt: string
}

const ServerBugs: Component = () => {
  const [bugsReport, { refetch }] = createResource('bugsReport', async () => {
    return await fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/bugs', 'GET')
      .then(async (res) => {
        if (!res.ok) {
          throw new Error('Bug reports request failed')
        }
        return (await res.json()) as Bugs[]
      })
      .then((data) => {
        return data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      })
  })

  const { t } = useI18n()
  const [selectedReport, setSelectedReport] = createSignal<number>()
  const pagination = createListPagination(() => (!bugsReport.error ? bugsReport() : undefined))

  return (
    <>
      <AdminPanel
        title={t('dashboard.server.bugsReport.title', 'Bug reports')}
        description={t(
          'dashboard.server.bugsReport.description',
          'Read reports submitted by players. Expand a report to see what happened, the expected result and steps to reproduce it.',
        )}
        type="none"
        footer={
          !bugsReport.loading && !bugsReport.error && pagination.visible() ? (
            <Pagination
              standalone
              query={pagination.query()}
              total={pagination.total()}
              onChange={pagination.onChange}
            />
          ) : undefined
        }
      >
        <table class="table">
          <thead>
            <tr class="text-l">
              <th class="w-1/6">{t('dashboard.server.date', 'Date')}</th>
              <th class="w-1/8">{t('dashboard.server.player', 'Player')}</th>
              {/*<th class="w-1/8">{t("dashboard.server.status", "Status")}</th>*/}
              <th class="w-1/8">{t('dashboard.server.importance', 'Importance')}</th>
              <th>{t('dashboard.server.description', 'Description')}</th>
              <th class="w-1/6 text-center">{t('dashboard.server.actions', 'Actions')}</th>
            </tr>
          </thead>
          <tbody>
            <TableState
              colSpan={5}
              loading={bugsReport.loading}
              error={bugsReport.error}
              errorLabel={t('dashboard.server.bugsReport.load_error', 'Unable to load bug reports. Try again.')}
              emptyLabel={t('dashboard.server.bugsReport.empty', 'No bug reports have been received for this server.')}
              empty={!bugsReport.loading && !bugsReport.error && bugsReport()?.length === 0}
              onRetry={() => void refetch()}
            >
              <For each={pagination.items()}>
                {(reportData) => (
                  <AddReportBugsComponent
                    status={reportData.status}
                    importance={reportData.importance}
                    description={reportData.description}
                    steamID64={reportData.steamID64}
                    actual={reportData.actual}
                    expected={reportData.expected}
                    screenshot={reportData.screenshot}
                    steps={reportData.steps}
                    id={reportData.id}
                    expanded={selectedReport() === reportData.id}
                    onToggle={() => setSelectedReport(selectedReport() === reportData.id ? undefined : reportData.id)}
                    createAt={new Date(reportData.createdAt)}
                  />
                )}
              </For>
            </TableState>
          </tbody>
        </table>
      </AdminPanel>
    </>
  )
}

export default ServerBugs
