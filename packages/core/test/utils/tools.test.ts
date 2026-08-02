import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

let configServerMock: { dev: boolean }
vi.mock('@gmod/config', () => ({
  get ConfigServer() {
    return configServerMock
  },
}))

const getEmojisMock = vi.fn()
vi.mock('unicode-emoji', () => ({ getEmojis: getEmojisMock }))

const createNotificationMock = vi.fn()
vi.mock('@gmod/infra-prisma', () => ({
  default: { gm_users_notifications: { create: createNotificationMock } },
}))

configServerMock = { dev: false }

vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => [{ name: 'v1.2.3' }] }))
vi.useFakeTimers()

const {
  getRandomDiscordRelay,
  getEmojiVersion,
  getCurrencyByLang,
  badArgument,
  ipGetIP,
  generateToken,
  addNotification,
  todoControllers,
  versionComparator,
} = await import('../../src/utils/tools.js')

afterAll(() => {
  vi.useRealTimers()
})

describe('tools', () => {
  beforeEach(() => {
    getEmojisMock.mockReset()
    createNotificationMock.mockReset()
  })

  describe('getRandomDiscordRelay', () => {
    it('returns the prod relay when not in dev mode', () => {
      configServerMock.dev = false
      expect(getRandomDiscordRelay()).toBe('https://1-dsc-relay.gmod-integration.com')
    })

    it('returns the dev relay when in dev mode', () => {
      configServerMock.dev = true
      expect(getRandomDiscordRelay()).toBe('https://dsc-relay-dev.gmod-integration.com')
      configServerMock.dev = false
    })
  })

  describe('getEmojiVersion', () => {
    it('returns the version when the emoji is found', () => {
      getEmojisMock.mockReturnValueOnce([{ emoji: '🎉', version: '6.0' }])
      expect(getEmojiVersion('🎉')).toBe('6.0')
    })

    it('returns null when the emoji is not found', () => {
      getEmojisMock.mockReturnValueOnce([])
      expect(getEmojiVersion('🎉')).toBeNull()
    })
  })

  describe('getCurrencyByLang', () => {
    it('returns the mapped currency for a known language', () => {
      expect(getCurrencyByLang('fr')).toBe('EUR')
    })

    it('defaults to USD for an unknown language', () => {
      expect(getCurrencyByLang('xx')).toBe('USD')
    })
  })

  describe('badArgument', () => {
    it('returns false when every argument is defined', () => {
      expect(badArgument([1, 'a', true])).toBe(false)
    })

    it('returns a comma-joined list of undefined argument indices', () => {
      expect(badArgument([1, undefined, 'a', undefined])).toBe('1, 3')
    })
  })

  describe('ipGetIP', () => {
    it('strips the port from an address containing a colon', () => {
      expect(ipGetIP('127.0.0.1:27015')).toBe('127.0.0.1')
    })

    it('returns the address unchanged when there is no colon', () => {
      expect(ipGetIP('127.0.0.1')).toBe('127.0.0.1')
    })
  })

  describe('generateToken', () => {
    it('throws for a non-integer length', () => {
      expect(() => generateToken(1.5)).toThrow('Token length must be a positive integer')
    })

    it('throws for a non-positive length', () => {
      expect(() => generateToken(0)).toThrow('Token length must be a positive integer')
    })

    it('generates a token of the requested length using only the allowed charset', () => {
      const token = generateToken(32)
      expect(token).toHaveLength(32)
      expect(token).toMatch(/^[A-Za-z0-9]+$/)
    })

    it('re-rolls biased bytes (>= 248) via rejection sampling instead of using them', async () => {
      // 62 does not divide 256 evenly (256 % 62 = 8), so bytes in [248, 255] would bias the
      // charset selection - the source skips them. Force one such byte to prove the skip path
      // actually runs, using a mocked node:crypto that yields a biased byte before a valid one.
      vi.doMock('node:crypto', async (importOriginal) => {
        const actual = await importOriginal<typeof import('node:crypto')>()
        let call = 0
        return {
          ...actual,
          randomBytes: (size: number) => {
            call += 1
            if (call === 1) {
              return Buffer.from(new Array(size).fill(255))
            }
            return actual.randomBytes(size)
          },
        }
      })
      vi.resetModules()

      const { generateToken: generateTokenWithMockedCrypto } = await import('../../src/utils/tools.js')
      const token = generateTokenWithMockedCrypto(4)

      expect(token).toHaveLength(4)
      vi.doUnmock('node:crypto')
    })
  })

  describe('addNotification', () => {
    it('persists a notification row', async () => {
      await addNotification('d1', 'info', 'hello')
      expect(createNotificationMock).toHaveBeenCalledWith({
        data: { discordID: 'd1', type: 'info', message: 'hello' },
      })
    })
  })

  describe('todoControllers', () => {
    it('responds with 501 Not Implemented', () => {
      const send = vi.fn()
      const status = vi.fn(() => ({ send }))
      const res = { status } as any
      todoControllers({} as any, res)
      expect(status).toHaveBeenCalledWith(501)
      expect(send).toHaveBeenCalledWith({ error: 'Not Implemented' })
    })
  })

  describe('versionComparator', () => {
    it('returns 0 for equal versions', () => {
      expect(versionComparator('1.0.0', '1.0.0')).toBe(0)
    })

    it('strips a leading "v" from version1', () => {
      expect(versionComparator('v1.0.1', '1.0.0')).toBe(1)
    })

    it('strips a leading "v" from version2', () => {
      expect(versionComparator('1.0.0', 'v1.0.1')).toBe(-1)
    })

    it('returns 1 when version1 is greater at some character', () => {
      expect(versionComparator('2.0.0', '1.0.0')).toBe(1)
    })

    it('returns -1 when version1 is lesser at some character', () => {
      expect(versionComparator('1.0.0', '2.0.0')).toBe(-1)
    })
  })

  describe('lastGmodIntegrationTag refresh interval', () => {
    it('refreshes the tag from the GitHub API every 10 minutes', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => [{ name: 'v9.9.9' }] }))
      await vi.advanceTimersByTimeAsync(1000 * 60 * 10)
      const { lastGmodIntegrationTag } = await import('../../src/utils/tools.js')
      expect(lastGmodIntegrationTag).toBe('v9.9.9')
    })

    it('falls back to "Unknown" and logs when the fetch fails', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      await vi.advanceTimersByTimeAsync(1000 * 60 * 10)
      const { lastGmodIntegrationTag } = await import('../../src/utils/tools.js')
      expect(lastGmodIntegrationTag).toBe('Unknown')
      expect(errorSpy).toHaveBeenCalled()
    })
  })
})
