import { type Component, createSignal, onMount, Show } from 'solid-js'
import { useLocation, useNavigate } from '@solidjs/router'
import { useI18n } from '../i18n.js'
import { getAPIUrl } from '../utils/api.js'
import { authStatus, broadcastAuthChange, refreshAuthSession, safeAuthRedirect } from '../utils/authClient.js'
import { Button, ButtonLink, Icon, PageState } from '../components/ui/index.js'

const Login: Component = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useI18n()
  const [pending, setPending] = createSignal(false)
  const [denied, setDenied] = createSignal(false)
  const destination = () => safeAuthRedirect(new URLSearchParams(location.search).get('redirect'))
  const loginUrl = () => {
    const url = new URL(`${getAPIUrl()}/users/login`)
    url.searchParams.set('redirect', destination())
    return url.toString()
  }
  const resume = async () => {
    if (pending()) return
    setPending(true)
    const value = await refreshAuthSession()
    setPending(false)
    if (value) {
      broadcastAuthChange()
      navigate(destination(), { replace: true })
    } else if (authStatus() === 'signed_out') window.location.href = loginUrl()
  }
  onMount(() => {
    const query = new URLSearchParams(location.search)
    // Remove historical bearer callbacks before any asynchronous request or navigation.
    if (query.has('accessToken') || query.has('expirationDate') || query.has('discordID')) {
      const clean = new URL(window.location.href)
      for (const key of ['accessToken', 'expirationDate', 'discordID']) clean.searchParams.delete(key)
      window.history.replaceState(window.history.state, '', clean.pathname + clean.search + clean.hash)
    }
    if (query.has('error')) {
      setDenied(true)
      return
    }
    // An unsolicited URL bearer is not proof that this browser initiated a login.
    // Only the existing browser cache may use the guarded legacy conversion.
    void resume()
  })
  return (
    <PageState
      icon="user-round"
      title={t('header.login', 'Sign in with Discord')}
      description={
        denied()
          ? t('auth.oauth_denied', 'Discord sign-in was not completed. You can try again when you are ready.')
          : authStatus() === 'temporarily_unavailable'
            ? t(
                'auth.unavailable',
                'The connection is temporarily unavailable. Your session and unsaved changes are preserved.',
              )
            : t('ui.redirecting', 'Redirecting...')
      }
      status
    >
      <Show when={authStatus() === 'temporarily_unavailable'}>
        <Button loading={pending()} onClick={() => void resume()}>
          {t('ui.retry', 'Try again')}
        </Button>
      </Show>
      <ButtonLink variant="primary" href={loginUrl()}>
        {t('header.login', 'Sign in with Discord')}
        <Icon name="arrow-right" size={16} />
      </ButtonLink>
    </PageState>
  )
}
export default Login
