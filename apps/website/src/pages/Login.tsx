import { Component, createEffect } from 'solid-js'
import { isLogged, normalizeDiscordUserPayload, setDiscordUser, setIsLogged } from '../utils/event'
import { useLocation, useNavigate } from '@solidjs/router'
import { useI18n } from '../i18n'
import { getAPIUrl } from '../utils/api'
import { parseSessionExpiration } from '../utils/sessionExpiration.js'
import { ButtonLink, Icon, PageState } from '../components/ui/index.js'

const Login: Component = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useI18n()
  const loginUrl = () => {
    const url = new URL(`${getAPIUrl()}/users/login`)
    const redirect = new URLSearchParams(location.search).get('redirect')
    if (redirect) url.searchParams.set('redirect', redirect)
    return url.toString()
  }

  console.log('Login page')
  createEffect(async () => {
    console.log('Login effect')
    const urlParams = new URLSearchParams(location.search)

    const discordID = urlParams.get('discordID')
    const expirationDate = urlParams.get('expirationDate')
    const accessToken = urlParams.get('accessToken')

    if (discordID && expirationDate && accessToken) {
      const expiresAt = parseSessionExpiration(expirationDate)
      if (!expiresAt || expiresAt.getTime() <= Date.now()) {
        setIsLogged(false)
        return navigate('/')
      }
      // Store the necessary information in localStorage
      localStorage.setItem('discordID', discordID)
      localStorage.setItem('expirationDate', expiresAt.toISOString())
      localStorage.setItem('accessToken', accessToken)

      try {
        // Fetch user data with the accessToken
        const res = await fetch(`${getAPIUrl()}/users/${discordID}`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        })

        if (!res.ok) {
          setIsLogged(false)
          return navigate('/')
        }

        const data = await res.json()
        const normalizedUser = normalizeDiscordUserPayload(data)
        localStorage.setItem('discordUser', JSON.stringify(normalizedUser))
        setDiscordUser(normalizedUser)
        setIsLogged(true)

        const redirect = urlParams.get('redirect')
        navigate(redirect || '/dashboard/guilds')
      } catch (error) {
        setIsLogged(false)
      }
    } else {
      // If not logged in, clear localStorage and redirect to login
      if (!isLogged()) {
        localStorage.clear()
        const redirect = urlParams.get('redirect')
        window.location.href = `${getAPIUrl()}/users/login${redirect ? `?redirect=${redirect}` : ''}`
      } else {
        // If already logged in, redirect to the dashboard
        const redirect = urlParams.get('redirect')
        navigate(redirect || '/dashboard/guilds')
      }
    }
  })

  return (
    <PageState
      icon="user-round"
      title={t('header.login', 'Login with Discord')}
      description={t('ui.redirecting', 'Redirecting...')}
      status
    >
      <ButtonLink variant="primary" href={loginUrl()}>
        {t('main.click_if_not_redirected', 'Click here if you are not redirected.')}
        <Icon name="arrow-right" size={16} />
      </ButtonLink>
    </PageState>
  )
}

export default Login
