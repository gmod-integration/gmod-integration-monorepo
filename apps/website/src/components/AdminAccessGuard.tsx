import {
  createEffect,
  createResource,
  createSignal,
  on,
  onCleanup,
  onMount,
  Show,
  type ParentComponent,
} from 'solid-js'
import { useLocation } from '@solidjs/router'
import { authSession, authStatus } from '../utils/authClient.js'
import { fetchAPI } from '../utils/api.js'
import { useI18n } from '../i18n.js'
import { Button, ButtonLink, PageState } from './ui/index.js'

/** Server-verified platform access; a temporary outage keeps already-mounted editors intact. */
export const AdminAccessGuard: ParentComponent = (props) => {
  const { t } = useI18n()
  const location = useLocation()
  const [verified, setVerified] = createSignal<string>()
  const sessionKey = () => {
    const session = authSession()
    return session && session.user.rank === 'developer' && !session.session.actorDiscordID
      ? session.session.id
      : undefined
  }
  const recovering = () =>
    !!authSession() &&
    (location.pathname.endsWith('/stop-impersonate') ||
      (!!authSession()?.session.actorDiscordID && location.pathname.endsWith('/impersonate')))
  createEffect(on(sessionKey, () => setVerified(undefined)))
  const [access, { refetch }] = createResource(sessionKey, async (key) => {
    const response = await fetchAPI('/v6/admin/access', 'GET')
    if (!response.ok) throw Object.assign(new Error('Admin access unavailable'), { status: response.status })
    const result = await response.json()
    if (result.authorized !== true || result.discordID !== authSession()?.user.id)
      throw new Error('Invalid admin acknowledgement')
    return key
  })
  createEffect(() => {
    if (access.error) {
      if ([401, 403].includes(access.error.status)) setVerified(undefined)
    } else if (!access.loading && access()) setVerified(access())
  })
  onMount(() => {
    const refresh = () => {
      if (sessionKey()) void refetch()
    }
    window.addEventListener('focus', refresh)
    onCleanup(() => window.removeEventListener('focus', refresh))
  })
  const allowed = () => recovering() || (!!sessionKey() && verified() === sessionKey())
  const unavailable = () => !!access.error && ![401, 403].includes(access.error.status)
  return (
    <Show
      when={allowed()}
      fallback={
        <PageState
          icon={access.loading || authStatus() === 'checking' ? 'loader-circle' : 'shield'}
          status={access.loading || authStatus() === 'checking'}
          title={
            access.loading || authStatus() === 'checking'
              ? t('admin_v6.access_checking', 'Checking administrator access')
              : unavailable()
                ? t('admin_v6.access_unavailable', 'Administrator access could not be verified')
                : t('admin_v6.access_denied', 'Platform administrator access required')
          }
          description={t(
            'admin_v6.access_description',
            'Use your own platform administrator account to open this back office.',
          )}
        >
          <Show when={unavailable()}>
            <Button onClick={() => void refetch()}>{t('ui.retry', 'Try again')}</Button>
          </Show>
          <Show
            when={authStatus() === 'signed_out'}
            fallback={
              <ButtonLink href="/dashboard/guilds">{t('admin_v6.back_dashboard', 'Go to your dashboard')}</ButtonLink>
            }
          >
            <ButtonLink href={`/login?redirect=${encodeURIComponent(location.pathname)}`}>
              {t('header.login', 'Sign in with Discord')}
            </ButtonLink>
          </Show>
        </PageState>
      }
    >
      <Show when={unavailable() && !recovering()}>
        <div
          role="status"
          class="m-4 flex flex-wrap items-center gap-3 rounded-lg border border-warning/30 bg-base-100 p-4 text-sm"
        >
          <span>
            {t(
              'admin_v6.access_retry_preserved',
              'Administrator access could not be refreshed. Your unsaved changes are preserved.',
            )}
          </span>
          <Button size="sm" onClick={() => void refetch()}>
            {t('ui.retry', 'Try again')}
          </Button>
        </div>
      </Show>
      {props.children}
    </Show>
  )
}
