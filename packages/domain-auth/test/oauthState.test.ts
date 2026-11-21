import { beforeEach, describe, expect, it, vi } from 'vitest'
const values = new Map<string, string>()
const set = vi.fn(async (key: string, value: string) => {
  values.set(key, value)
  return 'OK'
})
const getdel = vi.fn(async (key: string) => {
  const value = values.get(key)
  values.delete(key)
  return value || null
})
vi.mock('@gmod/infra-redis', () => ({ default: { set, getdel } }))
vi.mock('@gmod/config', () => ({
  ConfigAuth: { oauthStateTtlSeconds: 600 },
  ConfigDiscord: { clientSecret: 'test-secret' },
  ConfigServer: { websiteUrl: 'https://app.example.test', domain: 'https://api.example.test' },
}))
const { beginOAuthFlow, consumeOAuthFlow, internalRedirect } = await import('../src/oauthState.js')
beforeEach(() => {
  values.clear()
  vi.clearAllMocks()
})

describe('OAuth browser-bound transaction', () => {
  it('binds state and PKCE to the browser and consumes the transaction only once', async () => {
    const flow = await beginOAuthFlow('/dashboard/guilds/123/config')
    expect(flow.codeChallenge).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(set).toHaveBeenCalledWith(expect.any(String), expect.any(String), 'EX', 600)
    const result = await consumeOAuthFlow(flow.state, flow.browserBinding)
    expect(result).toMatchObject({ redirect: '/dashboard/guilds/123/config', guildID: '123' })
    expect(result.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/)
    await expect(consumeOAuthFlow(flow.state, flow.browserBinding)).rejects.toMatchObject({
      code: 'oauth_state_invalid',
    })
  })

  it('rejects callbacks from a different browser and absent or expired state', async () => {
    const flow = await beginOAuthFlow('/account')
    await expect(consumeOAuthFlow(flow.state, 'another-browser')).rejects.toMatchObject({ status: 400 })
    await expect(consumeOAuthFlow(undefined, flow.browserBinding)).rejects.toMatchObject({ status: 400 })
    const expired = await beginOAuthFlow('/account')
    values.clear()
    await expect(consumeOAuthFlow(expired.state, expired.browserBinding)).rejects.toMatchObject({ status: 400 })
  })

  it.each(['https://evil.test', '//evil.test', '/\\evil.test', '/\n/evil.test', undefined])(
    'rejects an external or malformed destination %s',
    (value) => {
      expect(internalRedirect(value)).toBe('/dashboard/guilds')
    },
  )
})
