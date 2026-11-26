import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  purchases: vi.fn(),
  server: vi.fn(),
  servers: vi.fn(),
  players: vi.fn(),
  settings: vi.fn(),
  guilds: vi.fn(),
  erased: vi.fn(),
}))
vi.mock('@gmod/infra-prisma', () => ({
  default: {
    gm_user: { findUnique: mocks.user },
    gm_gmodstore_purchases: { findMany: mocks.purchases },
    gm_server: { findUnique: mocks.server, findMany: mocks.servers },
    gm_server_stat: { findMany: mocks.players },
    gm_server_settings: { findMany: mocks.settings },
    gm_guild: { findMany: mocks.guilds },
  },
}))
vi.mock('../src/privacy.js', () => ({ isErasureBlocked: mocks.erased }))
import { canAccessDashboardGuild, findDashboardGuilds, resolveDashboardAccess } from '../src/dashboardAccess.js'
import { DashboardAccessDenialSchema } from '@gmod/schema/user/DashboardAccessSchema.js'
import type { DiscordGuild, GuildPermissionLookupOptions } from '../src/PanelUser.js'

const steamA = '76561198000000001'
const steamB = '76561198000000002'
let steam: string | null
let purchases: Array<{ steamID64: string; guild: string; revoke: boolean }>
let servers: Array<{ id: string; guild: string }>
let players: Array<{ server_id: string; steam_id: string; rank: string }>
let settings: Array<{ serverID: string; setting: string; value: string }>
const panel = {
  discordID: 'd1',
  findGuilds: vi.fn<(options?: GuildPermissionLookupOptions) => Promise<DiscordGuild[]>>(),
}

beforeEach(() => {
  vi.resetAllMocks()
  steam = steamA
  purchases = []
  servers = [
    { id: 's1', guild: 'g1' },
    { id: 's2', guild: 'g1' },
    { id: 's3', guild: 'g2' },
  ]
  players = [
    { server_id: 's1', steam_id: steamA, rank: 'superadmin' },
    { server_id: 's2', steam_id: steamA, rank: 'user' },
    { server_id: 's3', steam_id: steamA, rank: 'user' },
  ]
  settings = []
  mocks.erased.mockResolvedValue(false)
  mocks.user.mockImplementation(async () => ({ steam }))
  mocks.purchases.mockImplementation(async ({ where }) =>
    purchases.filter((row) => row.steamID64 === where.steamID64 && row.revoke === false && row.guild !== ''),
  )
  mocks.server.mockImplementation(async ({ where }) => servers.find((row) => row.id === where.id) ?? null)
  mocks.servers.mockImplementation(async ({ where }) =>
    servers.filter((row) =>
      typeof where.guild === 'string' ? row.guild === where.guild : where.guild.in.includes(row.guild),
    ),
  )
  mocks.players.mockImplementation(async ({ where }) =>
    players.filter((row) => row.steam_id === where.steam_id && where.server_id.in.includes(row.server_id)),
  )
  mocks.settings.mockImplementation(async ({ where }) =>
    settings.filter((row) => row.setting === where.setting && where.serverID.in.includes(row.serverID)),
  )
  mocks.guilds.mockImplementation(async ({ where }) =>
    where.guild.in.map((guild: string) => ({ guild, name: `Community ${guild}` })),
  )
  panel.findGuilds.mockResolvedValue([
    { id: 'g1', permissions: '8' },
    { id: 'g2', permissions: '8' },
  ])
})

