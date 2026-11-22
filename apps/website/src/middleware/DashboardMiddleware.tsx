import { createEffect } from 'solid-js'
import { useLocation, useNavigate } from '@solidjs/router'
import { isLogged } from '../utils/event'
import { authStatus } from '../utils/authClient.js'
import { readStoredObject } from '../utils/utils.js'

const urlReplaceStrings = [
  {
    key: ':discordID',
    localName: 'discordID',
    redirect: '/login',
  },
  {
    key: ':userID',
    localName: 'discordUser',
    redirect: '/login',
  },
  {
    key: ':serverID',
    localName: 'server',
    redirect: '/dashboard/guilds/:guildID/config/servers',
  },
  {
    key: ':guildID',
    localName: 'guilds',
    redirect: '/dashboard/guilds',
  },
]

const validID = (value: unknown): value is string => typeof value === 'string' && /^[\w-]{1,255}$/.test(value)
const decodedID = (value?: string) => {
  try {
    const decoded = value ? decodeURIComponent(value) : undefined
    return validID(decoded) ? decoded : undefined
  } catch {
    return undefined
  }
}
function storedID(key: string) {
  try {
    const value = key === 'discordID' ? localStorage.getItem(key) : readStoredObject(key).id
    return validID(value) ? value : undefined
  } catch {
    return undefined
  }
}

const DashboardMiddleware = () => {
  const location = useLocation()
  const navigate = useNavigate()

  createEffect(() => {
    const pathname = location.pathname
    if (!isLogged() && authStatus() === 'signed_out') {
      if (!pathname.startsWith('/login')) navigate('/login?redirect=' + encodeURIComponent(pathname))
      return
    }
    if (pathname.includes('//')) return navigate('/dashboard/guilds')

    let redirectUrl = pathname
    for (const item of urlReplaceStrings) {
      if (!redirectUrl.includes(item.key)) continue
      const id = storedID(item.localName)
      if (!id) {
        const guildID = storedID('guilds')
        const routeGuild = /^\/dashboard\/guilds\/([^/]+)(?:\/|$)/.exec(pathname)?.[1]
        const target = routeGuild === ':guildID' ? guildID : decodedID(routeGuild)
        return navigate(
          item.key === ':serverID' && target && guildID === target
            ? `/dashboard/guilds/${encodeURIComponent(target)}/config/servers`
            : item.redirect.includes(':guildID')
              ? '/dashboard/guilds'
              : item.redirect,
        )
      }
      redirectUrl = redirectUrl.replaceAll(item.key, encodeURIComponent(id))
    }

    const communityRoute = /^\/dashboard\/guilds\/([^/]+)(?:\/|$)/.exec(redirectUrl)
    if (communityRoute) {
      const guildID = decodedID(communityRoute[1])
      if (!guildID || storedID('guilds') !== guildID) return navigate('/dashboard/guilds')
      const serverRoute = /^\/dashboard\/guilds\/[^/]+\/config\/servers\/([^/]+)(?:\/|$)/.exec(redirectUrl)
      if (serverRoute) {
        const serverID = decodedID(serverRoute[1])
        const serverGuild = readStoredObject('server').guild
        if (!serverID || storedID('server') !== serverID || (serverGuild !== undefined && serverGuild !== guildID))
          return navigate(`/dashboard/guilds/${encodeURIComponent(guildID)}/config/servers`)
      }
    }

    if (redirectUrl !== pathname) navigate(redirectUrl)
  })

  return null
}

export default DashboardMiddleware
