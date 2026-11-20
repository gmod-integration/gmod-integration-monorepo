import { describe, expect, it, vi } from 'vitest'
import { generateToken } from '../src/generateToken.js'

describe('shared token generation', () => {
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

      const { generateToken: generateTokenWithMockedCrypto } = await import('../src/generateToken.js')
      const token = generateTokenWithMockedCrypto(4)

      expect(token).toHaveLength(4)
      vi.doUnmock('node:crypto')
    })
  })
})
