import {
  createContext,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  Show,
  useContext,
  untrack,
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
import {
  DashboardAccessDenialReasonSchema,
  type DashboardAccessDenialReason,
} from '@gmod/schema/user/DashboardAccessSchema.js'
import { getAPIUrl } from '../utils/api.js'
import { AUTH_CHANGE_EVENT, authenticatedFetch, authSession } from '../utils/authClient.js'
import {
  ACCESS_REFRESH_EVENT,
  DASHBOARD_ACCESS_DENIED_EVENT,
  type DashboardAccessDeniedEvent,
} from '../utils/accessEvents.js'
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
  permissionDenied: Accessor<boolean>
  denialReason: Accessor<DashboardAccessDenialReason | undefined>
  ready: Accessor<boolean>
  refresh: () => void
}
const AccessContext = createContext<AccessState>()
const missing: AccessState = {
  snapshot: () => undefined,
  loading: () => false,
  error: () => true,
  permissionDenied: () => false,
  denialReason: () => undefined,
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
  const [denialReason, setDenialReason] = createSignal<DashboardAccessDenialReason>()
  let generation = 0
  let active = true
  const scope = createMemo(
    () => {
      const match = location.pathname.match(/^\/dashboard\/guilds\/([^/]+)(?:\/config\/servers\/([^/]+))?/)
      try {
        return match
          ? { guildID: decodeURIComponent(match[1]), serverID: match[2] ? decodeURIComponent(match[2]) : undefined }
          : undefined
      } catch {
        return undefined
      }
    },
    undefined,
    { equals: (previous, next) => previous?.guildID === next?.guildID && previous?.serverID === next?.serverID },
  )
  let pending: { target: ReturnType<typeof scope>; controller: AbortController; revalidate: boolean } | undefined
  async function refresh(invalidate = true) {
    if (props.snapshot) return
    const target = scope()
    if (pending && pending.target === target) {
      // A change may have happened after the pending read began. Recheck it once afterwards.
      if (invalidate) pending.revalidate = true
      return
    }
    pending?.controller.abort()
    pending = undefined
    const current = ++generation
    if (!target) {
      setSnapshot(undefined)
      setLoading(false)
      setError(false)
      setPermissionDenied(false)
      setDenialReason(undefined)
      return
    }
    setLoading(true)
    setError(false)
    const operation = {
      target,
      controller: new AbortController(),
      revalidate: false,
      sessionIDAtStart: untrack(() => authSession()?.session.id),
    }
    pending = operation
    try {
      const path = `/v6/guilds/${encodeURIComponent(target.guildID)}${target.serverID ? `/servers/${encodeURIComponent(target.serverID)}` : ''}/access`
      const response = await authenticatedFetch(getAPIUrl(false) + path, {
        cache: 'no-store',
        signal: operation.controller.signal,
      })
      if (!response.ok) {
        if (active && current === generation && response.status === 403) {
          const denied = await response.json().catch(() => undefined)
          if (!active || current !== generation) throw new Error('The dashboard scope changed')
          const code = typeof denied?.error === 'string' ? denied.error : denied?.error?.code
          if (!code || code === 'forbidden' || code === 'dashboard_access_denied') {
            setPermissionDenied(true)
            const reason = DashboardAccessDenialReasonSchema.safeParse(denied?.error?.reason)
            setDenialReason(reason.success ? reason.data : undefined)
          }
        }
        throw new Error('Access unavailable')
      }
      const value: unknown = await response.json()
      const parsed = AccessResponseSchema.parse(value)
      if (parsed.guildID !== target.guildID) throw new Error('Wrong community access')
      const extra = value as { usages?: Partial<Record<CapabilityKey, number>>; serverID?: string }
      if (target.serverID && extra.serverID !== target.serverID) throw new Error('Wrong server access')
      if (active && current === generation) {
        setSnapshot({ ...parsed, usages: extra.usages, serverID: extra.serverID })
        setPermissionDenied(false)
        setDenialReason(undefined)
      }
    } catch {
      if (active && current === generation) {
        setSnapshot(undefined)
        setError(true)
        // A failed pre-login read may finish after initial cookie restoration. Retry once with
        // that session instead of leaving its authenticated editor with the earlier failure.
        if (!operation.sessionIDAtStart && authSession()?.session.id) operation.revalidate = true
      }
    } finally {
      if (pending === operation) {
        pending = undefined
        if (active && current === generation) {
          if (operation.revalidate) void refresh(false)
          else setLoading(false)
        }
      }
    }
  }
  createEffect(() => {
    scope()
    if (!props.snapshot) {
      setSnapshot(undefined)
      setPermissionDenied(false)
      setDenialReason(undefined)
      void refresh(false)
    }
  })
  createEffect(() => {
    if (props.snapshot || !snapshot()) return
    const delay = Math.max(1_000, Date.parse(snapshot()!.validUntil) - Date.now() + 10)
    if (delay >= 60_000) return // The periodic refresh already covers longer lifetimes.
    const timeout = setTimeout(() => void refresh(false), delay)
    onCleanup(() => clearTimeout(timeout))
  })
  onMount(() => {
    if (props.snapshot) return
    let sessionID = authSession()?.session.id
    const onAuthChange = () => {
      const previous = sessionID
      sessionID = authSession()?.session.id
      if (previous === sessionID) return
      setPermissionDenied(false)
      setDenialReason(undefined)
      // Initial cookie restoration can share the pending lookup; a changed identity cannot.
      if (!previous) {
        if (sessionID && !pending && !snapshot()) void refresh(false)
        return
      }
      generation++
      pending?.controller.abort()
      pending = undefined
      setSnapshot(undefined)
      setLoading(false)
      setError(false)
      setPermissionDenied(false)
      if (sessionID) void refresh(false)
    }
    const onRefresh = (event: Event) =>
      void refresh((event as CustomEvent<{ reason?: string }>).detail?.reason !== 'background')
    const onDenied = (event: Event) => {
      const detail = (event as CustomEvent<DashboardAccessDeniedEvent>).detail
      const target = scope()
      if (
        !target ||
        detail?.guildID !== target.guildID ||
        (detail.serverID && detail.serverID !== target.serverID) ||
        detail.sessionID !== authSession()?.session.id
      )
        return
      const parsed = DashboardAccessDenialReasonSchema.safeParse(detail.reason)
      if (!parsed.success) return
      setSnapshot(undefined)
      setPermissionDenied(true)
      setDenialReason(parsed.data)
      setError(true)
    }
    const onBackgroundRefresh = () => void refresh(false)
    const onVisible = () => {
      if (document.visibilityState === 'visible') onBackgroundRefresh()
    }
    window.addEventListener(ACCESS_REFRESH_EVENT, onRefresh)
    window.addEventListener(DASHBOARD_ACCESS_DENIED_EVENT, onDenied)
    window.addEventListener(AUTH_CHANGE_EVENT, onAuthChange)
    window.addEventListener('focus', onBackgroundRefresh)
    window.addEventListener('storage', onBackgroundRefresh)
    document.addEventListener('visibilitychange', onVisible)
    const timer = setInterval(onBackgroundRefresh, 60_000)
    const expiryTimer = setInterval(() => setNow(Date.now()), 1_000)
    onCleanup(() => {
      active = false
      generation++
      pending?.controller.abort()
      pending = undefined
      clearInterval(timer)
      clearInterval(expiryTimer)
      window.removeEventListener(ACCESS_REFRESH_EVENT, onRefresh)
      window.removeEventListener(DASHBOARD_ACCESS_DENIED_EVENT, onDenied)
      window.removeEventListener(AUTH_CHANGE_EVENT, onAuthChange)
      window.removeEventListener('focus', onBackgroundRefresh)
      window.removeEventListener('storage', onBackgroundRefresh)
      document.removeEventListener('visibilitychange', onVisible)
    })
  })
  const current = () => props.snapshot ?? snapshot()
  const ready = () => !!current() && Date.parse(current()!.validUntil) > now()
  const value: AccessState = {
    snapshot: current,
    loading,
    error,
    permissionDenied,
    denialReason,
    ready,
    refresh: () => void refresh(),
  }
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
