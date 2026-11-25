import { Icon } from '../ui/index.js'
import { createEffect, onCleanup, Show, type Component } from 'solid-js'
import { useParams } from '@solidjs/router'
import { useI18n } from '../../i18n'
import { requestServerStatus, webSocketServerStatus, webSocketSignal } from '../../utils/websocket.js'

export const NeedWebsocket: Component = () => {
  const { t } = useI18n()
  const params = useParams<{ serverID?: string }>()
  const confirmed = () => {
    const status = webSocketServerStatus()
    return Boolean(
      params.serverID &&
      status.serverID === params.serverID &&
      status.isWebSocketConnected === true &&
      webSocketSignal()?.readyState === WebSocket.OPEN,
    )
  }
  createEffect(() => {
    const serverID = params.serverID
    if (!serverID || !webSocketSignal()) return
    requestServerStatus(serverID)
    const timer = setInterval(() => requestServerStatus(serverID), 2_000)
    onCleanup(() => clearInterval(timer))
  })
  return (
    <Show when={!confirmed()}>
      <div class="settings-notice" role="note">
        <Icon name="info" size={18} />
        <div class="min-w-0 space-y-2">
          <p class="font-medium text-base-content">{t('tools.needWS_required', 'GWSockets is required')}</p>
          <p>
            {t('tools.needWS_1', 'Install the') + ' '}
            <a class="link" href="https://docs.gmod-integration.com/getting-started/installation#dll">
              GWSockets
            </a>{' '}
            {t(
              'tools.needWS_2',
              "module in garrysmod/lua/bin on your dedicated Garry's Mod server, choosing the build for its operating system and architecture, then restart the server. WebSocket is mandatory for the entire addon; without it, the addon is unusable.",
            )}
          </p>
        </div>
      </div>
    </Show>
  )
}
