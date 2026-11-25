import { beforeEach, describe, expect, it, vi } from 'vitest'

const profile = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@gmod/core/models/v3/playerProfileModels.js', () => ({ processGetPlayerProfile: profile.get }))
const { getPlayerProfile, getPlayerProfileByDiscord, getPlayerProfileBySteam } =
  await import('../../../src/controllers/website/WebsitePlayerProfileControllers.js')

function response() {
  const res: any = {}
  res.setHeader = vi.fn().mockReturnValue(res)
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  return res
}

describe('player profile controller', () => {
  beforeEach(() => vi.resetAllMocks())

  it('uses the authenticated account instead of a route, query or body viewer override and prevents response caching', async () => {
    const body = { player: { name: 'Player' } }
    profile.get.mockResolvedValueOnce({ status: 200, body })
    const req: any = {
      panelUser: { discordID: 'authenticated' },
      params: { discordID: 'spoofed', steamID64: '76561198000000001' },
      query: { limit: '25' },
      body: { discordID: 'body-account' },
    }
    const res = response()
    await getPlayerProfile(req, res)
    expect(profile.get).toHaveBeenCalledExactlyOnceWith('authenticated', '76561198000000001', req.query)
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store')
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(body)
  })

  it('resolves the own-profile endpoint through an absent Steam route parameter', async () => {
    profile.get.mockResolvedValueOnce({ status: 404, body: { error: 'steam_not_linked' } })
    const res = response()
    await getPlayerProfile({ panelUser: { discordID: 'viewer' }, params: {}, query: {} } as any, res)
    expect(profile.get).toHaveBeenCalledExactlyOnceWith('viewer', undefined, {})
    expect(res.status).toHaveBeenCalledWith(404)
    expect(res.json).toHaveBeenCalledWith({ error: 'steam_not_linked' })
  })

  it.each([
    [getPlayerProfileByDiscord, 'discord', { targetDiscordID: '333650866747867137' }, '333650866747867137'],
    [getPlayerProfileBySteam, 'steam', { steamID64: '76561198000000001' }, '76561198000000001'],
  ] as const)('passes an explicit identity namespace to %s', async (controller, provider, params, target) => {
    profile.get.mockResolvedValueOnce({ status: 200, body: { player: {} } })
    const res = response()
    const query = { warningOffset: '10', banOffset: '20' }
    await controller({ panelUser: { discordID: 'viewer' }, params, query } as any, res)
    expect(profile.get).toHaveBeenCalledExactlyOnceWith('viewer', target, query, undefined, provider)
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store')
    expect(res.status).toHaveBeenCalledWith(200)
  })

  it('propagates storage failures to the shared handler', async () => {
    profile.get.mockRejectedValueOnce(new Error('storage failure'))
    const res = response()
    await expect(
      getPlayerProfile({ panelUser: { discordID: 'viewer' }, params: {}, query: {} } as any, res),
    ).rejects.toThrow('storage failure')
    expect(res.json).not.toHaveBeenCalled()
  })
})
