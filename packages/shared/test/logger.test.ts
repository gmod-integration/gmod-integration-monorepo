import { afterEach, describe, expect, it, vi } from 'vitest'

const configServerMock = { dev: false }
vi.mock('@gmod/config', () => ({ ConfigServer: configServerMock }))

const { gmLog } = await import('../src/logger.js')

afterEach(() => {
  vi.restoreAllMocks()
  configServerMock.dev = false
})

describe('shared logger', () => {
  describe('gmLog', () => {
    it('logs when debug is false', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      gmLog('status', 'hello')
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[STATUS] hello'))
    })

    it('logs when debug is true and dev mode is on', () => {
      configServerMock.dev = true
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      gmLog('status', 'debug message', true)
      expect(logSpy).toHaveBeenCalled()
      configServerMock.dev = false
    })

    it('skips logging when debug is true and dev mode is off', () => {
      configServerMock.dev = false
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      gmLog('status', 'debug message', true)
      expect(logSpy).not.toHaveBeenCalled()
    })
  })
})
