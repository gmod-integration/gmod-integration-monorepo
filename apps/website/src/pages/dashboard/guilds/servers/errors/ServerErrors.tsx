import { FeatureGate } from '../../../../../components/FeatureGate.js'
import { type Component, createResource, createSignal, For, type ParentProps, Show } from 'solid-js'
import { DateTime, IconButton, IconButtonLink, TableState, Icon } from '../../../../../components/ui/index.js'
import AdminPanel from '../../../../../components/AdminPanel'
import { useI18n } from '../../../../../i18n'
import JsonViewer from '../../../../../components/JsonViewer'
import { fetchAPI } from '../../../../../utils/api'
import { type ClientQuery, QuerySort, type ServerQuery } from '../../../../../utils/types/QueryTypes'
import Pagination from '../../../../../components/Pagination'
import { ServerErrorsParameters } from './ServerErrorsParameters.js'

interface ErrorsSchema {
  serverID: string
  count: number
  realm: string
  error: string
  stack: string
  name: string
  steamID64: string
  workshopID: string
  uptime: number
  createdAt: string
  updatedAt: string
}

interface ErrorsData {
  errors: ErrorsSchema[]
  query: ServerQuery
}

interface AddErrorProps extends ParentProps {
  error: ErrorsSchema
}

const [selectError, setSelectError] = createSignal(0)
let idxLog = 0
const AddErrorComponent: Component<AddErrorProps> = (props) => {
  const { t } = useI18n()

  // Bug fix: this used to mutate `props.error.stack` in place. Solid's dev/HMR wrapper can
  // re-invoke a component's function body for the same props object, and on that second pass
  // `props.error.stack` would already be the parsed array/object (not a JSON string) -
  // `JSON.parse(anArray)` implicitly stringifies it via `Array#toString` (comma-joined, not valid
  // JSON) and throws, an unhandled rejection since nothing downstream awaits/catches this render.
  // Building a separate object instead of reassigning the prop makes this idempotent.
  const parsedError = {
    ...props.error,
    stack: typeof props.error.stack === 'string' ? JSON.parse(props.error.stack || '[]') : (props.error.stack ?? []),
  }

  const errorContentStr = JSON.stringify(parsedError, null, 2).split('\n')
  idxLog++

  const localIdxLog = idxLog
  return (
    <>
      <tr>
        <td class="text-base-content/70 text-nowrap">
          <DateTime value={props.error.createdAt} />
        </td>
        <td
          classList={{
            'text-sky-500': props.error.realm === 'client',
            'text-yellow-500': props.error.realm === 'server',
          }}
        >
          {props.error.realm === 'client'
            ? t('dashboard.server.errors.realm_client', 'Player client')
            : props.error.realm === 'server'
              ? t('dashboard.server.errors.realm_server', 'Game server')
              : props.error.realm}
        </td>
        <td class="">{props.error.count}</td>
        <td class=" text-nowrap">{props.error.name}</td>
        <td class=" wrap-break-word">{props.error.error}</td>
        <td>
          <div class="flex flex-wrap items-center justify-center gap-2">
            <IconButton
              class="tooltip tooltip-info"
              variant="ghost"
              size="sm"
              label={t('dashboard.server.errors.actions.view_details', 'View error details')}
              aria-expanded={selectError() === localIdxLog}
              onClick={() => {
                if (selectError() === localIdxLog) {
                  setSelectError(0)
                } else {
                  setSelectError(localIdxLog)
                }
              }}
            >
              <Show when={selectError() === localIdxLog}>
                <Icon name="chevron-up" />
              </Show>
              <Show when={selectError() !== localIdxLog}>
                <Icon name="chevron-down" />
              </Show>
            </IconButton>
            <Show when={props.error.workshopID !== '' && props.error.workshopID !== '0'}>
              <IconButtonLink
                icon="external-link"
                label={t('dashboard.server.errors.actions.open_workshop', 'Open addon in Workshop')}
                href={`https://steamcommunity.com/sharedfiles/filedetails/?id=${props.error.workshopID}`}
                target="_blank"
                rel="noopener noreferrer"
              />
            </Show>
            <IconButtonLink
              icon="download"
              label={t('dashboard.server.errors.actions.download', 'Download error report')}
              href={`data:text/plain;charset=utf-8,${encodeURIComponent(errorContentStr.join('\n'))}`}
              download={`log-${props.error.createdAt.toLocaleString()}.json`}
            />
          </div>
        </td>
      </tr>

      <Show when={selectError() === localIdxLog}>
        <tr>
          <td colSpan="6" class="p-0">
            <pre class="hljs p-4">
              <JsonViewer data={parsedError} />
            </pre>
          </td>
        </tr>
      </Show>
    </>
  )
}

const ServerErrors: Component = () => {
  const [query, setQuery] = createSignal<ClientQuery>({
    limit: 25,
    offset: 0,
    sort: 'createdAt',
    orderBy: QuerySort.DESC,
  })

  async function fetchErrors(q: ClientQuery) {
    const res = await fetchAPI(
      `/users/:discordID/guilds/:guildID/servers/:serverID/errors` +
        `?offset=${q.offset}` +
        `&limit=${q.limit}` +
        `&sort=${q.sort}` +
        `&orderBy=${q.orderBy}`,
      'GET',
    )

    if (!res.ok) {
      throw new Error('Failed to fetch errors')
    }

    const data = (await res.json()) as ErrorsData

    return data
  }

  const [errors, { refetch }] = createResource(query, fetchErrors, {
    initialValue: {
      errors: [],
      query: {
        ...query(),
        total: 0,
      },
    },
  })

  const { t } = useI18n()

  return (
    <>
      <ServerErrorsParameters />
      <AdminPanel
        title={t('dashboard.server.errors.title', 'Errors')}
        description={t(
          'dashboard.server.errors.description',
          'Review Lua errors received from the game server and players. Open the details or download a report to investigate the cause.',
        )}
        type="none"
        footer={
          !errors.loading && !errors.error ? (
            <Pagination query={query()} total={errors().query.total} onChange={setQuery} standalone />
          ) : undefined
        }
      >
        <FeatureGate
          capability="errors.history"
          used={!errors.loading && !errors.error ? errors().query.total : undefined}
          loading={errors.loading}
          error={errors.error}
        />
        <table class="table">
          <thead>
            <tr class="text-l">
              <th class="w-1/6">{t('dashboard.server.errors.error_details.timestamp', 'Date')}</th>
              <th class="w-1/12">{t('dashboard.server.errors.error_details.realm', 'Source')}</th>
              <th class="w-1/12">{t('dashboard.server.errors.error_details.count', 'Occurrences')}</th>
              <th class="w-1/6">{t('dashboard.server.errors.error_details.addon', 'Addon')}</th>
              <th class="w-1/3">{t('dashboard.server.errors.error_details.message', 'Message')}</th>
              <th class="w-1/12 text-center">{t('dashboard.server.errors.actions.actions', 'Actions')}</th>
            </tr>
          </thead>
          <tbody>
            <TableState
              colSpan={6}
              loading={errors.loading}
              error={errors.error}
              errorLabel={t('dashboard.server.errors.load_error', 'Unable to load error reports. Try again.')}
              emptyLabel={t('dashboard.server.errors.empty', 'No Lua errors have been received for this server.')}
              empty={!errors.loading && !errors.error && errors().errors.length === 0}
              onRetry={() => void refetch()}
            >
              <For each={errors().errors}>{(errorData) => <AddErrorComponent error={errorData} />}</For>
            </TableState>
          </tbody>
        </table>
      </AdminPanel>
    </>
  )
}

export default ServerErrors
