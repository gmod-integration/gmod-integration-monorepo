import { beforeEach, describe, expect, it, vi } from 'vitest'
const lookup = vi.hoisted(() => vi.fn())
vi.mock('@gmod/domain-server/Server.js', () => ({ getServerFromID: lookup }))
const { getDiscordCommunityServer } = await import('../../../src/models/v3/discordServerScope.js')
beforeEach(() => lookup.mockReset())
describe('Discord community server resolution', () => {
  it.each([
    [null, 'g1'],
    ['s1', undefined],
    ['s1', ''],
    ['', 'g1'],
    ['s'.repeat(256), 'g1'],
  ])('rejects missing or malformed identifiers without a lookup', async (serverID, guildID) => {
    expect(await getDiscordCommunityServer(serverID, guildID)).toBeNull()
    expect(lookup).not.toHaveBeenCalled()
  })
  it('only returns a server belonging to the interaction community, regardless of public visibility', async () => {
    for (const isPublic of [true, false]) {
      lookup.mockResolvedValueOnce({ getGuildID: () => 'other', isPublic })
      expect(await getDiscordCommunityServer('s1', 'g1')).toBeNull()
    }
    const server = { getGuildID: () => 'g1', isPublic: false }
    lookup.mockResolvedValueOnce(server)
    expect(await getDiscordCommunityServer('s1', 'g1')).toBe(server)
    lookup.mockResolvedValueOnce(null)
    expect(await getDiscordCommunityServer('deleted', 'g1')).toBeNull()
  })
})
