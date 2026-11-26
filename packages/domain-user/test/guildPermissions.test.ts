import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  values: new Map<string, string>(),
  publish: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  eval: vi.fn(),
}))
vi.mock('@gmod/infra-redis', () => ({
  default: {
    mget: async (...keys: string[]) => keys.map((key) => state.values.get(key) ?? null),
    get: async (key: string) => state.values.get(key) ?? null,
    set: state.set,
    del: state.del,
    publish: state.publish,
    eval: state.eval,
  },
}))
const {
  invalidateDiscordGuildPermissions,
  readDiscordGuildPermissionsRevision,
  readDiscordGuildPermissionsEpoch,
  readDiscordGuildPermissionsScope,
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
  state.eval.mockImplementation(async (_script, count, guildKey, epochKey, revision) => {
    expect(count).toBe(2)
    state.values.set(guildKey, revision)
    state.values.set(epochKey, revision)
    return 1
  })
})

describe('Discord permission invalidation across replicas', () => {
  it('invalidates the affected account before publishing without expiring another account permissions', async () => {
    state.values.set('user:member:guilds', 'cached')
    const previous = await readDiscordGuildPermissionsRevision('member', ['guild'])
    const unaffected = await readDiscordGuildPermissionsRevision('other', ['unrelated'])
    await invalidateDiscordGuildPermissions({ guildID: 'guild', discordID: 'member' })
    expect(await readDiscordGuildPermissionsRevision('member', ['guild'])).not.toBe(previous)
    expect(await readDiscordGuildPermissionsRevision('other', ['unrelated'])).toBe(unaffected)
    expect(state.values.has('user:member:guilds')).toBe(false)
    expect(state.set).toHaveBeenCalledWith('user:member:guild-permissions-revision', expect.any(String), 'EX', 300)
    const [channel, payload] = state.publish.mock.calls[0]
    expect(channel).toBe(DISCORD_GUILD_PERMISSIONS_CHANNEL)
    expect(parseDiscordGuildPermissionsInvalidation(payload)).toMatchObject({ guildID: 'guild', discordID: 'member' })
    expect(state.set.mock.invocationCallOrder[0]).toBeLessThan(state.publish.mock.invocationCallOrder[0])
  })
  it('expires affected memberships including non-admin members while preserving unrelated communities', async () => {
    state.values.set('user:member:guilds', JSON.stringify({ guilds: [{ id: 'guild', permissions: '0' }] }))
    state.values.set('user:other:guilds', JSON.stringify({ guilds: [{ id: 'unrelated' }] }))
    const before = await readDiscordGuildPermissionsRevision('member')
    const unaffected = await readDiscordGuildPermissionsRevision('other')
    const epoch = await readDiscordGuildPermissionsEpoch('member')
    await invalidateDiscordGuildPermissions({ guildID: 'guild' })
    expect(await readDiscordGuildPermissionsRevision('member')).not.toBe(before)
    expect(await readDiscordGuildPermissionsRevision('other')).toBe(unaffected)
    expect(await readDiscordGuildPermissionsEpoch('member')).not.toBe(epoch)
    expect(state.del).not.toHaveBeenCalled()
  })
  it('keeps a durable guild revision when notification publication fails', async () => {
    const before = await readDiscordGuildPermissionsRevision('member', ['guild'])
    state.publish.mockRejectedValue(new Error('Subscriber unavailable'))
    await expect(invalidateDiscordGuildPermissions({ guildID: 'guild' })).rejects.toThrow()
    expect(await readDiscordGuildPermissionsRevision('member', ['guild'])).not.toBe(before)
  })
  it('updates guild revision and in-flight epoch in one atomic Redis operation before publishing', async () => {
    await invalidateDiscordGuildPermissions({ guildID: 'guild' })
    expect(state.eval).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining("redis.call('set', KEYS[2], ARGV[1])"),
      2,
      'guild:guild:oauth-permissions-revision',
      'gmi:discord:guild-permissions:revision',
      expect.any(String),
    )
    expect(state.set).not.toHaveBeenCalled()
    expect(state.eval.mock.invocationCallOrder[0]).toBeLessThan(state.publish.mock.invocationCallOrder[0])
    expect(state.values.get('guild:guild:oauth-permissions-revision')).toBe(
      state.values.get('gmi:discord:guild-permissions:revision'),
    )
  })
  it.each(['{', '{}', '{"guilds":[null]}', '{"guilds":[{"id":2}]}'])(
    'does not treat damaged membership snapshots as a known scope: %s',
    async (value) => {
      state.values.set('user:member:guilds', value)
      expect(await readDiscordGuildPermissionsScope('member')).toBeNull()
    },
  )
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
