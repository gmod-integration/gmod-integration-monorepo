import { describe, expect, it, vi } from 'vitest'

const processSteamVerificationMock = vi.fn()
const processSteamVerificationReturnMock = vi.fn()
vi.mock('@gmod/core/models/v3/steamControllerModels.js', () => ({
  processSteamVerification: processSteamVerificationMock,
  processSteamVerificationReturn: processSteamVerificationReturnMock,
}))

const { steamVerification, steamVerificationReturn } = await import('../../../src/controllers/v3/steamControllers.js')

function makeRes() {
  const res: any = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  res.send = vi.fn().mockReturnValue(res)
  res.redirect = vi.fn().mockReturnValue(res)
  return res
}

describe('steamControllers', () => {
  describe('steamVerification', () => {
    it('redirects for a redirect result', async () => {
      processSteamVerificationMock.mockReturnValueOnce({ kind: 'redirect', status: 302, url: 'https://steam.example' })
      const res = makeRes()
      await steamVerification({ query: {} } as any, res)
      expect(res.redirect).toHaveBeenCalledWith('https://steam.example')
    })

    it('sends text for a text result', async () => {
      processSteamVerificationMock.mockReturnValueOnce({ kind: 'text', status: 400, text: 'error' })
      const res = makeRes()
      await steamVerification({ query: {} } as any, res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.send).toHaveBeenCalledWith('error')
    })
  })

  describe('steamVerificationReturn', () => {
    it('redirects for a redirect result', async () => {
      processSteamVerificationReturnMock.mockResolvedValueOnce({
        kind: 'redirect',
        status: 302,
        url: 'https://gmod-integration.com/account',
      })
      const res = makeRes()
      await steamVerificationReturn({ query: {} } as any, res)
      expect(res.redirect).toHaveBeenCalledWith('https://gmod-integration.com/account')
    })

    it('sends json for a json result', async () => {
      processSteamVerificationReturnMock.mockResolvedValueOnce({
        kind: 'json',
        status: 200,
        body: { message: 'ok' },
      })
      const res = makeRes()
      await steamVerificationReturn({ query: {} } as any, res)
      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith({ message: 'ok' })
    })
  })
})
