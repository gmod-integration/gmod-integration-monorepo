import { Component, createEffect } from 'solid-js'
import { isLogged, setDiscordUser, setIsLogged } from '../utils/event'
import { useLocation, useNavigate } from '@solidjs/router'
import { useI18n } from '../i18n'
import { getAPIUrl } from '../utils/api'

const Login: Component = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useI18n()

  console.log('Login page')
  createEffect(async () => {
    console.log('Login effect')
    const urlParams = new URLSearchParams(location.search)

    const discordID = urlParams.get('discordID')
    const expirationDate = urlParams.get('expirationDate')
    const accessToken = urlParams.get('accessToken')

    if (discordID && expirationDate && accessToken) {
      // Store the necessary information in localStorage
      localStorage.setItem('discordID', discordID)
      localStorage.setItem('expirationDate', expirationDate)
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
        localStorage.setItem('discordUser', JSON.stringify(data))
        setDiscordUser(data)
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
    <>
      <a class="link-hover text-center" href={`${getAPIUrl()}/users/login`}>
        {t('main.click_if_not_redirected', 'Click here if you are not redirected.')}
      </a>
    </>
  )
}

export default Login
