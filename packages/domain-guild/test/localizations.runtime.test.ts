import { describe, expect, it, vi } from 'vitest'
import { getTranslate } from '../src/localizations.js'

describe('installed guild translations', () => {
  it('resolves real guild strings independently of the application working directory', async () => {
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue('/tmp/discord-runtime')
    try {
      await expect(getTranslate('name', 'fr')).resolves.toBe('Nom')
      await expect(getTranslate('name', 'zz')).resolves.toBe('Name')
    } finally {
      cwd.mockRestore()
    }
  })
})
