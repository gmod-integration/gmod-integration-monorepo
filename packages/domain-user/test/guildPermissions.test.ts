import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ values: new Map<string, string>(), publish: vi.fn(), set: vi.fn(), del: vi.fn() }))
vi.mock('@gmod/infra-redis', () => ({
  default: {
    mget: async (...keys: string[]) => keys.map((key) => state.values.get(key) ?? null),
    set: state.set,
    del: state.del,
    publish: state.publish,
  },
}))
const {
  invalidateDiscordGuildPermissions,
  readDiscordGuildPermissionsRevision,
  parseDiscordGuildPermissionsInvalidation,
  DISCORD_GUILD_PERMISSIONS_CHANNEL,
} = await import('../src/guildPermissions.js')

beforeEach(() => {
  state.values.clear()
  vi.resetAllMocks()
  state.set.mockImplementation(async (key, value) => {
    state.values.set(key, value)
    return 'OK'
  })
  state.del.mockImplementation(async (key) => Number(state.values.delete(key)))
  state.publish.mockResolvedValue(1)
})

describe('Discord permission invalidation across replicas', () => {
  it('invalidates the affected account before publishing without expiring another account permissions', async () => {
    state.values.set('user:member:guilds', 'cached')
    const previous = await readDiscordGuildPermissionsRevision('member')
    const unaffected = await readDiscordGuildPermissionsRevision('other')
    await invalidateDiscordGuildPermissions({ guildID: 'guild', discordID: 'member' })
    expect(await readDiscordGuildPermissionsRevision('member')).not.toBe(previous)
    expect(await readDiscordGuildPermissionsRevision('other')).toBe(unaffected)
    expect(state.values.has('user:member:guilds')).toBe(false)
    expect(state.set).toHaveBeenCalledWith('user:member:guild-permissions-revision', expect.any(String), 'EX', 300)
    const [channel, payload] = state.publish.mock.calls[0]
    expect(channel).toBe(DISCORD_GUILD_PERMISSIONS_CHANNEL)
    expect(parseDiscordGuildPermissionsInvalidation(payload)).toMatchObject({ guildID: 'guild', discordID: 'member' })
    expect(state.set.mock.invocationCallOrder[0]).toBeLessThan(state.publish.mock.invocationCallOrder[0])
  })
  it('expires all cached OAuth permission snapshots after a guild-wide role or ownership change', async () => {
    const before = await readDiscordGuildPermissionsRevision('member')
    await invalidateDiscordGuildPermissions({ guildID: 'guild' })
    expect(await readDiscordGuildPermissionsRevision('member')).not.toBe(before)
    expect(await readDiscordGuildPermissionsRevision('other')).not.toBe(before)
    expect(state.del).not.toHaveBeenCalled()
  })
  it('retains a changed durable revision when publication is unavailable', async () => {
    const previous = await readDiscordGuildPermissionsRevision('member')
    state.publish.mockRejectedValue(new Error('Redis subscription unavailable'))
    await expect(invalidateDiscordGuildPermissions({ discordID: 'member' })).rejects.toThrow()
    expect(await readDiscordGuildPermissionsRevision('member')).not.toBe(previous)
  })
  it('requires an invalidation target', async () => {
    await expect(invalidateDiscordGuildPermissions({})).rejects.toThrow()
    expect(state.set).not.toHaveBeenCalled()
  })
  it.each([
    '{',
    'null',
    '{}',
    '{"revision":"v1"}',
    '{"guildID":2,"revision":"v1"}',
    '{"discordID":"","revision":"v1"}',
  ])('ignores malformed notifications %s', (payload) => {
    expect(parseDiscordGuildPermissionsInvalidation(payload)).toBeNull()
  })
})
