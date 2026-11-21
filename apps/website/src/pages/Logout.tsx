import { type Component, onMount } from 'solid-js'
import { clearAccountSession } from '../utils/accountSession.js'
import { useNavigate } from '@solidjs/router'
import { useI18n } from '../i18n'
import { fetchAPI } from '../utils/api'
import { ButtonLink, PageState } from '../components/ui/index.js'

const Logout: Component = () => {
  const navigate = useNavigate()
  const { t } = useI18n()

  onMount(async () => {
    try {
      await fetchAPI(`/users/:discordID/logout`, 'POST')
    } catch {
      // A network failure must not leave local credentials signed in.
    }
    clearAccountSession()
    navigate('/')
  })

  return (
    <PageState icon="log-out" title={t('ui.logging_out', 'Signing out')} status>
      <ButtonLink href="/">{t('main.click_if_not_redirected', 'Click here if you are not redirected.')}</ButtonLink>
    </PageState>
  )
}

export default Logout
