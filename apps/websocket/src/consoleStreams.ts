import { randomUUID } from 'node:crypto'
import type { z } from 'zod'
import type { ConsoleStreamCommandSchema, ConsoleSubscriptionSchema } from '@gmod/schema/gmod/ConsoleStreamSchema.js'

type Command = z.infer<typeof ConsoleStreamCommandSchema>
type Subscription = z.infer<typeof ConsoleSubscriptionSchema>
type SubscriptionError = NonNullable<Subscription['error']>
const VIEWER_LEASE_MS = 30_000

interface ConsoleStreamOptions<Client extends object> {
  isLive(client: Client): boolean
  authorize(client: Client, serverID: string): Promise<boolean>
  serverOnline(serverID: string): Promise<boolean>
  send(
    client: Client,
    packet: Subscription | { action: 'console_live_exporter'; serverID: string; data: { data: string } },
  ): void
  renewViewer(serverID: string, viewerID: string): Promise<void>
  removeViewer(serverID: string, viewerID: string): Promise<void>
  readViewers(serverID: string): Promise<{ enabled: boolean; expiresAt: number }>
  now?: () => number
}

interface AddonOwner {
  isLive(): boolean
  authorize(): Promise<boolean>
  send(command: Command): void
}

/** Preserve wire order without retaining an unbounded stream behind a slow lookup or recipient. */
export function createConsoleChunkQueue() {
  let pending = Promise.resolve()
  let chunks = 0
  let bytes = 0
  return (text: string, operation: () => Promise<void>): Promise<void> => {
    const size = Buffer.byteLength(text)
    if (chunks >= 64 || bytes + size > 64 * 1024) return Promise.resolve()
    chunks++
    bytes += size
    const result = pending
      .then(operation)
      .catch(() => {})
      .finally(() => {
        chunks--
        bytes -= size
      })
    pending = result
    return result
  }
}