describe('durable dashboard authorization', () => {
  it('rechecks exact-server ranks when Discord permission facts are shared within a request', async () => {
    const permissionScope = {}
    await expect(resolveDashboardAccess(panel, 'g1', { fresh: true, permissionScope })).resolves.toEqual({
      allowed: true,
    })
    await expect(
      resolveDashboardAccess(panel, 'g1', { serverID: 's2', fresh: true, permissionScope }),
    ).resolves.toEqual({ allowed: false, reason: 'game_admin_required' })
    players[0].rank = 'user'
    await expect(
      resolveDashboardAccess(panel, 'g1', { serverID: 's1', fresh: true, permissionScope }),
    ).resolves.toEqual({ allowed: false, reason: 'game_admin_required' })
    expect(panel.findGuilds).toHaveBeenCalledTimes(3)
    for (const [options] of panel.findGuilds.mock.calls) {
      expect(options).toEqual({ fresh: true, requestScope: permissionScope })
    }
  })

  it('requires both Discord administration and a stored game rank on the exact target server', async () => {
    await expect(canAccessDashboardGuild(panel, 'g1', { serverID: 's1', fresh: true })).resolves.toBe(true)
    expect(panel.findGuilds).toHaveBeenCalledWith({ fresh: true })
    await expect(canAccessDashboardGuild(panel, 'g1', { serverID: 's2' })).resolves.toBe(false)
    panel.findGuilds.mockResolvedValue([{ id: 'g1', permissions: '0' }])
    await expect(canAccessDashboardGuild(panel, 'g1', { serverID: 's1' })).resolves.toBe(false)
  })

  it('authorizes a community scope when at least one of its servers grants the game rank', async () => {
    await expect(canAccessDashboardGuild(panel, 'g1')).resolves.toBe(true)
    await expect(canAccessDashboardGuild(panel, 'g2')).resolves.toBe(false)
    await expect(canAccessDashboardGuild(panel, 'empty')).resolves.toBe(false)
    expect(mocks.servers).toHaveBeenCalledWith({ where: { guild: 'g1' }, select: { id: true, guild: true } })
  })

  it('permits a confirmed Discord owner without any Steam link or game rank', async () => {
    steam = null
    panel.findGuilds.mockResolvedValue([{ id: 'g1', owner: true, permissions: '0' }])
    await expect(canAccessDashboardGuild(panel, 'g1', { serverID: 's2' })).resolves.toBe(true)
    expect(mocks.players).not.toHaveBeenCalled()
    expect(mocks.purchases).not.toHaveBeenCalled()
  })

  it('permits only an active purchase assigned to this exact community and current Steam account', async () => {
    purchases = [{ steamID64: steamA, guild: 'g1', revoke: false }]
    panel.findGuilds.mockRejectedValue(new Error('Discord unavailable'))
    await expect(canAccessDashboardGuild(panel, 'g1', { serverID: 's2' })).resolves.toBe(true)
    expect(panel.findGuilds).not.toHaveBeenCalled()
    expect(mocks.players).not.toHaveBeenCalled()
    steam = steamB
    await expect(canAccessDashboardGuild(panel, 'g1')).rejects.toThrow('Discord unavailable')
  })

  it.each([
    { steamID64: steamA, guild: 'g1', revoke: true },
    { steamID64: steamA, guild: 'g2', revoke: false },
    { steamID64: steamB, guild: 'g1', revoke: false },
    { steamID64: steamA, guild: '', revoke: false },
  ])('does not grant the buyer exception from another or inactive purchase: %j', async (purchase) => {
    purchases = [purchase]
    panel.findGuilds.mockResolvedValue([])
    await expect(canAccessDashboardGuild(panel, 'g1')).resolves.toBe(false)
  })

  it('never interprets the GmodStore user ID as a Discord or Steam buyer identity', async () => {
    purchases = [{ steamID64: steamB, guild: 'g1', revoke: false, userID: 'd1' } as (typeof purchases)[number]]
    panel.findGuilds.mockResolvedValue([])
    await expect(canAccessDashboardGuild(panel, 'g1')).resolves.toBe(false)
    expect(mocks.purchases).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ steamID64: steamA }) }),
    )
  })

  it('checks server ownership before applying either owner or buyer exceptions', async () => {
    purchases = [{ steamID64: steamA, guild: 'g1', revoke: false }]
    panel.findGuilds.mockResolvedValue([{ id: 'g1', owner: true }])
    await expect(canAccessDashboardGuild(panel, 'g1', { serverID: 's3' })).resolves.toBe(false)
    await expect(canAccessDashboardGuild(panel, 'g1', { serverID: 'missing' })).resolves.toBe(false)
  })

  it('uses the default superadmin rank only when there is no stored configuration row', async () => {
    await expect(canAccessDashboardGuild(panel, 'g1', { serverID: 's1' })).resolves.toBe(true)
    settings = [{ serverID: 's1', setting: 'ig_adminRank', value: '{"owner":true}' }]
    await expect(canAccessDashboardGuild(panel, 'g1', { serverID: 's1' })).resolves.toBe(false)
    players[0].rank = 'owner'
    await expect(canAccessDashboardGuild(panel, 'g1', { serverID: 's1' })).resolves.toBe(true)
  })

  it.each([
    '{',
    '[]',
    'null',
    'false',
    '"superadmin"',
    '{}',
    '{"superadmin":false}',
    '{"superadmin":"true"}',
    '{"superadmin":1}',
  ])('does not replace invalid or non-granting stored configuration with permissive defaults: %s', async (value) => {
    settings = [{ serverID: 's1', setting: 'ig_adminRank', value }]
    await expect(canAccessDashboardGuild(panel, 'g1', { serverID: 's1' })).resolves.toBe(false)
  })

  it('does not accept inherited object properties as configured administrator ranks', async () => {
    players[0].rank = 'toString'
    await expect(canAccessDashboardGuild(panel, 'g1', { serverID: 's1' })).resolves.toBe(false)
  })

  it('requires a current valid Steam link and a player record for ordinary Discord administrators', async () => {
    for (const value of [null, '', 'invalid', steamB]) {
      steam = value
      await expect(canAccessDashboardGuild(panel, 'g1', { serverID: 's1' })).resolves.toBe(false)
    }
    steam = steamA
    players = []
    await expect(canAccessDashboardGuild(panel, 'g1', { serverID: 's1' })).resolves.toBe(false)
  })

  it('rereads the linked Steam account after a provider lookup rather than using a superseded link', async () => {
    panel.findGuilds.mockImplementationOnce(async () => {
      steam = steamB
      return [{ id: 'g1', permissions: '8' }]
    })
    await expect(canAccessDashboardGuild(panel, 'g1', { serverID: 's1' })).resolves.toBe(false)
    expect(mocks.players).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ steam_id: steamB }) }),
    )
  })

  it.each([true, false])(
    'revalidates a server moved during the Discord lookup before granting owner=%s access',
    async (owner) => {
      panel.findGuilds.mockImplementationOnce(async () => {
        servers[0].guild = 'g2'
        return [{ id: 'g1', owner, permissions: '8' }]
      })
      await expect(canAccessDashboardGuild(panel, 'g1', { serverID: 's1', fresh: true })).resolves.toBe(false)
      expect(mocks.server).toHaveBeenCalledTimes(2)
    },
  )

  it('ignores a stale Steam identity on the panel profile and resolves the durable current link', async () => {
    steam = steamB
    const stalePanel = { ...panel, user: { steamID64: steamA, steam: steamA } }
    await expect(canAccessDashboardGuild(stalePanel, 'g1', { serverID: 's1' })).resolves.toBe(false)
    expect(mocks.players).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ steam_id: steamB }) }),
    )
  })

  it.each([8.5, Infinity, NaN, -1, 9_007_199_254_741_000, '-1', '8.0', ' 8', '0x8', ''])(
    'rejects an invalid or imprecise Discord permissions bitfield: %s',
    async (permissions) => {
      panel.findGuilds.mockResolvedValue([{ id: 'g1', permissions }])
      await expect(canAccessDashboardGuild(panel, 'g1', { serverID: 's1' })).resolves.toBe(false)
    },
  )

  it.each([8, '8', '9007199254741000'])(
    'accepts a precise administrator permissions bitfield: %s',
    async (permissions) => {
      panel.findGuilds.mockResolvedValue([{ id: 'g1', permissions }])
      await expect(canAccessDashboardGuild(panel, 'g1', { serverID: 's1' })).resolves.toBe(true)
    },
  )

  it('observes demotions, configuration changes, link changes and purchase revocation on the next decision', async () => {
    await expect(canAccessDashboardGuild(panel, 'g1', { serverID: 's1' })).resolves.toBe(true)
    players[0].rank = 'user'
    await expect(canAccessDashboardGuild(panel, 'g1', { serverID: 's1' })).resolves.toBe(false)
    purchases = [{ steamID64: steamA, guild: 'g1', revoke: false }]
    await expect(canAccessDashboardGuild(panel, 'g1', { serverID: 's1' })).resolves.toBe(true)
    purchases[0].revoke = true
    await expect(canAccessDashboardGuild(panel, 'g1', { serverID: 's1' })).resolves.toBe(false)
    expect(mocks.players).toHaveBeenCalledTimes(3)
  })

  it('keeps the stored rank usable while the game server is offline and never checks server presence', async () => {
    await expect(canAccessDashboardGuild(panel, 'g1', { serverID: 's1' })).resolves.toBe(true)
    expect(mocks.players).toHaveBeenCalledWith({
      where: { steam_id: steamA, server_id: { in: ['s1'] } },
      select: { server_id: true, rank: true },
    })
  })

  it('does not grant a bypass for developer metadata or an impersonating actor on the panel object', async () => {
    players = []
    const delegated = { ...panel, user: { rank: 'developer' }, authSession: { actorDiscordID: 'developer' } }
    await expect(canAccessDashboardGuild(delegated, 'g1')).resolves.toBe(false)
  })

  it('propagates Discord and durable storage errors instead of treating unavailable rights as an ordinary denial', async () => {
    panel.findGuilds.mockRejectedValueOnce(new Error('Discord unavailable'))
    await expect(canAccessDashboardGuild(panel, 'g1')).rejects.toThrow('Discord unavailable')
    mocks.settings.mockRejectedValueOnce(new Error('database unavailable'))
    await expect(canAccessDashboardGuild(panel, 'g1', { serverID: 's1' })).rejects.toThrow('database unavailable')
  })

  it('denies erased accounts before reading their link, purchase, settings or Discord profile', async () => {
    mocks.erased.mockResolvedValue(true)
    await expect(canAccessDashboardGuild(panel, 'g1')).resolves.toBe(false)
    await expect(findDashboardGuilds(panel)).resolves.toEqual([])
    expect(mocks.user).not.toHaveBeenCalled()
    expect(panel.findGuilds).not.toHaveBeenCalled()
  })
})

