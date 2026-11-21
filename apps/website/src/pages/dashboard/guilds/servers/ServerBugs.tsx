import { type Component, createResource, createSignal, For, Show } from 'solid-js'
import AdminPanel from '../../../../components/AdminPanel'
import { IconButton, TableState, Icon } from '../../../../components/ui/index.js'
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
}

const [selectReport, setSelectReport] = createSignal(0)
const [hasLoadScreenshot, setHasLoadScreenshot] = createSignal(false)
let idxLog = 0
const AddReportBugsComponent: Component<AddReportBugs> = (props) => {
  idxLog++
  const localIdxLog = idxLog
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
        <td class="w-1/12">{props.importance}</td>
        <td class="wrap-break-word">{shortDescription}</td>
        <td>
          <div class="flex gap-2 justify-center">
            <IconButton
              class="tooltip tooltip-info"
              variant="ghost"
              size="sm"
              label={t('dashboard.server.actions.showMore', 'Show More')}
              aria-expanded={selectReport() === localIdxLog}
              onClick={() => {
                setHasLoadScreenshot(false)
                if (selectReport() === localIdxLog) {
                  setSelectReport(0)
                } else {
                  setSelectReport(localIdxLog)
                }
              }}
            >
              <Show when={selectReport() === localIdxLog}>
                <Icon name="chevron-up" />
              </Show>
              <Show when={selectReport() !== localIdxLog}>
                <Icon name="chevron-down" />
              </Show>
            </IconButton>
          </div>
        </td>
      </tr>

      <Show when={selectReport() === localIdxLog}>
        <tr>
          <td colspan="5">
            <h3 class="font-bold">{t('dashboard.server.screenshot', 'Screenshot')}</h3>
            <Show when={!hasLoadScreenshot()}>
              <span class="loading loading-lg"></span>
            </Show>
            <img
              class="w-1/2 h-1/2"
              src={`${getAPIUrl(false)}/screenshots/${props.screenshot}`}
              alt="screenshot"
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

  return (
    <>
      <AdminPanel
        title={t('dashboard.server.bugsReport.title', 'Bugs Report')}
        description={t('dashboard.server.bugsReport.description', 'List of all bugs reported on your server')}
        type="none"
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
              empty={!bugsReport.loading && !bugsReport.error && bugsReport()?.length === 0}
              onRetry={() => void refetch()}
            >
              <For each={bugsReport()}>
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
