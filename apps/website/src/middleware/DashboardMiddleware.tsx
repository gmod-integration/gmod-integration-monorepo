import { createEffect } from 'solid-js'
import { useLocation, useNavigate } from '@solidjs/router'
import { isLogged } from '../utils/event'

const urlReplaceStrings = [
  {
    key: ':discordID',
    localName: 'discordID',
    value: 'id',
    redirect: '/login',
  },
  {
    key: ':userID',
    localName: 'discordUser',
    value: 'id',
    redirect: '/login',
  },
  {
    key: ':serverID',
    localName: 'server',
    value: 'id',
    redirect: '/dashboard/guilds/:guildID/config/servers',
  },
  {
    key: ':guildID',
    value: 'id',
    localName: 'guilds',
    redirect: '/dashboard/guilds',
  },
]

const DashboardMiddleware = () => {
  const location = useLocation()
  const navigate = useNavigate()

  createEffect(() => {
    if (location.pathname.includes('//')) {
      navigate('/dashboard/guilds')
    }

    if (!isLogged()) {
      navigate('/login?redirect=' + location.pathname)
    }

    let redirectUrl = location.pathname
    urlReplaceStrings.forEach((item) => {
      const localData = localStorage.getItem(item.localName)

      if (!location.pathname.includes(item.key)) return

      if (!localData) {
        return navigate(item.redirect)
      }

      redirectUrl = redirectUrl.replace(item.key, JSON.parse(localData)[item.value])
    })

    if (redirectUrl !== location.pathname) {
      navigate(redirectUrl)
    }
  }, [location.pathname])

  return null
}

export default DashboardMiddleware
