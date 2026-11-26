import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import express from 'express'
import request from 'supertest'

const state = vi.hoisted(() => ({
  steam: '76561198000000001' as string | null,
  blocked: false,
  revoked: false,
  guilds: [] as Array<{ id: string; permissions: string; owner?: boolean }>,
  purchases: [] as Array<{ steamID64: string; guild: string; revoke: boolean }>,
  servers: [] as Array<{ id: string; guild: string }>,
  players: [] as Array<{ steam_id: string; server_id: string; rank: string }>,
  cache: new Map<string, { value: string; expiresAt: number }>(),
  afterGuild: undefined as undefined | (() => void | Promise<void>),
}))
const database = vi.hoisted(() => ({
  user: vi.fn(),
  purchases: vi.fn(),
  server: vi.fn(),
  servers: vi.fn(),
  players: vi.fn(),
  settings: vi.fn(),
}))
const provider = vi.hoisted(() => ({ token: vi.fn(), refresh: vi.fn() }))
const write = vi.hoisted(() => vi.fn())

vi.mock('@gmod/core/utils/tools.js', () => ({ badArgument: vi.fn(() => false) }))
vi.mock('@gmod/infra-prisma', () => ({
  default: {
    gm_user: { findUnique: database.user },
    gm_gmodstore_purchases: { findMany: database.purchases },
    gm_server: { findUnique: database.server, findMany: database.servers },
    gm_server_stat: { findMany: database.players },
    gm_server_settings: { findMany: database.settings },
  },
}))
vi.mock('@gmod/infra-redis', () => {
  const read = (key: string) => {
    const entry = state.cache.get(key)
    if (entry && entry.expiresAt > Date.now()) return entry.value
    state.cache.delete(key)
    return null
  }
  return {
    default: {
      get: vi.fn(async (key: string) => read(key)),
      mget: vi.fn(async (...keys: string[]) => keys.map(read)),
      set: vi.fn(async (key: string, value: string, mode?: string, duration?: number, condition?: string) => {
        if (condition === 'NX' && read(key) !== null) return null
        state.cache.set(key, {
          value,
          expiresAt: duration === undefined ? Infinity : Date.now() + duration * (mode === 'EX' ? 1_000 : 1),
        })
        return 'OK'
      }),
      del: vi.fn(async (key: string) => Number(state.cache.delete(key))),
      eval: vi.fn(async (_script: string, count: number, ...values: string[]) => {
        if (count === 2) {
          const [guildKey, epochKey, revision] = values
          state.cache.set(guildKey, { value: revision, expiresAt: Infinity })
          state.cache.set(epochKey, { value: revision, expiresAt: Infinity })
          return 1
        }
        const [key, owner] = values
        if (read(key) !== owner) return 0
        state.cache.delete(key)
        return 1
      }),
      publish: vi.fn(async () => 0),
    },
  }
})
vi.mock('@gmod/domain-user/privacy.js', () => ({ isErasureBlocked: vi.fn(async () => state.blocked) }))
vi.mock('@gmod/domain-user/User.js', () => ({ getUserFromDiscordID: vi.fn() }))
vi.mock('@gmod/domain-auth/discordOAuth.js', () => ({
  getValidDiscordToken: provider.token,
  refreshDiscordCredentials: provider.refresh,
}))
vi.mock('@gmod/domain-auth/authSessions.js', () => ({
  AuthSessionError: class extends Error {
    constructor(
      readonly status: number,
      readonly code: string,
      message: string,
    ) {
      super(message)
    }
  },
  resolveApplicationSession: vi.fn(),
  resolveRequestSession: vi.fn(),
  readSessionCredential: vi.fn(),
  assertSessionRequest: vi.fn(),
}))
vi.mock('@gmod/domain-server/Server.js', () => ({
  getServerFromID: vi.fn(async (id: string) => {
    const server = state.servers.find((row) => row.id === id)
    return server ? { ...server, getGuildID: () => server.guild } : null
  }),
}))
vi.mock('@gmod/domain-guild/Guild.js', () => ({
  Guild: class {
    id: string
    constructor(value: { id: string }) {
      this.id = value.id
    }
  },
}))
vi.mock('@gmod/infra-bullmq/discordQueueAdapters.js', () => ({ enqueueDiscordGuildSnapshot: vi.fn() }))

const { PanelUser } = await import('@gmod/domain-user/PanelUser.js')
const { invalidateDiscordGuildPermissions } = await import('@gmod/domain-user/guildPermissions.js')
const { userAdminGuildScopeValidator, userServerValidator } =
  await import('../../../src/middleware/v3/userValidator.js')

let panel: InstanceType<typeof PanelUser>
const app = express()
app.put(
  '/guilds/:guildID/servers/:serverID/configuration',
  (req, _res, next) => {
    req.panelUser = panel
    next()
  },
  userAdminGuildScopeValidator,
  async (_req, _res, next) => {
    try {
      await state.afterGuild?.()
      next()
    } catch (error) {
      next(error)
    }
  },
  userServerValidator,
  (_req, res) => {
    write()
    res.json({ saved: true })
  },
)
app.use(
  (
    error: Error & { status?: number; code?: string },
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    res.status(error.status ?? 503).json({ error: error.code ?? 'provider_unavailable' })
  },
)
const save = (serverID = 's1') => request(app).put(`/guilds/g1/servers/${serverID}/configuration`)

