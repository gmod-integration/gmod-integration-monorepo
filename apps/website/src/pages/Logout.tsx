import { Component, onMount } from 'solid-js'
import { setDiscordUser, setIsLogged } from '../utils/event'
import { useNavigate } from '@solidjs/router'
import { useI18n } from '../i18n'
import { fetchAPI } from '../utils/api'

const Logout: Component = () => {
  const navigate = useNavigate()
  const { t } = useI18n()

  onMount(async () => {
    await fetchAPI(`/users/:discordID/logout`, 'POST')
    localStorage.clear()
    setIsLogged(false)
    setDiscordUser({
      id: '',
      username: '',
      globalName: '',
      discriminator: '',
      avatarURL: '',
      displayAvatarURL: '',
    })
    navigate('/')
  })

  return (
    <>
      <a class="link-hover" href="/">
        {t('main.click_if_not_redirected', 'Click here if you are not redirected.')}
      </a>
    </>
  )
}

export default Logout
