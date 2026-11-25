import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
})
describe('theme preference across authenticated tabs', () => {
  it('follows the system in auto mode and adopts another tab preference without rewriting storage', async () => {
    vi.resetModules()
    let systemChanged!: (event: { matches: boolean }) => void
    const media = {
      matches: false,
      addEventListener: vi.fn((_event, listener) => {
        systemChanged = listener
      }),
    }
    vi.spyOn(window, 'matchMedia').mockReturnValue(media as unknown as MediaQueryList)
    const register = vi.spyOn(window, 'addEventListener')
    const theme = await import('../../src/utils/theme.js')
    const storageListener = register.mock.calls.find(([name]) => name === 'storage')![1]
    try {
      theme.setThemeMode('auto')
      systemChanged({ matches: true })
      expect(theme.resolvedTheme()).toBe('dark')
      const write = vi.spyOn(localStorage, 'setItem')
      window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated', newValue: 'dark' }))
      expect(theme.themeMode()).toBe('auto')
      window.dispatchEvent(new StorageEvent('storage', { key: 'theme', newValue: 'light' }))
      expect(theme.resolvedTheme()).toBe('light')
      expect(document.documentElement).toHaveAttribute('data-theme', 'light')
      expect(write).not.toHaveBeenCalled()
      window.dispatchEvent(new StorageEvent('storage', { key: 'theme', newValue: null }))
      expect(theme.themeMode()).toBe('auto')
      expect(theme.resolvedTheme()).toBe('dark')
    } finally {
      window.removeEventListener('storage', storageListener)
    }
  })
  it('keeps the local preference usable when browser storage is blocked', async () => {
    vi.resetModules()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Storage blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage blocked')
    })
    const register = vi.spyOn(window, 'addEventListener')
    const theme = await import('../../src/utils/theme.js')
    const storageListener = register.mock.calls.find(([name]) => name === 'storage')![1]
    try {
      expect(theme.themeMode()).toBe('auto')
      expect(() => theme.setThemeMode('dark')).not.toThrow()
      expect(theme.resolvedTheme()).toBe('dark')
      expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    } finally {
      window.removeEventListener('storage', storageListener)
    }
  })
})
