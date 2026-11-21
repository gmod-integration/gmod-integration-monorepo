import { Component, onMount } from 'solid-js'
import { normalizeDiscordUserPayload, setDiscordUser, setIsLogged } from '../utils/event'
import { useNavigate } from '@solidjs/router'
import { useI18n } from '../i18n'
import { fetchAPI } from '../utils/api'
import { ButtonLink, PageState } from '../components/ui/index.js'

const Logout: Component = () => {
  const navigate = useNavigate()
  const { t } = useI18n()

  onMount(async () => {
    await fetchAPI(`/users/:discordID/logout`, 'POST')
    localStorage.clear()
    setIsLogged(false)
    setDiscordUser(normalizeDiscordUserPayload({}))
    navigate('/')
  })

  return (
    <PageState icon="log-out" title={t('ui.logging_out', 'Signing out')} status>
      <ButtonLink href="/">{t('main.click_if_not_redirected', 'Click here if you are not redirected.')}</ButtonLink>
    </PageState>
  )
}

export default Logout
