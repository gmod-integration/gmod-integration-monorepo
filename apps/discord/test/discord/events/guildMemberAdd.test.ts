import { beforeEach, describe, expect, it, vi } from 'vitest'

let configDiscordMock: any = { clientID: 'bot-id' }
vi.mock('@gmod/config', () => ({
  get ConfigDiscord() {
    return configDiscordMock
  },
}))

const addAutoRoleToUserMock = vi.fn()
const updateGuildStatMock = vi.fn()
const verifyUserMock = vi.fn()
vi.mock('@gmod/domain-guild/discordModels.js', () => ({
  addAutoRoleToUser: addAutoRoleToUserMock,
  updateGuildStat: updateGuildStatMock,
  verifyUser: verifyUserMock,
}))

const gmLogMock = vi.fn()
vi.mock('@gmod/core/utils/logger.js', () => ({ gmLog: gmLogMock }))

const getNotVerifiedMessageMock = vi.fn()
vi.mock('../../../src/discord/utils/messages.js', () => ({
  getNotVerifiedMessage: getNotVerifiedMessageMock,
}))

const prismaMock = {
  gm_guild_settings: { findFirst: vi.fn() },
}
vi.mock('@gmod/infra-prisma', () => ({ default: prismaMock }))

function makeAddInfo(overrides: any = {}) {
  const guildID = overrides.guildID ?? 'guild1'
  const userID = overrides.userID ?? 'user1'
  const guild = overrides.guild ?? { id: guildID, members: { cache: new Map([[userID, { id: userID, send: vi.fn() }]]) } }
  return {
    user: { id: userID },
    guild: { id: guildID, name: 'Test Guild' },
    client: { guilds: { cache: new Map([[guildID, guild]]) } },
    ...overrides.addInfo,
  }
}

describe('guildMemberAdd event', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    configDiscordMock = { clientID: 'bot-id' }
    updateGuildStatMock.mockResolvedValue(undefined)
    addAutoRoleToUserMock.mockResolvedValue(undefined)
    verifyUserMock.mockResolvedValue(true)
    getNotVerifiedMessageMock.mockResolvedValue({ content: 'please verify' })
    prismaMock.gm_guild_settings.findFirst.mockResolvedValue(null)
  })

  it('returns immediately when the bot itself joins', async () => {
    const mod = await import('../../../src/discord/events/guildMemberAdd.js')
    const addInfo = makeAddInfo({ userID: 'bot-id' })

    await mod.default.execute(addInfo as any)

    expect(updateGuildStatMock).not.toHaveBeenCalled()
  })

  it('logs an error when the guild cannot be found in the client cache', async () => {
    const mod = await import('../../../src/discord/events/guildMemberAdd.js')
    const addInfo = makeAddInfo()
    addInfo.client.guilds.cache.clear()

    await mod.default.execute(addInfo as any)

    expect(gmLogMock).toHaveBeenCalledWith('error', expect.stringContaining('Guild not found'))
    expect(updateGuildStatMock).not.toHaveBeenCalled()
  })

  it('logs an error when the member cannot be found in the guild cache', async () => {
    const mod = await import('../../../src/discord/events/guildMemberAdd.js')
    const guild = { id: 'guild1', members: { cache: new Map() } }
    const addInfo = makeAddInfo({ guild })

    await mod.default.execute(addInfo as any)

    expect(gmLogMock).toHaveBeenCalledWith('error', expect.stringContaining('Member not found'))
    expect(updateGuildStatMock).not.toHaveBeenCalled()
  })

  it('skips the not-verified message when the member is verified', async () => {
    verifyUserMock.mockResolvedValue(true)
    const mod = await import('../../../src/discord/events/guildMemberAdd.js')
    const addInfo = makeAddInfo()

    await mod.default.execute(addInfo as any)

    expect(updateGuildStatMock).toHaveBeenCalled()
    expect(addAutoRoleToUserMock).toHaveBeenCalled()
    expect(getNotVerifiedMessageMock).not.toHaveBeenCalled()
  })

  it('returns without messaging when verification_dont_mp setting is set', async () => {
    verifyUserMock.mockResolvedValue(false)
    prismaMock.gm_guild_settings.findFirst.mockResolvedValue({ setting: 'verification_dont_mp' })
    const mod = await import('../../../src/discord/events/guildMemberAdd.js')
    const addInfo = makeAddInfo()

    await mod.default.execute(addInfo as any)

    expect(prismaMock.gm_guild_settings.findFirst).toHaveBeenCalledWith({
      where: { guildID: 'guild1', setting: 'verification_dont_mp' },
    })
    expect(getNotVerifiedMessageMock).not.toHaveBeenCalled()
  })

  it('sends the not-verified message when the member is unverified and dm is allowed', async () => {
    verifyUserMock.mockResolvedValue(false)
    prismaMock.gm_guild_settings.findFirst.mockResolvedValue(null)
    const mod = await import('../../../src/discord/events/guildMemberAdd.js')
    const member = { id: 'user1', send: vi.fn() }
    const guild = { id: 'guild1', members: { cache: new Map([['user1', member]]) } }
    const addInfo = makeAddInfo({ guild })

    await mod.default.execute(addInfo as any)

    expect(getNotVerifiedMessageMock).toHaveBeenCalledWith(guild, member)
    expect(member.send).toHaveBeenCalledWith({ content: 'please verify' })
  })

  it('swallows addAutoRoleToUser failures without throwing', async () => {
    addAutoRoleToUserMock.mockRejectedValue(new Error('role add failed'))
    verifyUserMock.mockResolvedValue(true)
    const mod = await import('../../../src/discord/events/guildMemberAdd.js')
    const addInfo = makeAddInfo()

    await expect(mod.default.execute(addInfo as any)).resolves.toBeUndefined()
  })

  it('catches unexpected errors and logs them', async () => {
    updateGuildStatMock.mockRejectedValue(new Error('boom'))
    const mod = await import('../../../src/discord/events/guildMemberAdd.js')
    const addInfo = makeAddInfo()

    await mod.default.execute(addInfo as any)

    expect(gmLogMock).toHaveBeenCalledWith('error', expect.stringContaining('Error in guildMemberAdd'))
  })
})
