import { createEffect, createSignal } from 'solid-js'
import { useLocation, useNavigate } from '@solidjs/router'
import { INVITE_URL } from '../utils/utils'

const ALLOWED_REDIRECT_PROTOCOLS = new Set(['http:', 'https:'])

function getSafeRedirectTarget(rawPathWithQuery: string): string | null {
  const queryIndex = rawPathWithQuery.indexOf('?')
  if (queryIndex === -1) {
    return null
  }

  const query = rawPathWithQuery.slice(queryIndex + 1)
  const rawLink = new URLSearchParams(query).get('link')
  if (!rawLink) {
    return null
  }

  let decoded: string
  try {
    decoded = decodeURIComponent(rawLink)
  } catch {
    return null
  }

  try {
    const parsed = new URL(decoded, window.location.origin)
    if (!ALLOWED_REDIRECT_PROTOCOLS.has(parsed.protocol)) {
      return null
    }
    return parsed.toString()
  } catch {
    return null
  }
}

const redirections = [
  {
    url: '/invite',
    redirect: INVITE_URL,
  },
  {
    url: '/workshop',
    redirect: 'https://steamcommunity.com/sharedfiles/filedetails/?id=3002852280',
  },
  {
    url: '/open',
    func: (url: string) => {
      const safeTarget = getSafeRedirectTarget(url)
      if (!safeTarget) {
        setRedirecting('/')
        window.location.href = '/'
        return
      }

      window.location.href = safeTarget
      setRedirecting(safeTarget)
    },
  },
  {
    url: '/gmodstore',
    redirect: 'https://www.gmodstore.com/market/view/gmod-integration',
  },
  {
    url: '/privacy',
    redirect: '/legal/privacy',
  },
  {
    url: '/terms',
    redirect: '/legal/terms',
  },
  {
    url: '/config',
    redirect: '/dashboard/guilds',
  },
  {
    url: '/trello',
    redirect: 'https://trello.com/b/JQeTFZgP/gmod-integration',
  },
  {
    url: '/workshop',
    redirect: 'https://steamcommunity.com/sharedfiles/filedetails/?id=3002852280',
  },
  {
    url: '/github',
    redirect: 'https://github.com/gmod-integration',
  },
  {
    url: '/discord',
    redirect: 'https://discord.gg/AexDDx5RaU',
  },
  {
    url: '/support',
    redirect: '/discord',
  },
  {
    url: '/dashboard',
    redirect: '/dashboard/guilds',
    exact: true,
  },
  {
    url: '/documentation',
    redirect: 'https://docs.gmod-integration.com/',
  },
  {
    url: '/docs',
    redirect: '/documentation',
  },
]

export const [isRedirecting, setRedirecting] = createSignal('')

const RedirectMiddleware = () => {
  const location = useLocation()
  const navigate = useNavigate()

  createEffect(() => {
    setRedirecting('')
    const currentPath = location.pathname + location.search
    const redirectRule = redirections.find((r) => currentPath.startsWith(r.url))

    if (redirectRule && redirectRule.func) {
      redirectRule.func(currentPath)
      return
    }

    if (!redirectRule) return
    if (redirectRule.exact && currentPath !== redirectRule.url) return
    if (currentPath === redirectRule.redirect) return

    const pathToRedirect = currentPath.replace(redirectRule.url, redirectRule.redirect)
    setRedirecting(pathToRedirect)
    if (redirectRule.redirect.startsWith('/')) {
      navigate(pathToRedirect)
    } else {
      window.location.href = pathToRedirect
    }
  })

  return null
}

export default RedirectMiddleware
