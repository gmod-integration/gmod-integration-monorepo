import { beforeEach, describe, expect, it, vi } from 'vitest'

const isGlobalBanMock = vi.fn()
vi.mock('@gmod/domain-moderation/bansModels.js', () => ({ isGlobalBan: isGlobalBanMock }))

const ipGetIPMock = vi.fn((ip: string) => ip.split(':')[0])
vi.mock('@gmod/core/utils/tools.js', () => ({ ipGetIP: ipGetIPMock }))

const { isGlobalBanSomewhere } = await import('../../../src/controllers/v3/bansControllers.js')

function makeRes() {
  const res: any = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  return res
}

describe('isGlobalBanSomewhere', () => {
  beforeEach(() => {
    isGlobalBanMock.mockReset()
    ipGetIPMock.mockClear()
  })

  it('normalizes the IP via ipGetIP when provided', async () => {
    isGlobalBanMock.mockResolvedValueOnce({ banned: true })
    const res = makeRes()

    await isGlobalBanSomewhere(
      { query: { IP: '1.2.3.4:27015', discordID: 'd1', steamID64: '765' } } as any,
      res,
    )

    expect(ipGetIPMock).toHaveBeenCalledWith('1.2.3.4:27015')
    expect(isGlobalBanMock).toHaveBeenCalledWith('1.2.3.4', 'd1', '765')
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ banned: true })
  })

  it('passes null IP when not provided', async () => {
    isGlobalBanMock.mockResolvedValueOnce({ banned: false })
    const res = makeRes()

    await isGlobalBanSomewhere({ query: { discordID: 'd1', steamID64: '765' } } as any, res)

    expect(ipGetIPMock).not.toHaveBeenCalled()
    expect(isGlobalBanMock).toHaveBeenCalledWith(null, 'd1', '765')
  })
})
