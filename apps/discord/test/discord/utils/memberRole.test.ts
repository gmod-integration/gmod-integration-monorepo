import { beforeEach, describe, expect, it, vi } from 'vitest'

const client = vi.hoisted(() => vi.fn())
vi.mock('../../../src/discord/index.js', () => ({ getGuildClient: client }))
const { getGuildMemberRole } = await import('../../../src/discord/utils/memberRole.js')
const guildID = '111111111111111111'
const discordID = '222222222222222222'
const roleID = '333333333333333333'
const unavailable = { available: false, hasRole: false, roleExists: false }
let guild: any
let role: any
let member: any
let fetchGuild: ReturnType<typeof vi.fn>

beforeEach(() => {
  role = { id: roleID, guild: { id: guildID } }
  member = { id: discordID, guild: { id: guildID }, partial: false, roles: { cache: new Map([[roleID, role]]) } }
  guild = {
    id: guildID,
    roles: { fetch: vi.fn().mockImplementation(async () => role) },
    members: { fetch: vi.fn().mockImplementation(async () => member) },
  }
  fetchGuild = vi.fn().mockImplementation(async () => guild)
  client.mockReset().mockResolvedValue({ guilds: { fetch: fetchGuild } })
})

describe('fresh Discord member role lookup', () => {
  it('force-fetches all scoped identities and observes a subsequent role loss without cached grants', async () => {
    expect(await getGuildMemberRole(guildID, discordID, roleID)).toEqual({
      available: true,
      hasRole: true,
      roleExists: true,
    })
    member.roles.cache.clear()
    expect(await getGuildMemberRole(guildID, discordID, roleID)).toEqual({
      available: true,
      hasRole: false,
      roleExists: true,
    })
    expect(client).toHaveBeenCalledWith(guildID, false)
    expect(fetchGuild).toHaveBeenCalledWith({ guild: guildID, force: true })
    expect(guild.roles.fetch).toHaveBeenCalledWith(roleID, { force: true, cache: true })
    expect(guild.members.fetch).toHaveBeenCalledWith({ user: discordID, force: true, cache: false })
    expect(guild.members.fetch).toHaveBeenCalledTimes(2)
  })

  it.each([null, 10011])('treats a confirmed missing role as a known negative (%s)', async (missing) => {
    if (missing === null) role = null
    else guild.roles.fetch.mockRejectedValueOnce({ code: missing })
    expect(await getGuildMemberRole(guildID, discordID, roleID)).toEqual({
      available: true,
      hasRole: false,
      roleExists: false,
    })
    expect(guild.members.fetch).not.toHaveBeenCalled()
  })

  it('treats unknown member10007 as a known loss of membership', async () => {
    guild.members.fetch.mockRejectedValueOnce({ code: 10007 })
    expect(await getGuildMemberRole(guildID, discordID, roleID)).toEqual({
      available: true,
      hasRole: false,
      roleExists: true,
    })
  })

  it.each(['client', 'guild', 'role', 'member'])(
    'does not convert a %s provider failure into a verified answer',
    async (stage) => {
      if (stage === 'client') client.mockRejectedValueOnce(new Error('provider unavailable'))
      if (stage === 'guild') fetchGuild.mockRejectedValueOnce({ code: 50001 })
      if (stage === 'role') guild.roles.fetch.mockRejectedValueOnce({ code: 50013 })
      if (stage === 'member') guild.members.fetch.mockRejectedValueOnce({ code: 50013 })
      expect(await getGuildMemberRole(guildID, discordID, roleID)).toEqual(unavailable)
    },
  )

  it.each([null, 'transport unavailable', new Error('network unavailable')])(
    'keeps an unexpected provider failure unavailable (%s)',
    async (error) => {
      guild.roles.fetch.mockRejectedValueOnce(error)
      expect(await getGuildMemberRole(guildID, discordID, roleID)).toEqual(unavailable)
    },
  )

  it.each([
    'guild',
    'role ID',
    'role guild',
    'member ID',
    'member guild',
    'partial member',
    'incomplete role',
    'missing guild',
    'missing role payload',
    'missing member payload',
  ])('rejects mismatched or incomplete %s data', async (invalid) => {
    if (invalid === 'guild') guild.id = 'other'
    if (invalid === 'role ID') role.id = 'other'
    if (invalid === 'role guild') role.guild.id = 'other'
    if (invalid === 'member ID') member.id = 'other'
    if (invalid === 'member guild') member.guild.id = 'other'
    if (invalid === 'partial member') member.partial = true
    if (invalid === 'incomplete role') delete role.guild
    if (invalid === 'missing guild') guild = null
    if (invalid === 'missing role payload') role = undefined
    if (invalid === 'missing member payload') member = undefined
    expect(await getGuildMemberRole(guildID, discordID, roleID)).toEqual(unavailable)
  })
})
