import { useParams } from '@solidjs/router'
import { createMemo, createResource, createSignal, onCleanup, onMount, Show } from 'solid-js'
import { ServerMapSnapshotSchema } from '@gmod/schema/server/ServerMapSchema.js'
import AdminPanel from '../../../../components/AdminPanel.js'
import { AsyncState, Button, ButtonLink, Icon } from '../../../../components/ui/index.js'
import { useI18n } from '../../../../i18n.js'
import { fetchAPI } from '../../../../utils/api.js'
import { resolvedTheme } from '../../../../utils/theme.js'
import './ServerMap.css'

export default function ServerMap() {
  const { t } = useI18n()
  const params = useParams<{ guildID: string; serverID: string }>()
  const [revision, setRevision] = createSignal(0)
  const endpoint = createMemo(() =>
    params.guildID && params.serverID
      ? `/users/:discordID/guilds/${encodeURIComponent(params.guildID)}/servers/${encodeURIComponent(params.serverID)}/map`
      : false,
  )
  let activeRequest: AbortController | undefined
  onCleanup(() => activeRequest?.abort())
  const [snapshot, { refetch }] = createResource(endpoint, async (request) => {
    activeRequest?.abort()
    activeRequest = new AbortController()
    const response = await fetchAPI(request, 'GET', undefined, { signal: activeRequest.signal })
    if (!response.ok) throw new Error('Server map request failed')
    const data = ServerMapSnapshotSchema.parse(await response.json())
    if (data.serverID !== params.serverID) throw new Error('Unexpected server map context')
    return { endpoint: request, data }
  })
  const data = () => {
    if (snapshot.error) return undefined
    const value = snapshot()
    return value?.endpoint === endpoint() ? value.data : undefined
  }
  // Snapshot refreshes must preserve the viewer's camera when the map has not changed.
  const mapName = createMemo(() => data()?.map ?? null)
  const embed = createMemo(() => {
    const map = mapName()
    if (!map) return undefined
    const query = new URLSearchParams({ view: '3d', theme: resolvedTheme(), labels: '1' })
    return {
      map,
      src: `https://map-forge.linv.dev/api/embed/${encodeURIComponent(map)}?${query}`,
      revision: revision(),
    }
  })
  const reload = async () => {
    const previousMap = mapName()
    try {
      const refreshed = await refetch()
      if (refreshed?.endpoint === endpoint() && refreshed.data.map === previousMap) setRevision((value) => value + 1)
    } catch {
      // The resource renders request errors and its retry action.
    }
  }

  onMount(() => {
    const refresh = setInterval(() => {
      if (endpoint() && !snapshot.loading && document.visibilityState !== 'hidden') void refetch()
    }, 15_000)
    onCleanup(() => clearInterval(refresh))
  })

  return (
    <AdminPanel
      title={t('server_map.title', 'Server map')}
      description={t('server_map.description', 'Explore the map reported by this game server in 3D.')}
      icon="map"
      type="none"
      actions={
        <>
          <Button size="sm" loading={snapshot.loading} disabled={!endpoint()} onClick={() => void reload()}>
            <Icon name="refresh-cw" size={15} />
            {t('server_map.reload', 'Reload map')}
          </Button>
          <Show when={embed()}>
            {(viewer) => (
              <ButtonLink size="sm" href={viewer().src} target="_blank" rel="noopener noreferrer">
                <Icon name="external-link" size={15} />
                {t('map.open_external', 'Open in Map Forge')}
              </ButtonLink>
            )}
          </Show>
        </>
      }
    >
      <AsyncState
        loading={snapshot.loading && !data()}
        error={snapshot.error}
        empty={!endpoint()}
        loadingLabel={t('server_map.loading', 'Loading server map…')}
        errorLabel={t('server_map.load_error', 'Unable to load this server’s map. Try again.')}
        emptyLabel={t('server_map.select_server', 'Select a game server to view its map.')}
        onRetry={() => void refetch()}
      >
        <Show when={data()}>
          <Show
            when={embed()}
            keyed
            fallback={
              <AsyncState
                empty
                emptyLabel={t('server_map.no_map', 'No valid map has been reported by this server yet.')}
              />
            }
          >
            {(viewer) => (
              <iframe
                class="server-map-embed"
                src={viewer.src}
                title={t('map.viewer_title', 'Interactive map: {1}', viewer.map)}
                width="100%"
                height="720"
                allow="fullscreen"
                allowfullscreen
              />
            )}
          </Show>
        </Show>
      </AsyncState>
    </AdminPanel>
  )
}
