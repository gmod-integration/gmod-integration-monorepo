import { type Component, createSignal, onMount, Show } from 'solid-js'
import { clearAccountSession } from '../utils/accountSession.js'
import { signOut } from '../utils/authClient.js'
import { useNavigate } from '@solidjs/router'
import { useI18n } from '../i18n.js'
import { Button, ButtonLink, PageState } from '../components/ui/index.js'

const Logout: Component = () => {
  const navigate = useNavigate()
  const { t } = useI18n()
  const [pending, setPending] = createSignal(false)
  const [unconfirmed, setUnconfirmed] = createSignal(false)
  const logout = async () => {
    if (pending()) return
    setPending(true)
    try {
      await signOut()
      clearAccountSession()
      navigate('/', { replace: true })
    } catch {
      clearAccountSession()
      setUnconfirmed(true)
    } finally {
      setPending(false)
    }
  }
  onMount(() => void logout())
  return (
    <PageState icon="log-out" title={t('ui.logging_out', 'Signing out')} status>
      <Show when={unconfirmed()}>
        <p>
          {t(
            'auth.logout_unconfirmed',
            'Sign-out is not confirmed. Your server session may still be active. Retry to finish signing out.',
          )}
        </p>
        <Button loading={pending()} onClick={() => void logout()}>
          {t('ui.retry', 'Try again')}
        </Button>
      </Show>
      <ButtonLink href="/">{t('ui.back_home', 'Back to home')}</ButtonLink>
    </PageState>
  )
}
export default Logout
