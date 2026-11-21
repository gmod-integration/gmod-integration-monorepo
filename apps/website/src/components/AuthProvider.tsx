import { createEffect, onCleanup, onMount, Show, type ParentComponent } from 'solid-js'
import {
  AUTH_STORAGE_KEY,
  authSession,
  authStatus,
  refreshAuthSession,
  revalidateAuthSession,
} from '../utils/authClient.js'
import { initWebSocket, stopWebSocket } from '../utils/websocket.js'
import { useI18n } from '../i18n.js'
import { Button, ButtonLink } from './ui/Button.js'
import { WEBSITE_CONFIG } from '../config.js'

/** Session recovery never unmounts editors or replaces a network failure with a login redirect. */
export const AuthProvider: ParentComponent = (props) => {
  const { t } = useI18n()
  onMount(() => {
    if (!['/login', '/logout'].includes(window.location.pathname)) void refreshAuthSession()
    const resume = () => {
      if (document.visibilityState !== 'hidden') void refreshAuthSession()
    }
    const storage = (event: StorageEvent) => {
      if (event.key === AUTH_STORAGE_KEY) void revalidateAuthSession()
    }
    window.addEventListener('focus', resume)
    window.addEventListener('online', resume)
    window.addEventListener('storage', storage)
    document.addEventListener('visibilitychange', resume)
    onCleanup(() => {
      window.removeEventListener('focus', resume)
      window.removeEventListener('online', resume)
      window.removeEventListener('storage', storage)
      document.removeEventListener('visibilitychange', resume)
      stopWebSocket()
    })
  })
  createEffect(() => {
    const session = authSession()
    if (authStatus() === 'signed_out') stopWebSocket()
    else if (session && authStatus() === 'authenticated') {
      void initWebSocket()
      const delay = Date.parse(session.session.expiresAt) - Date.now()
      const timer = setTimeout(() => void refreshAuthSession(), Math.min(2_147_483_647, Math.max(1_000, delay)))
      onCleanup(() => clearTimeout(timer))
    }
  })
  return (
    <>
      <Show when={authStatus() === 'temporarily_unavailable'}>
        <div
          role="status"
          class="m-4 flex flex-wrap items-center gap-3 rounded-lg border border-warning/30 bg-base-100 p-4 text-sm"
        >
          <span>
            {t(
              'auth.unavailable',
              'The connection is temporarily unavailable. Your session and unsaved changes are preserved.',
            )}
          </span>
          <Button size="sm" onClick={() => void refreshAuthSession()}>
            {t('ui.retry', 'Try again')}
          </Button>
        </div>
      </Show>
      <Show when={authStatus() === 'reauth_required'}>
        <div
          role="status"
          class="m-4 flex flex-wrap items-center gap-3 rounded-lg border border-warning/30 bg-base-100 p-4 text-sm"
        >
          <span>
            {t(
              'auth.reconnect_discord',
              'Reconnect Discord in a new tab to continue. Your unsaved changes are preserved.',
            )}
          </span>
          <ButtonLink
            href={`${WEBSITE_CONFIG.apiUrl}/v3/users/login?redirect=${encodeURIComponent(window.location.pathname)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('header.login', 'Login with Discord')}
          </ButtonLink>
        </div>
      </Show>
      {props.children}
    </>
  )
}