/** Runtime-only subscriptions. Redis leases join tabs and replicas; no console text is retained. */
export function createConsoleStreams<Client extends object>(options: ConsoleStreamOptions<Client>) {
  interface Viewer {
    client: Client
    serverID: string
    state: ClientState
    expiresAt: number
  }
  interface ClientState {
    viewerID: string
    generation: number
    desiredServerID?: string
    current?: Viewer
    pending: Promise<void>
    deliver: ReturnType<typeof createConsoleChunkQueue>
    closed: boolean
  }
  interface OwnerState {
    owner: AddonOwner
    enabled: boolean
    expiresAt: number
    dirty: boolean
    pending?: Promise<void>
  }
  const now = options.now ?? Date.now
  const states = new Map<Client, ClientState>()
  const viewers = new Set<Viewer>()
  const owners = new Map<string, OwnerState>()
  let stopped = false
  let maintaining: Promise<void> | undefined

  function notify(client: Client, serverID: string, enabled: boolean, error?: SubscriptionError) {
    if (!options.isLive(client)) return
    try {
      options.send(client, { action: 'console_subscription', serverID, enabled, ...(error ? { error } : {}) })
    } catch {
      // A tab can close while its subscription is being acknowledged.
    }
  }

  function enqueue(state: ClientState, operation: () => Promise<void>) {
    const result = state.pending.then(operation)
    state.pending = result.catch(() => {})
    return result
  }

  function detach(state: ClientState) {
    const viewer = state.current
    state.current = undefined
    if (viewer) viewers.delete(viewer)
    return viewer
  }

  function sendOwner(state: OwnerState, enabled: boolean, expiresAt = 0, force = false) {
    if (!state.owner.isLive()) return
    if (!force && !enabled && !state.enabled) return
    state.enabled = enabled
    state.expiresAt = expiresAt
    try {
      state.owner.send(
        enabled
          ? { method: 'wsConsoleStream', enabled: true, expiresAt }
          : { method: 'wsConsoleStream', enabled: false, expiresAt: 0 },
      )
    } catch {
      state.enabled = false
      state.expiresAt = 0
    }
  }

  function changed(serverID: string): Promise<void> {
    const state = owners.get(serverID)
    if (!state || stopped) return Promise.resolve()
    state.dirty = true
    if (state.pending) return state.pending
    state.pending = (async () => {
      while (state.dirty && !stopped && owners.get(serverID) === state && state.owner.isLive()) {
        state.dirty = false
        try {
          const lease = await options.readViewers(serverID)
          const allowed = lease.enabled && (await state.owner.authorize())
          if (stopped || owners.get(serverID) !== state || !state.owner.isLive()) return
          const expiresAt = allowed ? Math.min(lease.expiresAt, now() + VIEWER_LEASE_MS) : 0
          sendOwner(state, !!allowed && expiresAt > now(), expiresAt > now() ? expiresAt : 0)
        } catch {
          sendOwner(state, false)
        }
      }
    })().finally(() => {
      state.pending = undefined
      if (state.dirty && !stopped && owners.get(serverID) === state) void changed(serverID)
    })
    return state.pending
  }

  async function remove(viewer: Viewer) {
    try {
      await options.removeViewer(viewer.serverID, viewer.state.viewerID)
    } catch {
      // Missing removals expire after 30 seconds; a stale local subscriber is already detached.
    }
    await changed(viewer.serverID)
  }

  function clear(client: Client, error?: SubscriptionError, closed = false): Promise<void> {
    const state = states.get(client)
    if (!state) return Promise.resolve()
    state.generation++
    state.closed ||= closed
    const serverID = state.desiredServerID
    state.desiredServerID = undefined
    const previous = detach(state)
    if (serverID && !closed) notify(client, serverID, false, error)
    return enqueue(state, async () => {
      if (previous) await remove(previous)
      if (closed && states.get(client) === state) states.delete(client)
    })
  }

  return {
    async subscribe(client: Client, serverID: string): Promise<void> {
      if (stopped || !options.isLive(client)) return
      let state = states.get(client)
      if (!state) {
        state = {
          viewerID: randomUUID(),
          generation: 0,
          pending: Promise.resolve(),
          deliver: createConsoleChunkQueue(),
          closed: false,
        }
        states.set(client, state)
      }
      if (state.closed) return
      const currentState = state
      const generation = ++state.generation
      state.desiredServerID = serverID
      const valid = () =>
        !stopped && !currentState.closed && currentState.generation === generation && options.isLive(client)
      return enqueue(state, async () => {
        if (!valid()) return
        let renewed = false
        try {
          if (!(await options.authorize(client, serverID))) {
            const previous = detach(currentState)
            if (previous) await remove(previous)
            if (valid()) notify(client, serverID, false, 'forbidden')
            return
          }
          if (!valid()) return
          if (!(await options.serverOnline(serverID))) {
            const previous = detach(currentState)
            if (previous) await remove(previous)
            if (valid()) notify(client, serverID, false, 'server_offline')
            return
          }
          if (!valid()) return
          if (currentState.current && currentState.current.serverID !== serverID) {
            const previous = currentState.current
            detach(currentState)
            await remove(previous)
          }
          if (!valid()) return
          await options.renewViewer(serverID, currentState.viewerID)
          renewed = true
          if (!valid()) {
            await options.removeViewer(serverID, currentState.viewerID)
            await changed(serverID)
            return
          }
          const viewer = currentState.current ?? { client, serverID, state: currentState, expiresAt: 0 }
          viewer.expiresAt = now() + VIEWER_LEASE_MS
          currentState.current = viewer
          viewers.add(viewer)
          notify(client, serverID, true)
          await changed(serverID)
        } catch {
          const previous = detach(currentState)
          if (previous) await remove(previous)
          else if (renewed) {
            try {
              await options.removeViewer(serverID, currentState.viewerID)
            } catch {
              // The lease remains bounded even when Redis cannot remove it immediately.
            }
          }
          if (valid()) notify(client, serverID, false, 'unavailable')
        }
      })
    },

    async unsubscribe(client: Client, serverID: string): Promise<void> {
      const state = states.get(client)
      if (state?.desiredServerID === serverID) await clear(client)
      else notify(client, serverID, false)
    },

    removeClient(client: Client) {
      return clear(client, undefined, true)
    },

    invalidateClient(client: Client) {
      return clear(client, 'unavailable')
    },

    attachServer(serverID: string, owner: AddonOwner) {
      const previous = owners.get(serverID)
      if (previous) sendOwner(previous, false, 0, true)
      const state: OwnerState = { owner, enabled: false, expiresAt: 0, dirty: false }
      owners.set(serverID, state)
      sendOwner(state, false, 0, true)
      void changed(serverID)
      return () => {
        if (owners.get(serverID) !== state) return
        owners.delete(serverID)
        sendOwner(state, false, 0, true)
      }
    },

    changed,

    canForward(serverID: string) {
      const state = owners.get(serverID)
      return !!state?.enabled && state.expiresAt > now() && state.owner.isLive()
    },

    async deliver(serverID: string, text: unknown): Promise<void> {
      if (stopped || typeof text !== 'string' || text.length > 32_768) return
      await Promise.all(
        [...viewers]
          .filter((viewer) => viewer.serverID === serverID)
          .map((viewer) =>
            viewer.state.deliver(text, async () => {
              const generation = viewer.state.generation
              const current = () => viewer.state.current === viewer && viewer.state.generation === generation
              if (stopped || !current()) return
              try {
                if (viewer.expiresAt <= now() || !options.isLive(viewer.client)) {
                  await clear(viewer.client)
                  return
                }
                const allowed = await options.authorize(viewer.client, serverID)
                if (!current()) return
                if (viewer.expiresAt <= now()) {
                  await clear(viewer.client)
                  return
                }
                if (!allowed) {
                  await clear(viewer.client, 'forbidden')
                  return
                }
                if (stopped || !options.isLive(viewer.client)) return
                options.send(viewer.client, { action: 'console_live_exporter', serverID, data: { data: text } })
              } catch {
                if (current()) await clear(viewer.client, 'unavailable')
              }
            }),
          ),
      )
    },

    maintain(): Promise<void> {
      if (stopped) return Promise.resolve()
      if (maintaining) return maintaining
      maintaining = (async () => {
        await Promise.all(
          [...viewers].map(async (viewer) => {
            const generation = viewer.state.generation
            const current = () => viewer.state.current === viewer && viewer.state.generation === generation
            try {
              if (viewer.expiresAt <= now() || !options.isLive(viewer.client)) await clear(viewer.client)
              else {
                const allowed = await options.authorize(viewer.client, viewer.serverID)
                if (current() && !allowed) await clear(viewer.client, 'forbidden')
              }
            } catch {
              if (current()) await clear(viewer.client, 'unavailable')
            }
          }),
        )
        await Promise.all([...owners.keys()].map(changed))
      })().finally(() => {
        maintaining = undefined
      })
      return maintaining
    },

    async shutdown(): Promise<void> {
      stopped = true
      for (const state of owners.values()) sendOwner(state, false, 0, true)
      owners.clear()
      await Promise.all([...states.keys()].map((client) => clear(client, undefined, true)))
    },
  }
}