describe('dashboard community discovery', () => {
  it('combines owners, Discord administrators with a game rank, and purchased communities in batches', async () => {
    purchases = [{ steamID64: steamA, guild: 'buyer-only', revoke: false }]
    panel.findGuilds.mockResolvedValue([
      { id: 'g1', name: 'Admin community', permissions: '8' },
      { id: 'g2', permissions: '8' },
      { id: 'owner-only', name: 'Owned', owner: true, permissions: '0' },
      { id: 'member-only', permissions: '0' },
    ])
    const result = await findDashboardGuilds(panel, { fresh: true })
    expect(result.map((guild) => guild.id)).toEqual(['g1', 'owner-only', 'buyer-only'])
    expect(result[2]).toEqual({ id: 'buyer-only', name: 'Community buyer-only', owner: false, permissions: '0' })
    expect(panel.findGuilds).toHaveBeenCalledWith({ fresh: true })
    expect(mocks.players).toHaveBeenCalledOnce()
    expect(mocks.settings).toHaveBeenCalledOnce()
    expect(mocks.servers).toHaveBeenCalledOnce()
  })

  it('preserves a buyer community even without Discord membership and without any player record', async () => {
    purchases = [{ steamID64: steamA, guild: 'g1', revoke: false }]
    panel.findGuilds.mockResolvedValue([])
    players = []
    await expect(findDashboardGuilds(panel)).resolves.toEqual([
      { id: 'g1', name: 'Community g1', owner: false, permissions: '0' },
    ])
    expect(mocks.players).not.toHaveBeenCalled()
  })

  it('retains only durable buyer grants on a Discord outage and propagates that outage for non-buyers', async () => {
    panel.findGuilds.mockRejectedValue(new Error('Discord unavailable'))
    purchases = [{ steamID64: steamA, guild: 'g1', revoke: false }]
    expect((await findDashboardGuilds(panel)).map((guild) => guild.id)).toEqual(['g1'])
    purchases = []
    await expect(findDashboardGuilds(panel)).rejects.toThrow('Discord unavailable')
  })

  it('does not duplicate a purchased Discord owner and does not invent ownership for an absent community', async () => {
    purchases = [{ steamID64: steamA, guild: 'g1', revoke: false }]
    panel.findGuilds.mockResolvedValue([{ id: 'g1', owner: true, permissions: '0' }])
    await expect(findDashboardGuilds(panel)).resolves.toEqual([{ id: 'g1', owner: true, permissions: '0' }])
    panel.findGuilds.mockResolvedValue([])
    mocks.guilds.mockResolvedValue([])
    await expect(findDashboardGuilds(panel)).resolves.toEqual([
      { id: 'g1', name: undefined, owner: false, permissions: '0' },
    ])
  })

  it('ignores forged owner truthiness and malformed administrator permission bitfields', async () => {
    panel.findGuilds.mockResolvedValue([{ id: 'g1', owner: 'yes' as unknown as boolean, permissions: 'broken' }])
    await expect(findDashboardGuilds(panel)).resolves.toEqual([])
  })

  it('resolves the current identity after slow discovery and does not carry an old Steam purchase forward', async () => {
    purchases = [{ steamID64: steamA, guild: 'buyer-only', revoke: false }]
    panel.findGuilds.mockImplementationOnce(async () => {
      steam = steamB
      return [{ id: 'g1', permissions: '8' }]
    })
    await expect(findDashboardGuilds(panel)).resolves.toEqual([])
  })
})

