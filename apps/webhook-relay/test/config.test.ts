import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadConfig } from '../src/config.js'

describe('loadConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('reads the token, port and host', () => {
    expect(loadConfig({ BARER_TOKEN: 'secret', APP_PORT: '4000', APP_HOST: '127.0.0.1' })).toEqual({
      barerToken: 'secret',
      port: 4000,
      hostname: '127.0.0.1',
    })
  })

  it('defaults the port and host when unset or empty', () => {
    const expected = { barerToken: 'secret', port: 3000, hostname: '0.0.0.0' }
    expect(loadConfig({ BARER_TOKEN: 'secret' })).toEqual(expected)
    expect(loadConfig({ BARER_TOKEN: 'secret', APP_PORT: '', APP_HOST: '' })).toEqual(expected)
  })

  it('refuses to start without a bearer token instead of accepting unauthenticated requests', () => {
    expect(() => loadConfig({})).toThrow(/BARER_TOKEN/)
    expect(() => loadConfig({ BARER_TOKEN: '' })).toThrow('BARER_TOKEN: BARER_TOKEN is required')
  })

  it('rejects a port that is not a valid TCP port', () => {
    expect(() => loadConfig({ BARER_TOKEN: 'secret', APP_PORT: 'http' })).toThrow(/APP_PORT/)
    expect(() => loadConfig({ BARER_TOKEN: 'secret', APP_PORT: '70000' })).toThrow(/APP_PORT/)
  })

  it('reads process.env by default', () => {
    vi.stubEnv('BARER_TOKEN', 'from-process-env')
    vi.stubEnv('APP_PORT', '3100')
    expect(loadConfig()).toMatchObject({ barerToken: 'from-process-env', port: 3100 })
  })
})