beforeEach(() => {
  vi.clearAllMocks()
  state.steam = '76561198000000001'
  state.blocked = false
  state.revoked = false
  state.afterGuild = undefined
  state.cache.clear()
  state.guilds = [{ id: 'g1', permissions: '8' }]
  state.purchases = []
  state.servers = [
    { id: 's1', guild: 'g1' },
    { id: 's2', guild: 'g1' },
    { id: 's3', guild: 'g2' },
  ]
  state.players = [
    { steam_id: state.steam, server_id: 's1', rank: 'superadmin' },
    { steam_id: state.steam, server_id: 's2', rank: 'user' },
  ]
  database.user.mockImplementation(async () => ({ steam: state.steam }))
  database.purchases.mockImplementation(async ({ where }) =>
    state.purchases.filter((row) => row.steamID64 === where.steamID64 && !row.revoke && row.guild !== ''),
  )
  database.server.mockImplementation(async ({ where }) => state.servers.find((row) => row.id === where.id) ?? null)
  database.servers.mockImplementation(async ({ where }) => state.servers.filter((row) => row.guild === where.guild))
  database.players.mockImplementation(async ({ where }) =>
    state.players.filter((row) => row.steam_id === where.steam_id && where.server_id.in.includes(row.server_id)),
  )
  database.settings.mockResolvedValue([])
  provider.token.mockImplementation(async () => {
    if (state.revoked) throw Object.assign(new Error('Grant revoked'), { code: 'grant_rejected' })
    return 'provider-token'
  })
  provider.refresh.mockResolvedValue({ access_token: 'provider-token' })
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(state.guilds), { status: 200 })),
  )
  panel = new PanelUser({
    discordID: 'd1',
    user: {},
    panelToken: { token: 'session', creationDate: new Date(), expirationDate: new Date(Date.now() + 60_000) },
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('request-scoped Discord facts with real guild and server authorization', () => {
  it('uses one provider read across both guards but starts a fresh read for the next HTTP mutation', async () => {
    expect((await save()).status).toBe(200)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(provider.token).toHaveBeenCalledTimes(2)
    expect(database.players).toHaveBeenCalledTimes(2)
    expect((await save()).status).toBe(200)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(write).toHaveBeenCalledTimes(2)
  })

  it('retains exact-server rank checks after the community was authorized by another server', async () => {
    const result = await save('s2')
    expect(result.status).toBe(403)
    expect(result.body.reason).toBe('game_admin_required')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(write).not.toHaveBeenCalled()
  })

  it('reads current game ranks again between the two guards', async () => {
    state.afterGuild = () => {
      state.players[0].rank = 'user'
    }
    const result = await save()
    expect(result.status).toBe(403)
    expect(result.body.reason).toBe('game_admin_required')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(write).not.toHaveBeenCalled()
  })

  it('does not retain a purchase exception after it was revoked between the guards', async () => {
    state.guilds = [{ id: 'g1', permissions: '0' }]
    state.purchases = [{ steamID64: state.steam!, guild: 'g1', revoke: false }]
    state.afterGuild = () => {
      state.purchases[0].revoke = true
    }
    const result = await save()
    expect(result.status).toBe(403)
    expect(result.body.reason).toBe('discord_admin_required')
    expect(database.purchases).toHaveBeenCalledTimes(2)
    expect(write).not.toHaveBeenCalled()
  })

  it('rejects a revoked Discord grant instead of sharing previously fetched rights', async () => {
    state.afterGuild = () => {
      state.revoked = true
    }
    const result = await save()
    expect(result.status).toBe(403)
    expect(result.body.error).toBe('discord_reauth_required')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(write).not.toHaveBeenCalled()
  })

  it('rejects an account blocked for erasure between the guards', async () => {
    state.afterGuild = () => {
      state.blocked = true
    }
    const result = await save()
    expect(result.status).toBe(403)
    expect(result.body.reason).toBe('scope_unavailable')
    expect(write).not.toHaveBeenCalled()
  })

  it('rechecks provider permissions after a relevant guild revision changes during the request', async () => {
    state.afterGuild = async () => {
      state.guilds = [{ id: 'g1', permissions: '0' }]
      await invalidateDiscordGuildPermissions({ guildID: 'g1' })
    }
    const result = await save()
    expect(result.status).toBe(403)
    expect(result.body.reason).toBe('discord_admin_required')
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(write).not.toHaveBeenCalled()
  })

  it('preserves request facts after an unrelated guild changes', async () => {
    state.afterGuild = () => invalidateDiscordGuildPermissions({ guildID: 'unrelated' })
    expect((await save()).status).toBe(200)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledOnce()
  })
})