describe('safe dashboard denial diagnostics', () => {
  it('returns only an allowed marker for ordinary administrators, owners and buyers', async () => {
    await expect(resolveDashboardAccess(panel, 'g1', { serverID: 's1' })).resolves.toEqual({ allowed: true })
    steam = null
    panel.findGuilds.mockResolvedValue([{ id: 'g1', owner: true }])
    await expect(resolveDashboardAccess(panel, 'g1', { serverID: 's2' })).resolves.toEqual({ allowed: true })
    steam = steamA
    purchases = [{ steamID64: steamA, guild: 'g1', revoke: false }]
    panel.findGuilds.mockRejectedValue(new Error('Discord unavailable'))
    await expect(resolveDashboardAccess(panel, 'g1', { serverID: 's2' })).resolves.toEqual({ allowed: true })
  })

  it.each([{ guilds: [] }, { guilds: [{ id: 'g1', permissions: '0' }] }])(
    'reports missing Discord administration before a missing Steam link: %j',
    async ({ guilds }) => {
      steam = null
      panel.findGuilds.mockResolvedValue(guilds)
      const result = await resolveDashboardAccess(panel, 'g1', { serverID: 's1', fresh: true })
      expect(result).toEqual({ allowed: false, reason: 'discord_admin_required' })
      expect(DashboardAccessDenialSchema.parse(result)).toEqual(result)
      expect(panel.findGuilds).toHaveBeenCalledWith({ fresh: true })
    },
  )

  it('reports a missing current Steam link only after confirming Discord administration', async () => {
    steam = null
    const result = await resolveDashboardAccess(panel, 'g1', { serverID: 's1' })
    expect(result).toEqual({ allowed: false, reason: 'steam_link_required' })
    expect(DashboardAccessDenialSchema.parse(result)).toEqual(result)
    expect(mocks.players).not.toHaveBeenCalled()
  })

  it('reports an unapproved stored game rank without exposing its name or the configured ranks', async () => {
    players[0].rank = 'private-actual-rank'
    settings = [{ serverID: 's1', setting: 'ig_adminRank', value: '{"private-required-rank":true}' }]
    const result = await resolveDashboardAccess(panel, 'g1', { serverID: 's1' })
    expect(result).toEqual({ allowed: false, reason: 'game_admin_required' })
    expect(DashboardAccessDenialSchema.parse(result)).toEqual(result)
    expect(JSON.stringify(result)).not.toContain('private-')
  })

  it('uses the same game requirement for absent records and malformed rank configuration', async () => {
    players = []
    await expect(resolveDashboardAccess(panel, 'g1', { serverID: 's1' })).resolves.toEqual({
      allowed: false,
      reason: 'game_admin_required',
    })
    players = [{ server_id: 's1', steam_id: steamA, rank: 'superadmin' }]
    settings = [{ serverID: 's1', setting: 'ig_adminRank', value: 'invalid json' }]
    await expect(resolveDashboardAccess(panel, 'g1', { serverID: 's1' })).resolves.toEqual({
      allowed: false,
      reason: 'game_admin_required',
    })
  })

  it('does not distinguish an absent target from a target in another community', async () => {
    const missing = await resolveDashboardAccess(panel, 'g1', { serverID: 'missing' })
    const foreign = await resolveDashboardAccess(panel, 'g1', { serverID: 's3' })
    expect(missing).toEqual({ allowed: false, reason: 'scope_unavailable' })
    expect(foreign).toEqual(missing)
    expect(DashboardAccessDenialSchema.parse(missing)).toEqual(missing)
    expect(panel.findGuilds).not.toHaveBeenCalled()
  })

  it('reports unavailable scope after an erased account or a target moved during OAuth', async () => {
    mocks.erased.mockResolvedValueOnce(true)
    await expect(resolveDashboardAccess(panel, 'g1', { serverID: 's1' })).resolves.toEqual({
      allowed: false,
      reason: 'scope_unavailable',
    })
    panel.findGuilds.mockImplementationOnce(async () => {
      servers[0].guild = 'g2'
      return [{ id: 'g1', owner: true }]
    })
    await expect(resolveDashboardAccess(panel, 'g1', { serverID: 's1' })).resolves.toEqual({
      allowed: false,
      reason: 'scope_unavailable',
    })
  })

  it('does not convert external failures into a missing-permission diagnostic', async () => {
    panel.findGuilds.mockRejectedValueOnce(new Error('Discord unavailable'))
    await expect(resolveDashboardAccess(panel, 'g1')).rejects.toThrow('Discord unavailable')
    mocks.settings.mockRejectedValueOnce(new Error('Database unavailable'))
    await expect(resolveDashboardAccess(panel, 'g1', { serverID: 's1' })).rejects.toThrow('Database unavailable')
  })

  it('keeps the boolean wrapper consistent with each diagnostic without changing policy', async () => {
    for (const serverID of ['s1', 's2', 's3', 'missing']) {
      const result = await resolveDashboardAccess(panel, 'g1', { serverID })
      await expect(canAccessDashboardGuild(panel, 'g1', { serverID })).resolves.toBe(result.allowed)
    }
  })
})
