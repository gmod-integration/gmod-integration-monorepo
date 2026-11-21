import {
  createContext,
  createEffect,
  createSignal,
  onCleanup,
  onMount,
  Show,
  useContext,
  type Accessor,
  type ParentComponent,
} from 'solid-js'
import { useLocation } from '@solidjs/router'
import {
  AccessResponseSchema,
  type AccessSnapshot,
  type CapabilityKey,
  capabilityLimit,
  hasCapability,
} from '@gmod/schema/server/AccessPolicySchema.js'
import { getAPIUrl } from '../utils/api.js'
import { ACCESS_REFRESH_EVENT } from '../utils/accessEvents.js'
import { useI18n } from '../i18n.js'
import { Button } from './ui/Button.js'

export type DashboardAccessSnapshot = AccessSnapshot & {
  serverID?: string
  usages?: Partial<Record<CapabilityKey, number>>
}
type AccessState = {
  snapshot: Accessor<DashboardAccessSnapshot | undefined>
  loading: Accessor<boolean>
  error: Accessor<boolean>
  ready: Accessor<boolean>
  refresh: () => void
}
const AccessContext = createContext<AccessState>()
const missing: AccessState = {
  snapshot: () => undefined,
  loading: () => false,
  error: () => true,
  ready: () => false,
  refresh: () => {},
}

/** Only explicit test/embedded snapshots bypass loading. Production never trusts a stored Premium flag. */
export const AccessProvider: ParentComponent<{ snapshot?: DashboardAccessSnapshot }> = (props) => {
  if (useContext(AccessContext)) return props.children
  const location = useLocation()
  const { t } = useI18n()
  const [now, setNow] = createSignal(Date.now())
  const [snapshot, setSnapshot] = createSignal<DashboardAccessSnapshot>()
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal(false)
  const [permissionDenied, setPermissionDenied] = createSignal(false)
  let generation = 0
  let active = true
  const scope = () => {
    const match = location.pathname.match(/^\/dashboard\/guilds\/([^/]+)(?:\/config\/servers\/([^/]+))?/)
    try {
      return match
        ? { guildID: decodeURIComponent(match[1]), serverID: match[2] ? decodeURIComponent(match[2]) : undefined }
        : undefined
    } catch {
      return undefined
    }
  }
  async function refresh() {
    if (props.snapshot) return
    const target = scope()
    const current = ++generation
    if (!target) {
      setSnapshot(undefined)
      setLoading(false)
      setError(false)
      return
    }
    setLoading(true)
    setError(false)
    setPermissionDenied(false)
    try {
      const path = `/v6/guilds/${encodeURIComponent(target.guildID)}${target.serverID ? `/servers/${encodeURIComponent(target.serverID)}` : ''}/access`
      const response = await fetch(getAPIUrl(false) + path, {
        headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
        cache: 'no-store',
      })
      if (!response.ok) {
        if (active && current === generation) setPermissionDenied(response.status === 403)
        throw new Error('Access unavailable')
      }
      const value: unknown = await response.json()
      const parsed = AccessResponseSchema.parse(value)
      if (parsed.guildID !== target.guildID) throw new Error('Wrong community access')
      const extra = value as { usages?: Partial<Record<CapabilityKey, number>>; serverID?: string }
      if (target.serverID && extra.serverID !== target.serverID) throw new Error('Wrong server access')
      if (active && current === generation) setSnapshot({ ...parsed, usages: extra.usages, serverID: extra.serverID })
    } catch {
      if (active && current === generation) {
        setSnapshot(undefined)
        setError(true)
      }
    } finally {
      if (active && current === generation) setLoading(false)
    }
  }
  createEffect(() => {
    scope()
    if (!props.snapshot) {
      setSnapshot(undefined)
      void refresh()
    }
  })
  createEffect(() => {
    if (props.snapshot || !snapshot()) return
    const delay = Math.max(1_000, Date.parse(snapshot()!.validUntil) - Date.now() + 10)
    if (delay >= 60_000) return // The periodic refresh already covers longer lifetimes.
    const timeout = setTimeout(() => void refresh(), delay)
    onCleanup(() => clearTimeout(timeout))
  })
  onMount(() => {
    if (props.snapshot) return
    const onRefresh = () => void refresh()
    const onVisible = () => {
      if (document.visibilityState === 'visible') onRefresh()
    }
    window.addEventListener(ACCESS_REFRESH_EVENT, onRefresh)
    window.addEventListener('focus', onRefresh)
    window.addEventListener('storage', onRefresh)
    document.addEventListener('visibilitychange', onVisible)
    const timer = setInterval(onRefresh, 60_000)
    const expiryTimer = setInterval(() => setNow(Date.now()), 1_000)
    onCleanup(() => {
      active = false
      generation++
      clearInterval(timer)
      clearInterval(expiryTimer)
      window.removeEventListener(ACCESS_REFRESH_EVENT, onRefresh)
      window.removeEventListener('focus', onRefresh)
      window.removeEventListener('storage', onRefresh)
      document.removeEventListener('visibilitychange', onVisible)
    })
  })
  const current = () => props.snapshot ?? snapshot()
  const ready = () => !!current() && Date.parse(current()!.validUntil) > now()
  const value: AccessState = { snapshot: current, loading, error, ready, refresh: () => void refresh() }
  return (
    <AccessContext.Provider value={value}>
      <Show
        when={!props.snapshot && scope() && (error() || (current() && (!ready() || current()!.state === 'unknown')))}
      >
        <div
          role="alert"
          class="m-4 flex flex-wrap items-center gap-3 rounded-lg border border-warning/30 bg-base-100 p-4 text-sm"
        >
          <span>
            {permissionDenied()
              ? t('access.permission_denied', 'You do not have permission to manage this community.')
              : t('access.unavailable', 'Access could not be verified. Your saved configuration is preserved.')}
          </span>
          <Button size="sm" onClick={() => void refresh()}>
            {t('ui.retry', 'Try again')}
          </Button>
        </div>
      </Show>
      {props.children}
    </AccessContext.Provider>
  )
}

export function useAccess() {
  return useContext(AccessContext) ?? missing
}

/** Capability checks and quota limits come from the shared policy, never page constants. */
export function useFeatureAccess(capability: CapabilityKey) {
  const access = useAccess()
  const allowed = () => access.ready() && hasCapability(access.snapshot()!, capability)
  const limit = () => (access.snapshot() ? capabilityLimit(access.snapshot()!, capability) : 0)
  const canCreate = (used = access.snapshot()?.usages?.[capability] ?? 0) =>
    allowed() && (limit() === null || used < limit()!)
  return { ...access, allowed, limit, canCreate }
}
